// 試合データデモ。公開 JSON を取得し、Rust 製コアを WebAssembly でブラウザ内実行して
// スタッツ / タイムラインを組み立てる（サーバー不要 = サーバーレス）。
//
// wasm の公開面は 3 関数（toolkitVersion / requiredIdCount / buildMatchView）。
// ID 生成はシェル（この JS）が crypto.randomUUID() で行う — コアは UUID を生成しない
// （handball-toolkit 設計不変条件 2）。

import init, { toolkitVersion, requiredIdCount, buildMatchView } from './wasm/handball_toolkit_wasm.js';

// 配信データの公開 URL（アプリと同一ソース。raw は CORS `*` + Fastly CDN）。
const RAW_BASE = 'https://raw.githubusercontent.com/kinjo-ryura/handball-sample-matches/main/v2';

// エラーコード → ユーザー向け日本語（ADR 0002 決定 3: 文言はコアに焼き込まず、シェルが持つ）。
// コアが投げる JsError の message には `{"code": ...}` の構造化エラー JSON が載る。
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
    version: document.getElementById('toolkit-version'),
    select: document.getElementById('match-select'),
    status: document.getElementById('demo-status'),
    result: document.getElementById('demo-result'),
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
    // コアの JsError は message に構造化エラー JSON を載せる。
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

// ── 表示整形（ラベル・並びはシェルが持つ。コアは素の数値を返す）──

function formatClock(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
}

function successRate(goals, misses) {
    const attempts = goals + misses;
    if (attempts === 0) return '—';
    return Math.round((goals / attempts) * 100) + '%';
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function renderScoreboard(view) {
    const board = el('div', 'scoreboard');
    const home = el('div', 'side');
    home.appendChild(el('div', 'team-name', view.homeTeam.name));
    home.appendChild(el('div', 'score', String(view.summary.homeScore)));
    const vs = el('div', 'vs', 'vs');
    const away = el('div', 'side');
    away.appendChild(el('div', 'team-name', view.awayTeam.name));
    away.appendChild(el('div', 'score', String(view.summary.awayScore)));
    board.append(home, vs, away);
    return board;
}

function renderMeta(view) {
    const meta = el('div', 'match-meta');
    const date = new Date(view.match.date);
    meta.appendChild(el('span', null, date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })));
    const video = view.match.configuration.video;
    if (video) {
        meta.appendChild(el('span', 'badge', '動画あり'));
        if (video.externalId) {
            const link = el('a', null, '▶ YouTube で見る');
            link.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(video.externalId);
            link.target = '_blank';
            link.rel = 'noopener';
            meta.appendChild(link);
        }
    }
    return meta;
}

function renderTeamStats(view) {
    const wrap = el('div', 'team-stats');
    for (const [team, stats] of [[view.homeTeam, view.summary.homeTeam], [view.awayTeam, view.summary.awayTeam]]) {
        const card = el('div', 'card');
        card.appendChild(el('h3', null, team.name));
        const dl = el('dl');
        const rows = [
            ['得点', String(stats.goals)],
            ['シュート試投', String(stats.goals + stats.shotMisses)],
            ['成功率', successRate(stats.goals, stats.shotMisses)],
        ];
        for (const [k, v] of rows) {
            dl.appendChild(el('dt', null, k));
            dl.appendChild(el('dd', null, v));
        }
        card.appendChild(dl);
        wrap.appendChild(card);
    }
    return wrap;
}

