// 試合データデモ。公開 JSON を取得し、Rust 製コアを WebAssembly でブラウザ内実行して
// スタッツ / タイムラインを組み立てる（サーバー不要 = サーバーレス）。
//
// UI はアプリ「ハンド記録」の記録画面に寄せる: YouTube 動画を埋め込み、タイムラインの
// 行をタップすると動画がそのシーン（記録の動画位置 = videoClock）へジャンプする。
//
// 表示する対象は `?match=<slug>`（試合。#211。同じ URL をアプリが Universal Links で受ける）と
// `?highlight=<slug>`（ハイライト。#232）。試合は配信 45 件のうち動画つきが 2 件で、残り 43 件は
// 動画を持たない（動画なしは動画枠を隠す）。ハイライトは 6 件すべて動画つき。
//
// 試合とハイライトでクエリパラメータを分けているのは、配信上も別コレクション
// （`/v2/matches/` と `/v2/highlights/`）で slug の名前空間が独立しているため。1 つの
// パラメータに相乗りさせると、将来同じ slug が両方に現れたときにどちらを指すのか決められない
// （アプリも「自分の試合 / 注目の試合 / ハイライト」を別コレクションとして扱う）。
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

// 配信コレクション。URL のクエリパラメータ・取得パス・一覧の見出しが 1 対 1 で対応する。
const MATCH = { kind: 'match', param: 'match', path: '/matches/', indexPath: '/index.json' };
const HIGHLIGHT = { kind: 'highlight', param: 'highlight', path: '/highlights/', indexPath: '/highlights/index.json' };

// slug は取得 URL のパスに埋め込むため、経路離脱（`../`）を防ぐ形で検証する。
// 配信中の 45 試合 / 6 ハイライトはすべてこの形（英数字と `-` のみ・最長 46）。
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

// URL から表示する対象を決める。形式が不正なら slug を null にして返す（= 「見つかりません」へ）。
// source は「どちらを訊かれたか」で、文言の主語に使う。
// `?highlight=` を先に見るので、両方指定されたときはハイライトが勝つ。
function requestedTarget() {
    const params = new URLSearchParams(location.search);
    for (const source of [HIGHLIGHT, MATCH]) {
        const raw = params.get(source.param);
        if (raw) return { source, slug: SLUG_PATTERN.test(raw) ? raw : null };
    }
    return { source: MATCH, slug: DEFAULT_SLUG };
}

// 得点行をタップしたとき、記録時刻そのものではなく少し手前から流す秒数。
// **これが効くのは試合ページだけ**。ハイライトの行タップは通し再生の入口になったので、
// 下の PLAYBACK_LEAD_IN_SECONDS（4 秒）でクリップ頭へ飛ぶ。
// アプリ（ハンド記録）の seekOffsetSeconds と同じ既定値 3 秒
// （AppConstants.Recording.defaultSeekOffsetSeconds / UserDefaultsSettingsClient.defaultSeekOffset）。
// アプリは設定画面で 0〜10 秒に変えられるが、デモは設定 UI を持たないので固定値。
// 変えるならアプリ側の既定と揃えること（挙動を一致させるのがこの値の目的）。
const SEEK_OFFSET_SECONDS = 3;

// ハイライトの通し再生（アプリの「すべて再生」）のクリップ長とポーリング間隔。
// アプリの AppConstants.Recording.defaultPlaybackLeadInSeconds / defaultPlaybackTailSeconds と
// 同値で、**行タップのオフセット（上の 3 秒）とは別の定数**（アプリでも別々に持っている。
// 「そのシーンへ飛ぶ」と「名場面を繋いで見る」で必要な助走が違うため）。
// アプリ側の既定を変えたらここも揃えること。
const PLAYBACK_LEAD_IN_SECONDS = 4;
const PLAYBACK_TAIL_SECONDS = 2;
// 再生位置の監視間隔。アプリの PlayerShotsPlaybackViewV2 の clockPollTask と同じ 250ms。
const PLAYBACK_POLL_MS = 250;
// シーク完了前のポーリング値で誤って次のクリップへ進まないためのガード窓（アプリと同じ 1 秒）。
const SEEK_SETTLE_WINDOW_SECONDS = 1;

