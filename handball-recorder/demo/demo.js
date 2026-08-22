// 試合データデモ。公開 JSON を取得し、Rust 製コアを WebAssembly でブラウザ内実行して
// スタッツ / タイムラインを組み立てる（サーバー不要 = サーバーレス）。
//
// UI はアプリ「ハンド記録」の記録画面に寄せる: YouTube 動画を埋め込み、得点タイムラインの
// 行をタップすると動画がそのシーン（各得点の動画位置 = videoClock）へジャンプする。
//
// 表示する試合は `?match=<slug>`（#211。同じ URL をアプリが Universal Links で受ける）。
// 配信 45 件のうち動画つきは 2 件で、残り 43 件は動画を持たない（動画なしは動画枠を隠す）。
//
// 注意: ローカル（`http://127.0.0.1`）では、公開 URL なら再生できる動画が onError 150 で
// 落ちることがある。埋め込み可否の判断は公開 URL で行う（詳細は README「localhost では
// 埋め込みが弾かれる動画がある」）。
//
// wasm の公開面は requiredIdCount / buildMatchView。ID 生成はシェル（この JS）が
// crypto.randomUUID() で行う — コアは UUID を生成しない（handball-toolkit 設計不変条件 2）。

import init, { requiredIdCount, buildMatchView } from './wasm/handball_toolkit_wasm.js';

// 配信データの公開 URL（アプリと同一ソース。raw は CORS `*` + Fastly CDN）。
const RAW_BASE = 'https://raw.githubusercontent.com/kinjo-ryura/handball-sample-matches/main/v2';

// `?match=<slug>` で配信済みの任意の試合を開く（#211）。指定が無ければ既定の 1 試合。
// 既定は埋め込み再生が有効な動画試合にしておく（初見の体験を最良にするため）。
const DEFAULT_SLUG = '2025-12-20-f352ea46';

// slug は取得 URL のパスに埋め込むため、経路離脱（`../`）を防ぐ形で検証する。
// 配信中の 45 件はすべてこの形（英数字と `-` のみ・最長 46）。
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

// URL から表示する slug を決める。形式が不正なら null（= 「見つかりません」へ）。
function requestedSlug() {
    const raw = new URLSearchParams(location.search).get('match');
    if (!raw) return DEFAULT_SLUG;
    return SLUG_PATTERN.test(raw) ? raw : null;
}

// エラーコード → ユーザー向け日本語（ADR 0002 決定 3: 文言はコアに焼き込まず、シェルが持つ）。
const ERROR_MESSAGES = {
    invalidJson: '試合データの形式を読み取れませんでした（データが壊れている可能性があります）。',
    decode: '試合データの内容を変換できませんでした。',
    insufficientNewIds: '内部エラーが発生しました（ID の生成数が不足）。',
    invalidUuid: '内部エラーが発生しました（ID の形式が不正）。',
};
const NETWORK_MESSAGE = 'データの取得に失敗しました。ネットワーク接続を確認して、もう一度お試しください。';
const GENERIC_MESSAGE = '予期しないエラーが発生しました。';
const NOT_FOUND_MESSAGE = 'この試合は見つかりませんでした。URL が正しくないか、配信が終了した可能性があります。';

// ネットワーク由来の失敗を型で区別するためのマーカー。
// status は HTTP ステータス（接続自体に失敗したときは null）。404 を「見つかりません」に
// 振り分けるために持つ。
class FetchError extends Error {
    constructor(url, status) {
        super(status ? url + ' (' + status + ')' : url);
        this.status = status || null;
    }
}

const els = {
    status: document.getElementById('demo-status'),
    result: document.getElementById('demo-result'),
    videoWrap: document.getElementById('demo-video-wrap'),
    videoMount: document.getElementById('demo-video-mount'),
};

async function fetchText(url) {
    let res;
    try {
        res = await fetch(url, { cache: 'no-cache' });
    } catch (_) {
        throw new FetchError(url, null);
    }
    if (!res.ok) {
        throw new FetchError(url, res.status);
    }
    return res.text();
}

// 例外 → ユーザー向け日本語。診断用の生メッセージは console に残す。
export function describeError(err) {
    console.error('[demo]', err);
    if (err instanceof FetchError) {
        return { message: NETWORK_MESSAGE, detail: String(err.message) };
    }
    if (err && typeof err.message === 'string') {
        try {
            const parsed = JSON.parse(err.message);
            if (parsed && parsed.code && ERROR_MESSAGES[parsed.code]) {
                return { message: ERROR_MESSAGES[parsed.code], detail: err.message };
            }
        } catch (_) {
            // JSON でなければ generic へ落とす。
        }
    }
    return { message: GENERIC_MESSAGE, detail: err && err.message ? String(err.message) : String(err) };
}

function setStatus(text) {
    els.status.textContent = text;
    els.status.style.display = text ? '' : 'none';
}

function showError(err) {
    const { message, detail } = describeError(err);
    els.result.innerHTML = '';
    setStatus('');
    const box = document.createElement('div');
    box.className = 'demo-error';
    box.textContent = message;
    if (detail) {
        const d = document.createElement('span');
        d.className = 'detail';
        d.textContent = detail;
        box.appendChild(d);
    }
    els.result.appendChild(box);
}

