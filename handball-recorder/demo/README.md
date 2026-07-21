# 試合データデモ

公開されている試合データ（[handball-sample-matches](https://github.com/kinjo-ryura/handball-sample-matches) の `v2/`）を取得し、`handball-toolkit` のコアを WebAssembly でブラウザ内実行して集計する静的デモ。アプリ「ハンド記録」の記録画面に寄せ、**YouTube 動画を埋め込み、得点タイムラインの行をタップすると動画がそのシーンへ飛ぶ**。サーバー不要（GitHub Pages で完結）。handball-project#96。

- 公開 URL: <https://kinjo-ryura.github.io/handball-apps-site/handball-recorder/demo/>
- 集計コアは iOS アプリ「ハンド記録」と同一（`handball-toolkit`）。ID 生成のみシェル（JS の `crypto.randomUUID()`）が行う。
- 表示文言（エラー含む）は JS が持つ。コアはエラーコード + パラメータのみ返す（ADR 0002 決定 3）。
- 選択肢は `hasVideo` の試合のみ。動画は **YouTube IFrame Player API** で埋め込み、各得点の `videoClock`（動画位置）へ `seekTo` する。API スクリプトは youtube.com から読むが GitHub Pages はサンドボックスなし（CSP 制約なし）。
- **投稿者が埋め込みを無効化した動画（onError 150）は再生できない**（現状 2 試合中 1 試合が該当。フォールバック/フィルタは未実装 = 一旦放置）。

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