// エラーコード → ユーザー向け日本語（ADR 0002 決定 3: 文言はコアに焼き込まず、シェルが持つ）。
const ERROR_MESSAGES = {
    invalidJson: '試合データの形式を読み取れませんでした（データが壊れている可能性があります）。',
    decode: '試合データの内容を変換できませんでした。',
    insufficientNewIds: '内部エラーが発生しました（ID の生成数が不足）。',
    invalidUuid: '内部エラーが発生しました（ID の形式が不正）。',
};
const NETWORK_MESSAGE = 'データの取得に失敗しました。ネットワーク接続を確認して、もう一度お試しください。';
const GENERIC_MESSAGE = '予期しないエラーが発生しました。';
// 「見つかりません」の主語は訊かれたコレクションで変える。
const NOT_FOUND_MESSAGES = {
    match: 'この試合は見つかりませんでした。URL が正しくないか、配信が終了した可能性があります。',
    highlight: 'このハイライトは見つかりませんでした。URL が正しくないか、配信が終了した可能性があります。',
};

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
// 用意できた動画 ID を返す（呼び出し側が「動画がある」ことの判定に使う）。動画なしは null。
async function setupVideo(videoId) {
    if (!videoId) {
        els.videoWrap.hidden = true;
        return null;
    }
    els.videoWrap.hidden = false;
    const YT = await loadYouTubeApi();
    if (player) {
        if (videoId !== playerVideoId) {
            player.cueVideoById(videoId);
            playerVideoId = videoId;
        }
        return videoId;
    }
    await new Promise((resolve) => {
        player = new YT.Player(els.videoMount, {
            videoId,
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
            events: { onReady: () => resolve() },
        });
    });
    playerVideoId = videoId;
    return videoId;
}

// タイムライン行のクリック → 動画をそのシーンへ（アプリの記録画面と同じ挙動）。
// seconds は再生を始める絶対位置。オフセットは呼び出し側で引く（アプリが
// seekToFact で引いているのと同じ切り分け）。
function seekPlayer(seconds) {
    if (!player) return false;
    player.seekTo(seconds, true);
    player.playVideo();
    return true;
}

function seekTo(seconds) {
    if (!player) return;
    // 先にページ最上部（ヘッダーごと）まで戻して動画を見せる。
    // smooth だと直後の playVideo にアニメーションを打ち切られて途中で止まるため
    // instant にする。
    // 通し再生の内部シーク（seekPlayer 直呼び）ではここを通さない — クリップが変わるたびに
    // ページが跳ねると、シーン一覧を追えなくなるため。
    window.scrollTo({ top: 0 });
    seekPlayer(seconds);
}

function onResultClick(event) {
    // 試合の得点行（.tl-goal）とハイライトのシーン行（.tl-scene）の両方が対象。
    const row = event.target.closest('.seekable');
    if (!row || row.dataset.videoSec == null) return;

    // ハイライトの行は「そのシーンから続けて見る」— 通し再生をその位置から始める。
    // 選んだ 1 本を見て終わりではなく、そこから後続の名場面へ繋がるのがハイライトの見方で、
    // 一覧はその入口という位置づけ（**アプリとは意図的に違う**。アプリは「すべて再生」が
    // 別画面なので、行タップは単発シークで済む）。
    const index = row.dataset.factId ? clipIndexOfFact(row.dataset.factId) : -1;
    if (index >= 0 && startPlayAll(index)) return;

    // 試合（通し再生を持たない）はここまでどおり単発シーク。
    stopPlayAll();
    seekTo(Math.max(0, Number(row.dataset.videoSec) - SEEK_OFFSET_SECONDS));
}

// ── 通し再生（アプリの「すべて再生」）──
//
// アプリの `PlayerShotsPlaybackControllerV2` の移植。ハイライトモードの体験そのものは
// **間を飛ばして名場面だけを繋いで見ること**で、行タップの単発シークでは代替できない。
//
// 各シーンを `videoClock - LEAD_IN` 〜 `videoClock + TAIL` のクリップにし、再生位置を
// 250ms ごとに見て、クリップ末尾を超えたら次のクリップ頭へシークする。最後まで行ったら止める。
// 対象は goal / shotMissed / freeNote の全 play fact（アプリの allHighlightsOf と同じ範囲で、
// シーン一覧に出している行とちょうど一致する）。
const playAll = {
    clips: [],
    index: 0,
    state: 'idle', // 'idle' | 'playing' | 'finished'
    lastSeekTo: null,
    timer: null,
    button: null,
};