// ── YouTube IFrame Player（動画の埋め込みとシーク）──
// GitHub Pages（サンドボックスなし）なので外部 API スクリプトの読み込みに CSP 制約はない。

let ytApiPromise = null;
function loadYouTubeApi() {
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve) => {
        if (window.YT && window.YT.Player) {
            resolve(window.YT);
            return;
        }
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (typeof prev === 'function') prev();
            resolve(window.YT);
        };
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
    });
    return ytApiPromise;
}

let player = null;
let playerVideoId = null;

// 選択試合の動画を用意する。初回は Player を生成し、以降は cue で差し替える。
async function setupVideo(videoId) {
    if (!videoId) {
        els.videoWrap.hidden = true;
        return;
    }
    els.videoWrap.hidden = false;
    const YT = await loadYouTubeApi();
    if (player) {
        if (videoId !== playerVideoId) {
            player.cueVideoById(videoId);
            playerVideoId = videoId;
        }
        return;
    }
    await new Promise((resolve) => {
        player = new YT.Player(els.videoMount, {
            videoId,
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
            events: { onReady: () => resolve() },
        });
    });
    playerVideoId = videoId;
}

// 得点行のクリック → 動画をそのシーンへ（アプリの記録画面と同じ挙動）。
function seekTo(seconds) {
    if (!player) return;
    // 先にページ最上部（ヘッダーごと）まで戻して動画を見せる。
    // smooth だと直後の playVideo にアニメーションを打ち切られて途中で止まるため
    // instant にする。
    window.scrollTo({ top: 0 });
    player.seekTo(seconds, true);
    player.playVideo();
}

function onResultClick(event) {
    const row = event.target.closest('.tl-goal.seekable');
    if (!row || row.dataset.videoSec == null) return;
    seekTo(Number(row.dataset.videoSec));
}

// ── 表示整形（ラベル・並びはシェルが持つ。コアは素の数値を返す）──

function formatClock(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
}

