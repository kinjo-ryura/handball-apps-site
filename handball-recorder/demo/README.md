# 試合データデモ

公開されている試合データ（[handball-sample-matches](https://github.com/kinjo-ryura/handball-sample-matches) の `v2/`）を取得し、`handball-toolkit` のコアを WebAssembly でブラウザ内実行して集計する静的デモ。アプリ「ハンド記録」の記録画面に寄せ、**YouTube 動画を埋め込み、タイムラインの行をタップすると動画がそのシーンへ飛ぶ**。サーバー不要（GitHub Pages で完結）。handball-project#96。

**試合（`v2/matches/`）とハイライト（`v2/highlights/`）の両方を表示する**（ハイライト対応は #232）。

- 公開 URL: <https://hand-plus.com/handball-recorder/demo/>
- 集計コアは iOS アプリ「ハンド記録」と同一（`handball-toolkit`）。ID 生成のみシェル（JS の `crypto.randomUUID()`）が行う。
- 表示文言（エラー含む）は JS が持つ。コアはエラーコード + パラメータのみ返す（ADR 0002 決定 3）。
- 動画は **YouTube IFrame Player API** で埋め込む。API スクリプトは youtube.com から読むが GitHub Pages はサンドボックスなし（CSP 制約なし）。
- **得点行のタップは `videoClock` から `SEEK_OFFSET_SECONDS`（3 秒）を引いた位置へ `seekTo` する。**
  アプリ（ハンド記録）の `seekOffsetSeconds` と同じ既定値で、得点の瞬間ちょうどではなく
  少し手前から流して場面を掴めるようにするため。アプリは設定画面で 0〜10 秒に変えられるが、
  デモは設定 UI を持たないので固定値。**アプリ側の既定を変えたらここも揃えること。**
  なお記録時にも別のオフセット（アプリの `recordingOffsetSeconds`、既定 3 秒）が掛かっており、
  保存されている `videoClock` は既にタップ位置より手前にある。
- **表示する対象は `?match=<slug>`（試合）と `?highlight=<slug>`（ハイライト）**。`?match=` は #211 で決めた形で、同じ URL をアプリが Universal Links で受ける。**ただし正規の入口は個別ページのパス形式**（`/handball-recorder/match/<slug>/`。#231）で、クエリ形式は投稿済みの URL のために残している互換。指定が無ければ `demo.js` の `DEFAULT_SLUG`（埋め込み再生が有効な動画試合）。slug は取得 URL のパスに入るので `SLUG_PATTERN` で検証してから使う。両方指定されたときはハイライトが勝つ。**ルート要素（`data-demo`）の data 属性（`data-match` / `data-highlight`）はクエリより優先される** — LP から読むときの指定手段（→「LP からも同じ JS / CSS を読んでいる」）。
- **配信 45 件のうち動画つきは 2 件**（残り 43 件は公式ランニングスコア由来のタイマーモード版で動画を持たない）。動画なしの試合は動画枠を隠し、タイムライン / スタッツだけを出す。
- **描画は動画の成否に依存させない**。`render(view, kind)` を先に呼んでから動画を用意する。`?match=` / `?highlight=` で任意の対象が来るため、YouTube の応答に本文を巻き込まない。
- **`onError` は意図的に未処理**。動画が再生できなくなった場合（投稿者が埋め込みを無効化 / 削除 / 非公開）、プレイヤー領域にエラーが出たまま得点タップが無反応になる。2026-08-22 時点で配信中の 2 件はどちらも公開 URL で再生でき（oEmbed も 200）、**まだ起きていない障害**であるため、**先に検知の仕組みを作り、実際に必要になってからフォールバックを実装する**方針とした（#211 で判断。監視・フォールバックとも別 Issue）。
- 不明な slug（タイポ・配信終了）は「見つかりません」+ 配信中の一覧を出して行き止まりにしない。**訊かれた側のコレクションを先に並べる**（試合を探していたなら試合一覧が上）。文言の主語も「この試合 / このハイライト」で切り替える。
- 試合セレクタは置いていない。代わりに **一覧だけを出すページ `demo/list/` を持つ**（エラー文なし。LP の「他の試合を選ぶ」がここへ来る・#241）。**正規の入口はこのパスで、`?list` は配布済み URL のための互換**（`?match=` と同じ扱い）。パスへ移した理由は計測（handball-project#252）— Cloudflare Web Analytics は query string を記録しないので、`?list` のままだと一覧の閲覧数が `demo/` に混ざって分離できない。ページの実体は `demo/index.html` の写しで、ルート要素に `data-demo-list` が付くだけ。不明な slug のフォールバックと同じ `showCollections()` を通る。違いは 2 つで、message を渡すかどうかと、**`?list` は動画つきだけに絞ること**（`videoOnly`）。動画なしの試合は行を押しても何も起きず、これから試す人には欠けた体験になる。**「見つかりません」からの復帰では絞らない** — 探していた試合が動画なしのこともあり、そこで隠すと辿り着けなくなる。
- **`<title>` と OG は対象によらず共通のまま**。クローラは JS を実行しないので、slug ごとに出し分けるには別パスの HTML を事前生成するしかない（#231）。ハイライトの名前はページ内の見出し（`h1.demo-title`）で出している。

## ハイライト（`?highlight=<slug>`）

配信中は 6 件で**すべて動画つき**。本体スキーマは `v2/matches/{slug}.json` と同一なので、取得〜
`buildMatchView` までは試合と完全に同じ経路を通る（`configuration.kind` が `videoHighlight` でも
コアは落ちない — #232 で全 6 件を実測）。**描画だけ分けている**理由が 3 つある。

- **クエリパラメータを分けた**。試合とハイライトは配信上も別コレクションで slug の名前空間が
  独立しており、1 つのパラメータに相乗りさせると将来同じ slug が両方に現れたときにどちらを
  指すか決められない。アプリも「自分の試合 / 注目の試合 / ハイライト」を別コレクションとして
  扱っている（`docs/lean/cycles/cycle-9/sample-list-ux-decision.md`）。#231 でパス方式へ移す際も
  この 2 系統をそのまま別パスに写せる。
- **得点タイムラインではなくシーン一覧（1 列）で出す**。ハイライトは得点だけではなく、
  **記録の過半が `freeNote`（ナイスパス等）の回もある**（配信中の最多は 30 件中 23 件）。得点に
  絞ると大半のシーンが消える。加えてハイライトは片チームの選手だけを取り上げるのでアウェイ列が
  常に空になり、phase を持たないので中央の試合時計も常に空になる — 両サイド表示が成立しない。
  種別ラベル（得点 / シュートミス / メモ …）を付けて全 play fact を並べ、全行をシーク可能にする。
- **チーム別ではなく選手別のスタッツを出す**。ハイライトは試合の全 fact を持たないので、
  `summary.homeScore` / `awayScore` は**試合スコアではなく「そのハイライトに写っている得点数」**。
  両チーム列で並べると「6–0 で勝った試合」に見えてしまう。見出しも「スタッツ」ではなく
  「このハイライトの記録」にしてある。

### 通し再生（すべて再生）

**ハイライトモードの体験本体はこれ**で、行タップの単発シークでは代替できない（間を飛ばして
名場面だけを繋いで見るのがハイライト）。アプリの `PlayerShotsPlaybackControllerV2` の移植。

- 対象は `goal` / `shotMissed` / `freeNote` の全 play fact（アプリの `allHighlightsOf` と同じ範囲で、
  シーン一覧に出している行とちょうど一致する）
- 各シーンを **`videoClock − PLAYBACK_LEAD_IN_SECONDS`（4 秒）〜 `videoClock + PLAYBACK_TAIL_SECONDS`
  （2 秒）** のクリップにし、開始位置の昇順に並べる
- 再生位置を **250ms ごと**に見て（アプリの `clockPollTask` と同じ間隔）、クリップ末尾を超えたら
  次のクリップへ進む。最後まで行ったら一時停止して終わる
- **シーク直後 1 秒はポーリング値を無視する**（`SEEK_SETTLE_WINDOW_SECONDS`）。シークが効く前の
  古い再生位置で次のクリップへ誤って進むのを防ぐ
- **重なっているクリップへはシークせず、そのまま流して繋ぐ**（#237）。リードイン 4 秒 +
  テール 2 秒なので 6 秒未満の間隔で記録された 2 件はクリップが重なり、素直に次の頭へ飛ぶと
  巻き戻って同じ映像を二度流すことになる。現在位置が既に次のクリップの中なら、シークせず
  **index と強調行だけ進めて**再生を続ける。配信中の 6 件では 3 箇所が該当する
  （`2026-05-09-ohrid-vs-vardar` の 2.6 秒差 shotMissed → goal ほか）。
  当初は「それぞれの助走つきで見せる形」として重なりを残していたが、実際には繋がった 1 つの
  プレーを切って二度流す形になり、名場面を繋いで見る体験を壊すため改めた
- **「n / N」の N は減らさない**。重なりを 1 本にマージするのではなく index を送るだけなので、
  シーン一覧の行とクリップの 1:1 対応は保たれる（行タップの入口もそのまま使える）
- **この重なり規則はアプリの `PlayerShotsPlaybackControllerV2.advance(currentVideoTime:)` と
  同一**。境界ちょうどの扱い（同時刻の記録でも両方を一度は現在クリップにする）まで揃えてある。
  **片方を変えたらもう片方も揃えること**

**ハイライトの行タップは通し再生の入口**で、押したシーンから後続へ繋がる（単発シークでは
ない）。選んだ 1 本を見て終わりではなく、そこから名場面が続くのがハイライトの見方で、
一覧はその入口という位置づけ。ボタンは先頭から、行はその位置から始める違いだけ。

**アプリとは意図的に違う点**。アプリは「すべて再生」が別画面なので、行タップは単発シーク
（`seekOffsetSeconds` = 3 秒）で済む。デモは 1 ページに同居するので、行タップを通し再生に
繋いだ。この結果、**`SEEK_OFFSET_SECONDS`（3 秒）が効くのは試合ページだけ**になり、
ハイライトの行タップはクリップ頭（`videoClock − 4 秒`）へ飛ぶ。

**2 つのリードインを混ぜないこと。** `SEEK_OFFSET_SECONDS`（3 秒 = アプリの
`seekOffsetSeconds`・試合ページ用）と `PLAYBACK_LEAD_IN_SECONDS`（4 秒 = アプリの
`defaultPlaybackLeadInSeconds`・通し再生用）はアプリでも別々に持っている
（「そのシーンへ飛ぶ」と「名場面を繋いで見る」で必要な助走が違う）。
**どちらもアプリ側の既定を変えたら揃えること。**

ほかにアプリとの差が 2 点。**停止しても動画は止めない**（一時停止するのは最後まで
見終わったときだけ）。**終了後も画面はそのまま**（アプリは全画面を閉じるが、デモには
戻る先が無い）。

**時刻は動画時間**（`resolvedMatchClock` は全 fact で null になる）。見出しの右に「時刻は動画時間」と
添えているのは、同じ書式の数字が試合時間にも動画時間にも見えると誤読するため — アプリの
`EventRowView.formattedTime` が「もう一方の時計へ fallback しない」としているのと同じ理由。

記録種別の日本語名（`PLAY_KIND_LABELS`）は `RecorderUIShared/PlayEventKindLabel.swift` の写し。
デモは Swift シェルとは別言語なので写しを持たざるを得ない。**アプリ側の語を変えたらここも
揃えること**（`SEEK_OFFSET_SECONDS` と同じ扱い）。

## アプリ内ブラウザからアプリを開く導線（#230）

デモページと個別ページの導線ブロック（`.demo-cta`）に、**「アプリで開く」ボタン**を
App Store ボタンと併置している。リンク先は**カスタム URL スキーム**
`handballrecorder://match/<slug>` / `handballrecorder://highlight/<slug>`。

- **なぜ要るか**: LINE / X の**アプリ内ブラウザ（WebView）は Universal Links をアプリへ
  渡さない**（iOS の仕様。Web 側では変えられない）。アプリを入れている読者が X や LINE で
  試合 URL をタップすると、UL が働かず web デモが出る。体験は壊れないが一手多い
  （「ブラウザで開く」で Safari に渡して初めてアプリが開く）。カスタムスキームなら
  WebView からでもアプリへ届く。**UL の代わりではなく、UL が働かない経路の補助**
- **スキーム名と host はアプリ側 `IncomingLinkV2` の定数と対**（`customScheme` /
  `matchHost` / `highlightHost`）。**片方だけ変えるとボタンが無反応になる** —
  登録されていないスキームの URL は iOS がアプリへ渡さず、web 側からは失敗を検知できない。
  アプリ側は `IncomingLinkV2Tests` が `Info.plist` を読んで一致を固定している
- **host は `pagePath` と同じ**にしてある（`handballrecorder://match/<slug>` ↔
  `/handball-recorder/match/<slug>/`）。`pageHref` と `appLinkHref` が同じ `pagePath` から
  web の URL とアプリの URL を作るので、コレクションを増やすときに片方だけ直す形にならない
- **href は JS が組み立てる**（`data-demo-app-open`）。個別ページは slug が静的に分かるので
  HTML に直接書くこともできるが、**表示中の対象とボタンの行き先が必ず一致すること**を
  1 か所で保証するためにこうしてある（デモページはクエリ次第で対象が変わる）
- **対象が決まったときだけ出す。** 既定は `hidden` で、本文の描画に成功した時点で外す。
  一覧（`demo/list/`・`?list`）/ 「見つかりません」/ 読み込み失敗では出さない — 押してもアプリ側が同じ
  行き止まりを見せるだけになるため。**動画の成否は条件にしない**（アプリは動画が無くても
  タイムラインを開けるので、条件にするとタイマーモードの 43 件でボタンが消える）
- **主従は塗り分けで示す。** App Store が主（塗り）、アプリで開くが従（`secondary` の
  アウトライン）。**未導入の読者のほうが多い前提**で、押しても何も起きないほうを主にしない。
  web からは `canOpenURL` に当たるものが無く、**アプリの有無を判定できない**ので、
  出し分けではなく併置で扱っている
- **`.demo-cta a[hidden]` の CSS を消さないこと。** UA の `[hidden] { display: none }` は
  `a.app-store { display: inline-block }`（作者スタイル）に負けるので、明示的に勝たせている。
  消すと隠したはずのボタンが出る
- **LP はこのボタンを持たない**（`.demo-cta` ごと無い）。`els.appOpen` が null になる経路は
  `heading` と同じく想定済みで、すべて no-op になる

## LP からも同じ JS / CSS を読んでいる（重要）

`../index.html`（ハンド記録の LP）が、**このディレクトリの `demo.js` / `demo.css` を
そのまま読んで動かしている**（#241）。LP には **2 個**ある — チーム関係者の層の
③「記録した得点から、動画をすぐ見返せる」と、ハンドボールファンの層の
②「推し選手のシーンだけ、続けて見る」。デモページ専用と思って直すと LP が壊れるので、
変更時は LP の見え方も確認すること。

守るべき制約は 5 つ。

- **要素は id ではなくルート要素（`data-demo`）の中を data 属性で探す**。
  `data-demo-status` / `data-demo-result` / `data-demo-video-wrap` / `data-demo-video-mount` /
  `data-demo-heading`。id に戻すと **1 ページに 1 個しか置けなくなる**（id は文書内で一意なので
  2 個目が無視される）。デモページはルートを `<main data-demo>` にしている
- **2 個目以降は別 URL でモジュールを読む**。`player` / `playAll` などの可変状態はモジュール
  変数なので、同じ URL で 2 回 `mount()` すると後の方が先の YouTube プレイヤーを奪う。
  LP は `import('./demo/demo.js?i=' + i)` としている（ES モジュールは URL 単位でキャッシュ
  されるため、クエリ違いは状態を共有しない別インスタンスになる）。
  wasm のグルー（`./wasm/handball_toolkit_wasm.js`）はクエリを付けないので全インスタンスで
  共有され、`init()` は中で二重呼び出しを弾く = fetch も instantiate も 1 回だけ
- **ページ全体に効く CSS は `.demo-page` に閉じる**（デモページの `<body class="demo-page">`）。
  素の `body` / `main` に書くと、**LP の地色が #f2f2f7 になり main の余白も変わる**
- **`data-demo-heading` は LP に存在しない**。試合名・選手名（「安平光佑選手ハイライト /
  Ohrid vs Vardar・2026年5月9日」）を LP に出さないため、要素そのものを置いていない。
  `els.heading` を触るコードは**必ず null を許容する**こと
- **LP は `data-view="minimal"` を渡す**。`isMinimal()` が真のとき、集計表・セクション見出し・
  通し再生ボタン（と clips）を出さない。個別フラグに分けていないのは、「最小で置いている」
  という 1 つの意図から出た 3 つの結果だから

**wasm 348KB は LP の初期表示では読まれない**。LP 側が IntersectionObserver でルートを
1 個ずつ見張り、視界に入ってから `import()` する。**畳まれている層のぶんは読まれない**
（閉じた `<details>` の中身は描画されないので交差が起きない）。デモページは
`<script type="module">` から即 `mount()` する。

**行タップで動画へ運ぶスクロールはページ最上部ではなく動画枠基準**（`revealVideo()`）。
LP はデモをページ途中の層の中に置くので、最上部へ戻すとデモから離れてしまう。

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

## OG（カード画像）

このページ専用の OG を持つ（`og-source/index.html` → `images/og.jpg`、#229）。
再生成手順はサイトの [README.md](../../README.md#og-画像の更新手順)。

**試合を名指ししていない**（チーム名・スコアを出さず、タイムラインは背番号だけ）。
`?match=<slug>` で任意の試合を開けるのに、カードが特定の試合を映すと中身が食い違うため。

### 試合ごとの OG は個別ページが持つ（#231）

**このページの OG は共通 1 枚のまま**で、試合を名指ししない（`?match=<slug>` で任意の
試合を開くため、名指しすると別の試合を開いた人と中身が食い違う）。試合名・スコア入りの
カードは、**slug ごとの別パスのページ**が持つ:

```
https://hand-plus.com/handball-recorder/match/<slug>/
https://hand-plus.com/handball-recorder/highlight/<slug>/
```

クローラは JS を実行せず、GitHub Pages はクエリを見て返す HTML を変えられないので、
`?match=X` と `?match=Y` を別のカードにする方法は**事前生成した別パスしかない**。

- 生成は親リポの `tools/generate-match-pages/`（入力が `handball-sample-matches` の配信
  index、出力がこの repo なので submodule をまたぐ。site 単体では回せない）。
- **ページは `demo.js` / `demo.css` / wasm をこのディレクトリから読む。** 対象は
  クエリではなくルート要素の `data-match` / `data-highlight` で渡す（→「LP からも同じ
  JS / CSS を読んでいる」と同じ仕組み）。**ここの JS を直すと個別ページも動く**ので、
  デモページ専用と思って直さないこと。
- **OG 画像は 51 件すべてが個別に持つ。** 組み方はこのページの共通 OG（左＝動画枠 +
  タイムラインカード / 右＝内容）に寄せ、中身をその試合の実データにしてある。
  **動画なしの 43 件は再生ボタンを出さない** — 押しても動画は無いので、絵で約束すると嘘になる。
- **`?match=` / `?highlight=` は残す。** #211 で X に投稿済みの URL が死ぬため。
- **Universal Links が受けるのはパス形式の試合・ハイライトと、旧クエリの `?match=` だけ**
  （#231）。`?highlight=` はアプリで開かず web に残る — 投稿済みの URL が試合しか無く、
  互換の必要が無いため。判定は `IncomingLinkV2` で、AASA と対になっている。
- **一覧が張るリンクはパス形式**（`collectionCard` の `pageHref`）。`demo/list/` も
  「見つかりません」からの復帰も個別ページへ送る。**配信を増やしてページを生成し忘れると
  一覧が 404 を指す**ので、親リポの CI（`match-pages-sync.yml`）が追随を検査している。

## 告知タイミング

公開・告知は novelty トリガーになるため、cycle-9 の観測 window（前哨戦 8/10〜15・本番 9〜10 月）と干渉させない。**ページ公開は静かに行い、X 告知は window の外（8/10 より前 or 11 月以降）に置く**（`docs/lean/cycles/cycle-9/hypothesis.md`）。