// resolvedFacts → クリップ列（開始位置の昇順）。動画位置を持たない fact は載せない。
function buildClips(view) {
    return view.timeline.resolvedFacts
        .filter((rf) => rf.fact.payload.play && rf.resolvedVideoClock)
        .map((rf) => ({
            factId: rf.fact.id,
            start: Math.max(0, rf.resolvedVideoClock.elapsedSeconds - PLAYBACK_LEAD_IN_SECONDS),
            end: rf.resolvedVideoClock.elapsedSeconds + PLAYBACK_TAIL_SECONDS,
        }))
        .sort((a, b) => a.start - b.start);
}

// 再生中のクリップに対応する行を強調し、カード内スクロールで見える位置へ運ぶ。
function markPlayingRow() {
    for (const li of els.result.querySelectorAll('.tl-scene.playing')) li.classList.remove('playing');
    if (playAll.state !== 'playing') return;
    const clip = playAll.clips[playAll.index];
    if (!clip) return;
    const li = els.result.querySelector('.tl-scene[data-fact-id="' + clip.factId + '"]');
    if (!li) return;
    li.classList.add('playing');
    // カード内だけを動かす（ページ全体をスクロールさせない）。
    const card = li.closest('.timeline-card');
    if (card) {
        // カードが position: relative なので offsetTop はカード内の相対位置になる。
        const top = li.offsetTop - card.clientHeight / 2 + li.clientHeight / 2;
        card.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
}

function syncPlayAllButton() {
    const b = playAll.button;
    if (!b) return;
    if (playAll.state === 'playing') {
        b.textContent = '停止（' + (playAll.index + 1) + ' / ' + playAll.clips.length + '）';
        b.classList.add('playing');
    } else {
        b.textContent = 'すべて再生（' + playAll.clips.length + ' シーン）';
        b.classList.remove('playing');
    }
}

function seekToCurrentClip() {
    const clip = playAll.clips[playAll.index];
    playAll.lastSeekTo = clip.start;
    seekPlayer(clip.start);
    markPlayingRow();
    syncPlayAllButton();
}

// 再生位置を見て、クリップ末尾を超えていたら次へ。シーク直後のガード窓では何もしない
// （まだ前の位置を返しているポーリング値で誤って進めないため）。
function playAllTick() {
    if (playAll.state !== 'playing' || !player) return;
    const now = typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : null;
    if (typeof now !== 'number' || Number.isNaN(now)) return;
    if (playAll.lastSeekTo != null && now < playAll.lastSeekTo - SEEK_SETTLE_WINDOW_SECONDS) return;
    if (now < playAll.clips[playAll.index].end) return;
    if (playAll.index + 1 < playAll.clips.length) {
        playAll.index += 1;
        seekToCurrentClip();
    } else {
        finishPlayAll();
    }
}

// fromIndex 省略で先頭から。開始できたら true（呼び出し側のフォールバック判定に使う）。
function startPlayAll(fromIndex) {
    if (!playAll.clips.length || !player) return false;
    const index = Number.isInteger(fromIndex) ? fromIndex : 0;
    if (index < 0 || index >= playAll.clips.length) return false;
    playAll.state = 'playing';
    playAll.index = index;
    window.scrollTo({ top: 0 });
    seekToCurrentClip();
    clearInterval(playAll.timer);
    playAll.timer = setInterval(playAllTick, PLAYBACK_POLL_MS);
    return true;
}

// 行 → クリップ列の位置。見つからなければ -1。
function clipIndexOfFact(factId) {
    return playAll.clips.findIndex((c) => c.factId === factId);
}

// 停止（手動介入 / 再描画）。動画は止めない — 行タップからの復帰で二重操作になるため、
// 一時停止するのは最後まで見終わったときだけ（下の finishPlayAll）。
function stopPlayAll() {
    clearInterval(playAll.timer);
    playAll.timer = null;
    if (playAll.state === 'playing') playAll.state = 'idle';
    playAll.lastSeekTo = null;
    markPlayingRow();
    syncPlayAllButton();
}

// 最後のクリップまで見終わった。アプリは画面を閉じるが、デモは一覧に戻る先が無いので
// その場で一時停止して待つ。
function finishPlayAll() {
    clearInterval(playAll.timer);
    playAll.timer = null;
    playAll.state = 'finished';
    playAll.lastSeekTo = null;
    if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
    markPlayingRow();
    syncPlayAllButton();
}

function onPlayAllClick() {
    if (playAll.state === 'playing') stopPlayAll();
    else startPlayAll();
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

// セクション見出し。note があれば右端に添える（時刻の種別など、列の意味の補足）。
function sectionLabel(text, note) {
    const h = el('h2', 'section-label' + (note ? ' with-note' : ''), null);
    h.appendChild(el('span', null, text));
    if (note) h.appendChild(el('span', 'section-note', note));
    return h;
}

// 何本目の regular phase かでラベルを決める（延長は N 本目、shootout は 7m）。
function phaseLabel(kind, regularCount) {
    if (kind === 'shootout') return '7m スローコンテスト';
    if (regularCount === 1) return '前半';
    if (regularCount === 2) return '後半';
    return '延長 ' + (regularCount - 2);
}

// 記録種別の日本語名。**アプリと同じ語に揃えること**が目的の定数で、出典は
// `RecorderUIShared/PlayEventKindLabel.swift`（文言はコアに焼き込まずシェルが持つ = ADR 0002
// 決定 3。デモは Swift シェルとは別言語なので写しを持たざるを得ない）。
// アプリ側の語を変えたらここも揃えること — SEEK_OFFSET_SECONDS と同じ扱い。
const PLAY_KIND_LABELS = {
    goal: '得点',
    shotMissed: 'シュートミス',
    freeNote: 'メモ',
    yellowCard: 'イエローカード',
    twoMinuteSuspension: '2分間退場',
    redCard: 'レッドカード',
};

// 選手の表示名（背番号があれば前置。アプリのイベント行と同じ `#N 名前`）。
function playerLabel(player) {
    if (!player) return null;
    return player.jerseyNumber != null ? '#' + player.jerseyNumber + ' ' + player.name : player.name;
}

// ハイライトのシーン一覧（1 列。全行が動画のその位置へ飛べる）。
//
// 試合の得点タイムラインを流用しない理由が 2 つある:
// - **ハイライトは得点だけではない**。記録の過半が freeNote（ナイスパス等）の回もあり、
//   得点に絞ると 30 シーン中 6 行しか出ない。種別ラベルを付けて全 play fact を並べる。
// - **両サイド表示が成立しない**。ハイライトは片チームの選手だけを取り上げるので
//   アウェイ列が常に空になり、phase を持たないので中央の試合時計も常に空になる。
//
// 時刻は試合時計ではなく**動画の位置**を出す（ハイライトが持つ唯一の時刻情報で、
// 「動画の 4:22 のシーン」として意味がある）。
function renderSceneTimeline(view, playersById) {
    const scenes = [];
    view.timeline.resolvedFacts.forEach((rf, i) => {
        const play = rf.fact.payload.play;
        if (!play) return;
        const videoClock = rf.resolvedVideoClock ? rf.resolvedVideoClock.elapsedSeconds : null;
        scenes.push({ play, videoClock, factId: rf.fact.id, sort: videoClock != null ? videoClock : Infinity, i });
    });
    scenes.sort((a, b) => (a.sort - b.sort) || (a.i - b.i));

    const list = el('ul', 'timeline');
    for (const s of scenes) {
        const li = el('li', 'tl-scene' + (s.videoClock != null ? ' seekable' : ''));
        if (s.videoClock != null) li.dataset.videoSec = String(Math.round(s.videoClock));
        // 通し再生中のクリップから対応する行を引くための鍵。
        li.dataset.factId = s.factId;

        const kindLabel = PLAY_KIND_LABELS[s.play.kind] || s.play.kind;
        const chip = el('span', 'tl-kind' + (s.play.kind === 'goal' ? ' goal' : ''), kindLabel);
        // freeNote は見出し（title）を付けられる。選手名の代わりではなく併記する
        // （誰のシーンかは種別によらず知りたい情報なので、title があっても落とさない）。
        const name = playerLabel(s.play.playerId ? playersById.get(s.play.playerId) : null);
        const text = [name, s.play.title].filter(Boolean).join('・');

        li.append(chip, el('span', 'tl-name', text), el('span', 'tl-time', s.videoClock != null ? formatClock(s.videoClock) : ''));
        list.appendChild(li);
    }
    return list;
}

// ハイライトの選手別スタッツ（アプリの「選手別」相当）。
//
// チーム別の表を使わない理由: ハイライトは試合の全 fact を持たないので、チーム列に出る数字は
// **試合スコアではなく「このハイライトに写っている得点数」**。両チーム列で並べると
// 「6–0 で勝った試合」に見えてしまう。取り上げられている選手の記録として出すのが実態に合う。
function renderPlayerTable(view, playersById) {
    const stats = view.summary.playerStats.filter((s) => s.goals > 0 || s.shotMisses > 0);
    if (stats.length === 0) return null;
    stats.sort((a, b) => (b.goals - a.goals) || (b.shotMisses - a.shotMisses));

    const table = el('table', 'stat-table by-player');
    const thead = el('thead');
    const htr = el('tr');
    htr.append(el('th', null, '選手'), el('th', null, '得点'), el('th', null, 'シュートミス'), el('th', null, '成功率'));
    thead.appendChild(htr);
    table.appendChild(thead);
    const tbody = el('tbody');
    for (const s of stats) {
        const tr = el('tr');
        tr.append(
            el('th', null, playerLabel(playersById.get(s.playerId)) || '選手'),
            el('td', null, String(s.goals)),
            el('td', null, String(s.shotMisses)),
            el('td', null, rateWithFraction(s.goals, s.shotMisses)),
        );
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
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
        const label = playerLabel(e.play.playerId ? playersById.get(e.play.playerId) : null) || '得点';

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

// 「2026年4月10日」。ハイライトは切り抜きなので、どの試合のものかを日付で補う。
function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

// ハイライトは「何のハイライトか」が本文から読み取れないので見出しを出す
// （試合は対戦カードがスタッツ表のヘッダに出るため付けない）。
function renderHighlightHeading(view) {
    const frag = document.createDocumentFragment();
    frag.appendChild(el('h1', 'demo-title', view.match.title));
    const parts = [view.homeTeam.name + ' vs ' + view.awayTeam.name, formatDate(view.match.date)].filter(Boolean);
    frag.appendChild(el('p', 'demo-subtitle', parts.join('・')));
    return frag;
}

// kind は 'match' / 'highlight'（MATCH / HIGHLIGHT の kind）。既定は試合。
export function render(view, kind) {
    const isHighlight = kind === HIGHLIGHT.kind;
    const playersById = new Map(view.players.map((p) => [p.id, p]));
    // 前の描画の通し再生が残っていると、消えた行を指したまま回り続ける。
    stopPlayAll();
    els.result.innerHTML = '';
    const frag = document.createDocumentFragment();

    if (isHighlight) frag.appendChild(renderHighlightHeading(view));

    // ── 通し再生 ──
    // 動画の直下（シーン一覧の上）に置く。ハイライトの主動線はシーンを繋いで見ることで、
    // 一覧は「そこから拾い読みする」補助という位置づけ。
    // 動画が用意できるまでは押せない（loadTarget が setupVideo の後で有効化する）。
    playAll.clips = isHighlight ? buildClips(view) : [];
    playAll.state = 'idle';
    playAll.index = 0;
    playAll.button = null;
    if (playAll.clips.length) {
        const b = el('button', 'play-all', null);
        b.type = 'button';
        b.disabled = true;
        b.addEventListener('click', onPlayAllClick);
        playAll.button = b;
        syncPlayAllButton();
        const bar = el('div', 'play-all-bar');
        bar.appendChild(b);
        frag.appendChild(bar);
    }

    // ── 記録画面 ──
    // ラベルはカードの外（上）に置いて各セクションで揃える（タイムラインは
    // スクロールするので特に外に出す必要がある）。
    // ハイライトの時刻は試合時計ではなく動画の位置なので、その旨を添える。同じ書式の数字が
    // 試合時間にも動画時間にも見えると誤読するため（アプリの EventRowView.formattedTime が
    // 「もう一方の時計へ fallback しない」としているのと同じ理由）。
    frag.appendChild(sectionLabel(isHighlight ? 'シーン' : '得点シーン', isHighlight ? '時刻は動画時間' : null));
    const timelineCard = card(null, isHighlight ? renderSceneTimeline(view, playersById) : renderTimeline(view, playersById));
    timelineCard.classList.add('timeline-card');
    frag.appendChild(timelineCard);

    // ── 簡易サマリ ──
    // ハイライトは試合の全 fact を持たないので「スタッツ」とは呼ばない（試合の集計ではない）。
    const table = isHighlight ? renderPlayerTable(view, playersById) : renderTeamTable(view);
    if (table) {
        frag.appendChild(sectionLabel(isHighlight ? 'このハイライトの記録' : 'スタッツ', null));
        frag.appendChild(card(null, table));
    }

    els.result.appendChild(frag);
    setStatus('');
}

// 配信中一覧のカード 1 枚を作る。引けなければ null（案内だけで終える）。
async function collectionCard(source, title, describe) {
    let items;
    try {
        const index = JSON.parse(await fetchText(RAW_BASE + source.indexPath));
        items = source === HIGHLIGHT ? index.highlights : index.matches;
        // 配信側の形が変わったとき、案内ごと落とさずそのカードだけ諦める。
        if (!Array.isArray(items)) throw new Error('index の形が想定と違う: ' + source.indexPath);
    } catch (err) {
        // 一覧が引けないときはそのカードを出さない（エラーを二重に出さない）。
        console.error('[demo]', err);
        return null;
    }
    const list = el('ul', 'match-list');
    for (const item of items) {
        const li = el('li');
        const a = el('a', null, describe(item));
        a.href = '?' + source.param + '=' + encodeURIComponent(item.slug);
        li.appendChild(a);
        if (item.hasVideo) li.appendChild(el('span', 'badge', '動画あり'));
        list.appendChild(li);
    }
    return card(title, list);
}

// 見つからない slug（タイポ・配信終了・形式が不正）。行き止まりにせず配信中の一覧を出す。
// 訊かれたコレクションを先に並べる（探していた側から復帰できるように）。
async function showNotFound(source) {
    els.result.innerHTML = '';
    els.videoWrap.hidden = true;
    setStatus('');
    els.result.appendChild(el('div', 'demo-error', NOT_FOUND_MESSAGES[source.kind]));

    const cards = [
        () => collectionCard(MATCH, '配信中の試合', (m) => m.displayName + '（' + m.homeScore + '–' + m.awayScore + '）'),
        // ハイライトは displayName が重複しうる（同じ選手・同じ対戦カードの別日）ので日付まで出す。
        () => collectionCard(HIGHLIGHT, '配信中のハイライト', (h) => h.displayName + '（' + h.homeTeamName + ' vs ' + h.awayTeamName + '・' + formatDate(h.date) + '）'),
    ];
    if (source === HIGHLIGHT) cards.reverse();
    for (const build of cards) {
        const c = await build();
        if (c) els.result.appendChild(c);
    }
}

// 埋め込む動画の ID。試合は configuration.video、ハイライトは configuration.videoHighlight に入る
// （どちらも `{ provider, externalId }`）。タイマーモードはどちらも持たないので null。
function videoIdOf(configuration) {
    const source = configuration.video || configuration.videoHighlight;
    return source ? source.externalId : null;
}

async function loadTarget(target) {
    const { source, slug } = target;
    if (!slug) {
        await showNotFound(source);
        return;
    }
    setStatus(source === HIGHLIGHT ? 'ハイライトを読み込み中…' : '試合データを読み込み中…');
    els.result.innerHTML = '';

    let json;
    try {
        json = await fetchText(RAW_BASE + source.path + slug + '.json');
    } catch (err) {
        // 404 は「その試合 / ハイライトが無い」。通信断（status なし）と混ぜない。
        if (err instanceof FetchError && err.status === 404) {
            await showNotFound(source);
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
    render(view, source.kind);
    try {
        const videoId = await setupVideo(videoIdOf(view.match.configuration));
        // 動画があって初めて通し再生が成立する。
        if (playAll.button && videoId) playAll.button.disabled = false;
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
    await loadTarget(requestedTarget());
}

// ブラウザでのみ自動起動する（Node からは export された関数を単体検証に使う）。
if (typeof window !== 'undefined') {
    main();
}