// アプリのサマリ表記に合わせた「82% (41/50)」形式。
function rateWithFraction(goals, misses) {
    const attempts = goals + misses;
    if (attempts === 0) return '—';
    return Math.round((goals / attempts) * 100) + '% (' + goals + '/' + attempts + ')';
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

// 白い角丸カード（iOS grouped list のセクション）。title があれば見出しを載せる。
function card(title, ...children) {
    const c = el('div', 'demo-card');
    if (title) c.appendChild(el('h2', null, title));
    for (const ch of children) {
        if (ch) c.appendChild(ch);
    }
    return c;
}

// 何本目の regular phase かでラベルを決める（延長は N 本目、shootout は 7m）。
function phaseLabel(kind, regularCount) {
    if (kind === 'shootout') return '7m スローコンテスト';
    if (regularCount === 1) return '前半';
    if (regularCount === 2) return '後半';
    return '延長 ' + (regularCount - 2);
}

// 得点タイムライン（両サイド: ホーム左 / アウェイ右、時刻は中央）。
// 行をタップすると動画がその得点のシーン（videoClock）へ飛ぶ。
//
// resolvedFacts は時系列順とは限らない（型ごとにまとまる・phaseStart が途中に来る）ので、
// goal と phaseStart を resolved clock で並べ直してから描画する。
function renderTimeline(view, playersById) {
    const entries = [];
    view.timeline.resolvedFacts.forEach((rf, i) => {
        const payload = rf.fact.payload;
        const matchClock = rf.resolvedMatchClock ? rf.resolvedMatchClock.elapsedSeconds : null;
        const videoClock = rf.resolvedVideoClock ? rf.resolvedVideoClock.elapsedSeconds : null;
        const sort = matchClock != null ? matchClock : (videoClock != null ? videoClock : Infinity);
        if (payload.control && payload.control.phaseStart) {
            entries.push({ type: 'phase', kind: payload.control.phaseStart.kind, sort, i });
        } else if (payload.play && payload.play.kind === 'goal') {
            entries.push({ type: 'goal', play: payload.play, matchClock, videoClock, sort, i });
        }
    });
    entries.sort((a, b) => (a.sort - b.sort) || (a.i - b.i));

    const list = el('ul', 'timeline');
    let regularCount = 0;
    for (const e of entries) {
        if (e.type === 'phase') {
            if (e.kind === 'regular') regularCount += 1;
            list.appendChild(el('li', 'tl-phase', phaseLabel(e.kind, regularCount)));
            continue;
        }
        const isHome = e.play.teamId === view.homeTeam.id;
        const p = e.play.playerId ? playersById.get(e.play.playerId) : null;
        const label = p ? (p.jerseyNumber != null ? '#' + p.jerseyNumber + ' ' + p.name : p.name) : '得点';

        const li = el('li', 'tl-goal' + (e.videoClock != null ? ' seekable' : ''));
        if (e.videoClock != null) li.dataset.videoSec = String(Math.round(e.videoClock));

        const left = el('div', 'ev left');
        const right = el('div', 'ev right');
        const cell = isHome ? left : right;
        cell.appendChild(el('span', 'tl-check', '✓'));
        cell.appendChild(el('span', 'tl-name', label));

        li.append(left, el('div', 'tl-time', e.matchClock != null ? formatClock(e.matchClock) : ''), right);
        list.appendChild(li);
    }
    return list;
}

// ── 簡易サマリ（アプリ共有カード相当のコンパクト集計）──

// ラベル列 + 2 チーム列のスタッツ表（アプリの「チーム別」相当）。
function renderTeamTable(view) {
    const h = view.summary.homeTeam;
    const a = view.summary.awayTeam;
    const rows = [
        ['得点', String(h.goals), String(a.goals)],
        ['シュートミス', String(h.shotMisses), String(a.shotMisses)],
        ['シュート数', String(h.goals + h.shotMisses), String(a.goals + a.shotMisses)],
        ['成功率', rateWithFraction(h.goals, h.shotMisses), rateWithFraction(a.goals, a.shotMisses)],
    ];
    const table = el('table', 'stat-table');
    const thead = el('thead');
    const htr = el('tr');
    htr.append(el('th', null, ''), el('th', null, view.homeTeam.name), el('th', null, view.awayTeam.name));
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = el('tbody');
    for (const [label, hv, av] of rows) {
        const tr = el('tr');
        tr.append(el('th', null, label), el('td', null, hv), el('td', null, av));
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
}

export function render(view) {
    const playersById = new Map(view.players.map((p) => [p.id, p]));
    els.result.innerHTML = '';
    const frag = document.createDocumentFragment();

    // ── 記録画面 ──
    // ラベルはカードの外（上）に置いて各セクションで揃える（タイムラインは
    // スクロールするので特に外に出す必要がある）。
    frag.appendChild(el('h2', 'section-label', '得点シーン'));
    const timelineCard = card(null, renderTimeline(view, playersById));
    timelineCard.classList.add('timeline-card');
    frag.appendChild(timelineCard);

    // ── 簡易サマリ ──
    frag.appendChild(el('h2', 'section-label', 'スタッツ'));
    frag.appendChild(card(null, renderTeamTable(view)));

    els.result.appendChild(frag);
    setStatus('');
}

// 見つからない slug（タイポ・配信終了・形式が不正）。行き止まりにせず配信中の一覧を出す。
async function showNotFound() {
    els.result.innerHTML = '';
    els.videoWrap.hidden = true;
    setStatus('');
    els.result.appendChild(el('div', 'demo-error', NOT_FOUND_MESSAGE));

    let matches;
    try {
        matches = JSON.parse(await fetchText(RAW_BASE + '/index.json')).matches;
    } catch (err) {
        // 一覧も引けないときは案内だけで終える（エラーを二重に出さない）。
        console.error('[demo]', err);
        return;
    }
    const list = el('ul', 'match-list');
    for (const m of matches) {
        const li = el('li');
        const a = el('a', null, m.displayName + '（' + m.homeScore + '–' + m.awayScore + '）');
        a.href = '?match=' + encodeURIComponent(m.slug);
        li.appendChild(a);
        if (m.hasVideo) li.appendChild(el('span', 'badge', '動画あり'));
        list.appendChild(li);
    }
    els.result.appendChild(card('配信中の試合', list));
}

async function loadMatch(slug) {
    if (!slug) {
        await showNotFound();
        return;
    }
    setStatus('試合データを読み込み中…');
    els.result.innerHTML = '';

    let json;
    try {
        json = await fetchText(RAW_BASE + '/matches/' + slug + '.json');
    } catch (err) {
        // 404 は「その試合が無い」。通信断（status なし）と混ぜない。
        if (err instanceof FetchError && err.status === 404) {
            await showNotFound();
        } else {
            showError(err);
        }
        return;
    }

    let view;
    try {
        // ID 生成はシェル側（コアは UUID を生成しない）。
        const count = requiredIdCount(json);
        const ids = Array.from({ length: count }, () => crypto.randomUUID());
        view = JSON.parse(buildMatchView(slug, json, ids));
    } catch (err) {
        showError(err);
        return;
    }

    // 先に本文を描く。動画の用意は YouTube の応答に依存する外部要因なので、
    // スタッツ / タイムラインの表示をそれに巻き込まない。
    render(view);
    const video = view.match.configuration.video;
    try {
        await setupVideo(video ? video.externalId : null);
    } catch (err) {
        // 動画が用意できなくても本文は読める状態を保つ。
        console.error('[demo]', err);
        els.videoWrap.hidden = true;
    }
}

async function main() {
    setStatus('WebAssembly を初期化中…');
    try {
        await init();
    } catch (err) {
        showError(err);
        return;
    }

    els.result.addEventListener('click', onResultClick);
    await loadMatch(requestedSlug());
}

// ブラウザでのみ自動起動する（Node からは export された関数を単体検証に使う）。
if (typeof window !== 'undefined') {
    main();
}
