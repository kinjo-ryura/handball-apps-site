# 試合データデモ

公開されている試合データ（[handball-sample-matches](https://github.com/kinjo-ryura/handball-sample-matches) の `v2/`）を取得し、`handball-toolkit` のコアを WebAssembly でブラウザ内実行して集計する静的デモ。アプリ「ハンド記録」の記録画面に寄せ、**YouTube 動画を埋め込み、得点タイムラインの行をタップすると動画がそのシーンへ飛ぶ**。サーバー不要（GitHub Pages で完結）。handball-project#96。

- 公開 URL: <https://hand-plus.com/handball-recorder/demo/>
- 集計コアは iOS アプリ「ハンド記録」と同一（`handball-toolkit`）。ID 生成のみシェル（JS の `crypto.randomUUID()`）が行う。
- 表示文言（エラー含む）は JS が持つ。コアはエラーコード + パラメータのみ返す（ADR 0002 決定 3）。
- 動画は **YouTube IFrame Player API** で埋め込み、各得点の `videoClock`（動画位置）へ `seekTo` する。API スクリプトは youtube.com から読むが GitHub Pages はサンドボックスなし（CSP 制約なし）。
- **表示する試合は `?match=<slug>`**（#211。同じ URL をアプリが Universal Links で受ける）。指定が無ければ `demo.js` の `DEFAULT_SLUG`（埋め込み再生が有効な動画試合）。slug は取得 URL のパスに入るので `SLUG_PATTERN` で検証してから使う。
- **配信 45 件のうち動画つきは 2 件**（残り 43 件は公式ランニングスコア由来のタイマーモード版で動画を持たない）。動画なしの試合は動画枠を隠し、タイムライン / スタッツだけを出す。
- **描画は動画の成否に依存させない**。`render(view)` を先に呼んでから動画を用意する。`?match=` で任意の試合が来るため、YouTube の応答に本文を巻き込まない。
- **`onError` は意図的に未処理**。動画が再生できなくなった場合（投稿者が埋め込みを無効化 / 削除 / 非公開）、プレイヤー領域にエラーが出たまま得点タップが無反応になる。2026-08-22 時点で配信中の 2 件はどちらも公開 URL で再生でき（oEmbed も 200）、**まだ起きていない障害**であるため、**先に検知の仕組みを作り、実際に必要になってからフォールバックを実装する**方針とした（#211 で判断。監視・フォールバックとも別 Issue）。
- 不明な slug（タイポ・配信終了）は「見つかりません」+ 配信中の一覧を出して行き止まりにしない。
- 試合セレクタは置いていない（`?match=` と上記の一覧で代替する）。

## localhost では埋め込みが弾かれる動画がある（重要）

**埋め込み可否の判断は必ず公開 URL で行うこと。** `http://127.0.0.1` から埋め込むと、公開 URL では問題なく再生できる動画が `onError 150`（= 投稿者が埋め込みを無効化）で落ちることがある。

2026-08-22 に `z5KrsvC6VAA` で実測した内訳:

| origin | 結果 |
|---|---|
| `http://127.0.0.1:8765` | ❌ error 150 |
| `http://kinjo-ryura.github.io` | ✅ 再生可 |
| `https://kinjo-ryura.github.io` | ✅ 再生可 |
| `https://com.first.handballrecorder`（アプリと同条件の WKWebView） | ✅ 再生可 |

http か https かは無関係で、**`127.0.0.1` であることだけが引き金**。YouTube の oEmbed（`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json`）は同じ動画に 200 を返すので、埋め込み自体は許可されている。

**この罠は実際に誤診を生んでいる。** 2026-07-21 のデモ開発時（同日に 7 コミットの反復開発 = ローカル閲覧）にこの 150 を「投稿者が埋め込みを無効化した」と解釈し、試合セレクタを外して README にもそう書いていた。#211 で実測して訂正。**ローカルで 150 を見たら、まず公開 URL と oEmbed で確かめる。**

## ファイル

```
demo/
  index.html    デモページ
  demo.css      デモ専用スタイル（共通は /style.css を継承）
  demo.js       ES module。wasm 呼び出し・動画埋め込み・描画（describeError / render は Node 単体検証用に export 済み）
  wasm/         handball-toolkit を wasm 化したビルド済み成果物（下記の手順で再生成）
```

## wasm 成果物の配置方針

**ビルド済み成果物をこの repo にコミットする**（リリース時 CI 生成はしない）。

- この site は GitHub Actions を持たない素の静的 Pages。private な `handball-toolkit` をクロスリポ CI でビルドするのは過剰。
- 成果物は ~340KB（wasm 本体）。コアは移植完走済みで更新は稀。更新時は下記を手で回す。
- サーバーレス縛りと整合（配信 JSON も raw.githubusercontent.com の静的ファイル）。

## wasm の再生成手順

`handball-toolkit` のコアを更新したら、そのコミットからビルドして `wasm/` を差し替える。

```bash
# handball-toolkit 側（親リポの submodule。nix / direnv 環境が要る）
cd apps/handball-toolkit
nix develop --command ./scripts/build_wasm.sh   # target/wasm/ に生成

# 生成物を site のデモへコピー
cp target/wasm/handball_toolkit_wasm.js \
   target/wasm/handball_toolkit_wasm_bg.wasm \
   target/wasm/handball_toolkit_wasm.d.ts \
   target/wasm/handball_toolkit_wasm_bg.wasm.d.ts \
   ../handball-apps-site/handball-recorder/demo/wasm/
```

現行の `wasm/` は handball-toolkit `72c1024` からビルド。コア更新のたびにこの provenance を更新すること（iOS アプリと同じコアで動かすため、古いビルドを混ぜない）。

## 告知タイミング

公開・告知は novelty トリガーになるため、cycle-9 の観測 window（前哨戦 8/10〜15・本番 9〜10 月）と干渉させない。**ページ公開は静かに行い、X 告知は window の外（8/10 より前 or 11 月以降）に置く**（`docs/lean/cycles/cycle-9/hypothesis.md`）。
