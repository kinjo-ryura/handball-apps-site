// 試合データデモ。公開 JSON を取得し、Rust 製コアを WebAssembly でブラウザ内実行して
// スタッツ / タイムラインを組み立てる（サーバー不要 = サーバーレス）。
//
// UI はアプリ「ハンド記録」の記録画面に寄せる: YouTube 動画を埋め込み、得点タイムラインの
// 行をタップすると動画がそのシーン（各得点の動画位置 = videoClock）へジャンプする。
//
// wasm の公開面は requiredIdCount / buildMatchView。ID 生成はシェル（この JS）が
// crypto.randomUUID() で行う — コアは UUID を生成しない（handball-toolkit 設計不変条件 2）。

import init, { requiredIdCount, buildMatchView } from './wasm/handball_toolkit_wasm.js';

// 配信データの公開 URL（アプリと同一ソース。raw は CORS `*` + Fastly CDN）。
const RAW_BASE = 'https://raw.githubusercontent.com/kinjo-ryura/handball-sample-matches/main/v2';

// 表示する試合（当面は固定 1 試合）。埋め込み再生が有効な唯一の動画試合。
// 埋め込み可能な試合が増えたら / onError フォールバックを入れたらセレクタを戻す（#96）。
const DEMO_SLUG = '2025-12-20-f352ea46';

// エラーコード → ユーザー向け日本語（ADR 0002 決定 3: 文言はコアに焼き込まず、シェルが持つ）。
const ERROR_MESSAGES = {
    invalidJson: '試合データの形式を読み取れませんでした（データが壊れている可能性があります）。',
    decode: '試合データの内容を変換できませんでした。',
    insufficientNewIds: '内部エラーが発生しました（ID の生成数が不足）。',
    invalidUuid: '内部エラーが発生しました（ID の形式が不正）。',
};
const NETWORK_MESSAGE = 'データの取得に失敗しました。ネットワーク接続を確認して、もう一度お試しください。';
const GENERIC_MESSAGE = '予期しないエラーが発生しました。';

// ネットワーク由来の失敗を型で区別するためのマーカー。
class FetchError extends Error {}

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
        throw new FetchError(url);
    }
    if (!res.ok) {
        throw new FetchError(url + ' (' + res.status + ')');
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
async function showVideo(videoId) {
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

async function loadMatch(slug) {
    if (!slug) return;
    setStatus('試合データを読み込み中…');
    els.result.innerHTML = '';
    try {
        const json = await fetchText(RAW_BASE + '/matches/' + slug + '.json');
        // ID 生成はシェル側（コアは UUID を生成しない）。
        const count = requiredIdCount(json);
        const ids = Array.from({ length: count }, () => crypto.randomUUID());
        const view = JSON.parse(buildMatchView(slug, json, ids));
        const video = view.match.configuration.video;
        await showVideo(video ? video.externalId : null);
        render(view);
    } catch (err) {
        showError(err);
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
    await loadMatch(DEMO_SLUG);
}

// ブラウザでのみ自動起動する（Node からは export された関数を単体検証に使う）。
if (typeof window !== 'undefined') {
    main();
}