function renderPlayerTables(view, playersById) {
    const frag = document.createDocumentFragment();
    const statsByPlayer = new Map(view.summary.playerStats.map((s) => [s.playerId, s]));
    for (const team of [view.homeTeam, view.awayTeam]) {
        const rows = view.summary.playerStats
            .filter((s) => {
                const p = playersById.get(s.playerId);
                return p && p.teamId === team.id;
            })
            .sort((a, b) => {
                if (b.goals !== a.goals) return b.goals - a.goals;
                const pa = playersById.get(a.playerId);
                const pb = playersById.get(b.playerId);
                return (pa.jerseyNumber ?? 999) - (pb.jerseyNumber ?? 999);
            });
        if (rows.length === 0) continue;

        const block = el('div', 'player-block');
        block.appendChild(el('h3', null, team.name));
        const table = el('table', 'player-table');
        const thead = el('thead');
        const htr = el('tr');
        for (const [label, cls] of [['#', 'num'], ['選手', 'name'], ['得点', ''], ['試投', ''], ['成功率', '']]) {
            htr.appendChild(el('th', cls || null, label));
        }
        thead.appendChild(htr);
        table.appendChild(thead);

        const tbody = el('tbody');
        for (const s of rows) {
            const p = playersById.get(s.playerId);
            const tr = el('tr');
            tr.appendChild(el('td', 'num', p.jerseyNumber != null ? String(p.jerseyNumber) : '—'));
            tr.appendChild(el('td', 'name', p.name));
            tr.appendChild(el('td', null, String(s.goals)));
            tr.appendChild(el('td', null, String(s.goals + s.shotMisses)));
            tr.appendChild(el('td', null, successRate(s.goals, s.shotMisses)));
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        block.appendChild(table);
        frag.appendChild(block);
    }
    return frag;
}

// 何本目の regular phase かでラベルを決める（延長は N 本目、shootout は 7m）。
function phaseLabel(kind, regularCount) {
    if (kind === 'shootout') return '7m スローコンテスト';
    if (regularCount === 1) return '前半';
    if (regularCount === 2) return '後半';
    return '延長 ' + (regularCount - 2);
}

function renderTimeline(view, playersById) {
    const list = el('ul', 'timeline');
    let home = 0;
    let away = 0;
    let regularCount = 0;
    for (const rf of view.timeline.resolvedFacts) {
        const payload = rf.fact.payload;
        if (payload.control && payload.control.phaseStart) {
            const kind = payload.control.phaseStart.kind;
            if (kind === 'regular') regularCount += 1;
            list.appendChild(el('li', 'phase', phaseLabel(kind, regularCount)));
            continue;
        }
        const play = payload.play;
        if (!play || play.kind !== 'goal') continue;

        const isHome = play.teamId === view.homeTeam.id;
        if (isHome) home += 1; else away += 1;

        const li = el('li', 'goal');
        const clock = rf.resolvedMatchClock ? rf.resolvedMatchClock.elapsedSeconds
            : (rf.resolvedVideoClock ? rf.resolvedVideoClock.elapsedSeconds : null);
        li.appendChild(el('span', 'time', clock != null ? formatClock(clock) : ''));

        const who = el('div', 'who');
        who.appendChild(el('span', 'team', isHome ? view.homeTeam.name : view.awayTeam.name));
        const p = play.playerId ? playersById.get(play.playerId) : null;
        const label = p ? (p.jerseyNumber != null ? p.jerseyNumber + '. ' + p.name : p.name) : '得点';
        who.appendChild(el('span', 'player', label));
        li.appendChild(who);

        li.appendChild(el('span', 'running', home + ' – ' + away));
        list.appendChild(li);
    }
    return list;
}

export function render(view) {
    const playersById = new Map(view.players.map((p) => [p.id, p]));
    els.result.innerHTML = '';
    const frag = document.createDocumentFragment();
    frag.appendChild(renderScoreboard(view));
    frag.appendChild(renderMeta(view));
    frag.appendChild(el('h2', null, 'チーム集計'));
    frag.appendChild(renderTeamStats(view));
    frag.appendChild(el('h2', null, '選手別スタッツ'));
    frag.appendChild(renderPlayerTables(view, playersById));
    frag.appendChild(el('h2', null, '得点タイムライン'));
    frag.appendChild(renderTimeline(view, playersById));
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
        render(view);
    } catch (err) {
        showError(err);
    }
}

function populateSelect(matches) {
    els.select.innerHTML = '';
    for (const m of matches) {
        const opt = document.createElement('option');
        opt.value = m.slug;
        const mark = m.hasVideo ? '🎬 ' : '';
        opt.textContent = mark + m.displayName;
        els.select.appendChild(opt);
    }
}

async function main() {
    setStatus('WebAssembly を初期化中…');
    try {
        await init();
        els.version.textContent = 'handball-toolkit v' + toolkitVersion();
    } catch (err) {
        showError(err);
        return;
    }

    setStatus('試合一覧を読み込み中…');
    let index;
    try {
        index = JSON.parse(await fetchText(RAW_BASE + '/index.json'));
    } catch (err) {
        showError(err);
        return;
    }
    const matches = index.matches || [];
    if (matches.length === 0) {
        setStatus('配信中の試合がありません。');
        return;
    }

    populateSelect(matches);
    els.select.disabled = false;
    els.select.addEventListener('change', () => loadMatch(els.select.value));

    // 初期表示は動画ありを優先（タイムラインが動画時刻付きでリッチなため）。
    const initial = matches.find((m) => m.hasVideo) || matches[0];
    els.select.value = initial.slug;
    await loadMatch(initial.slug);
}

// ブラウザでのみ自動起動する（Node からは export された関数を単体検証に使う）。
if (typeof window !== 'undefined') {
    main();
}
