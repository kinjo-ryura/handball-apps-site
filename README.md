# handball-apps-site

ハンドボール関連 iOS アプリの公式サイト。GitHub Pages で公開する静的サイト。

App Store 申請時に必要な **Privacy Policy URL** と **Support URL** をホスティングするのが主目的。

## この repo は公開面

**開発ドキュメント置き場であると同時に、そのまま Web 配信されるディレクトリ。**
`.nojekyll` を置いているので除外の仕組みが無く、**追跡ファイルは README も含めて
すべて `https://hand-plus.com/` から取得できる**（2026-09-02 に実測）。

- 運用・告知・実験の計画、訴求の判断は**ここに書かない**。置き場所は親リポの運営ドキュメント
- 実装ノートに「なぜ」を書くのは構わない。公開して困る「なぜ」だけ親リポへ置く
- 親リポの**内部パスを名指しでリンクしない**（パスの存在自体が公開されるため）
- 他リポの可視性（public / private）に言及しない。変わったときに誤情報として残る

## 公開 URL

`https://hand-plus.com/`（旧 `kinjo-ryura.github.io/handball-apps-site/` は 301 リダイレクト）

| ページ | パス |
|--------|------|
| トップ | `/` |
| ハンド記録 アプリページ | `/handball-recorder/` |
| ハンド記録 試合データデモ | `/handball-recorder/demo/` |
| ハンド記録 Android 版のインストール手順 | `/handball-recorder/android/` |
| ハンド記録 試合ページ（試合ごと） | `/handball-recorder/match/<slug>/` |
| ハンド記録 ハイライトページ（1 件ごと） | `/handball-recorder/highlight/<slug>/` |
| ハンド記録 プライバシーポリシー | `/handball-recorder/privacy/` |
| ハンド記録 サポート | `/handball-recorder/support/` |

## ディレクトリ構成

```
.
├── CNAME                               # 独自ドメイン（hand-plus.com）
├── .nojekyll                           # ドットフォルダを配信させる（→「.well-known が 404 になるとき」）
├── .well-known/
│   └── apple-app-site-association      # Universal Links の宣言（#211）
├── index.html                          # トップ（傘 = ハンドプラスのアプリ一覧）
├── style.css                           # 共通スタイル
├── icon-source/                        # 傘のブランドマークの元データ（→ icon-source/README.md）
├── images/                             # 傘の資産（マーク・favicon・OG・未公開アプリのアイコン）
├── og-source/index.html                # 傘の OG の生成元
├── scripts/
│   ├── generate-brand-icon.sh          # 傘のマーク → images/brand-icon.png ほか
│   └── generate-og.sh                  # OG 画像の再生成（→「OG 画像の更新手順」）
└── handball-recorder/
    ├── index.html                      # アプリ概要（LP）
    ├── demo/                           # wasm 試合データデモ（詳細は demo/README.md）
    │   ├── images/og.jpg               # デモ専用の OG（#229）
    │   └── og-source/index.html        # 同 生成元
    ├── android/                        # Android 版（APK 直配布）のインストール手順（#261）
    │   ├── index.html                  #   .install-page（style.css の同名節）
    │   ├── images/og.jpg               #   このページ専用の OG（アイコンと見出しだけ）
    │   └── og-source/index.html        #   同 生成元
    ├── match/<slug>/                    # 試合ごとのページ（45・生成物。#231）
    │   ├── index.html                  #   demo/ の JS・CSS・wasm を読む
    │   └── og.jpg                      #   その試合専用の OG（実データから生成）
    ├── highlight/<slug>/                # ハイライトごとのページ（6・生成物）
    ├── images/                         # スクリーンショット・アイコン・OG 画像
    ├── og-source/index.html            # OG 画像の生成元
    ├── privacy/index.html              # Privacy Policy
    └── support/index.html              # Support
```

`match/` と `highlight/` の中身は**生成物**で、直接編集しない。親リポの
`tools/generate-match-pages/` が配信 index から作る（→「OG 画像の更新手順」の注記）。

新しいアプリを追加する場合は `<app-slug>/{privacy,support}/index.html` を増やす。

**傘（`index.html` / `images/` / `og-source/` / `icon-source/`）とアプリ（`handball-recorder/`）は
資産を分けている。** 傘のアイコンはアプリのアイコンではないので、favicon を
`handball-recorder/images/` から参照しない（アプリが増えたときに 1 つ目のアプリが特別扱いされる）。

## GitHub Pages 設定

リポジトリの **Settings → Pages → Branch: `main` / `/` (root)** で公開する。

公開反映までは push 後 1〜2 分。

### デプロイが「Deployment failed, try again later.」で失敗するとき

ビルド成功後の deploy 工程だけが失敗することがある（サービスステータスは operational のまま。2026-07-05 に 3 連続発生）。

- 復旧は `gh api -X POST repos/kinjo-ryura/handball-apps-site/pages/builds` で新規ビルドを投入するのが最も確実
- GUI に「Run workflow」ボタンは無い（Pages のワークフローは GitHub 管理）。Actions の「Re-run all jobs」は re-run が queue に入らず宙吊りになることがあり、その状態の run はキャンセルも不可（放置でよい）
- 反映確認は `curl` で新規追加ファイルの 200 と HTML 内の目印文字列を見る。REST の `pages/builds/latest` は状態が陳腐化することがあるため `gh run list --workflow pages-build-deployment` の方が正確

### `.well-known/` が 404 になるとき

**`.nojekyll` が要る。** GitHub Pages は既定で Jekyll を通し、Jekyll は**ドットで始まる
ディレクトリを出力から除外する**。そのため `.well-known/apple-app-site-association` は
コミットされていても配信されない（#211 で実測。`.nojekyll` を置く前は 404 だった）。

`.nojekyll` は空ファイルでよく、置くと Jekyll 処理そのものを飛ばす。このサイトは素の
HTML/CSS しか持たないので副作用はない。

AASA は**拡張子を持たない**ため `application/octet-stream` で配信されるが、**Apple はこれを
受け付ける**（#211 で配置後に Apple の CDN が取得・解析するのを確認済み）。MIME を
`application/json` に直すための細工は要らない。

### キャッシュ特性

Pages は CSS 等を約 10 分キャッシュさせるため、デプロイ直後の再訪問者（特に X アプリ内 WebView）は「新 HTML + 旧 CSS」で表示が崩れることがある。時間経過で自然解消し、初見の訪問者には影響しない。

## 編集時のメモ

- **HTML / CSS 内のリンクパスはすべて相対パス**（#211 で絶対パスから移行）。サブパス公開（`kinjo-ryura.github.io/handball-apps-site/`）でもルート配信（独自ドメイン `hand-plus.com`）でも**同じ HTML がそのまま動く**。`/handball-apps-site/...` のような絶対パスを足さないこと — 独自ドメインへ切り替えた瞬間に全部 404 になる
- **例外は `og:url` / `og:image`**。OGP は仕様上フル URL が必要で相対化できないため、`https://hand-plus.com/...` を直書きしている。**ドメインを変えるときはここも直し、X のカードキャッシュを再クロールさせること**（下記「OG 画像の更新手順」の手順 4）
- OG 画像（`images/og.jpg` / `handball-recorder/images/og.jpg`）は直接編集しない。更新は下記「OG 画像の更新手順」に従う
- **`handball-recorder/demo/` の `demo.js` / `demo.css` は LP（`handball-recorder/index.html`）からも読んでいる**（#241）。デモページ専用と思って直すと LP が壊れる。制約は [demo/README.md](handball-recorder/demo/README.md)「LP からも同じ JS / CSS を読んでいる」
- **同じ `demo.js` / `demo.css` を `match/<slug>/` と `highlight/<slug>/` の 51 ページも読んでいる**（#231）。読み手は LP・デモ・個別ページの 3 種類。個別ページの生成は親リポの `tools/generate-match-pages/`
- **インライン `<script>` を足さないこと**（#284）。CSP が `script-src 'unsafe-inline'` を
  許しておらず、足すとそのページで JS が動かなくなる。デモの起動は共有の
  `handball-recorder/demo/mount.js`、LP の開閉は `handball-recorder/lp.js` にある。
  生成ページのテンプレートは親リポの `tools/generate-match-pages/generate.py`
- **`target="_blank"` の外部リンクには `rel="noopener noreferrer"` を付ける**（#285）。いまは
  `privacy/` の 3 本だけ。`<meta name="referrer">` で一括にしなかったのは、外部リンクを持つ
  ページがその 1 枚しかなく、63 枚に方針だけ配っても効く先が無いため
- **`.well-known/apple-app-site-association` を変えたら HandballRecorder の `IncomingLinkV2.swift` も変える**（逆も同じ）。食い違うと Universal Links が無反応になる。整合は親リポの `tools/generate-match-pages/tests/` が固定している（4 つが同時に見えるのは親リポだけ）

## Content Security Policy

`<meta http-equiv>` で CSP を配っている（#284）。**いまは `privacy/` と `support/` の 2 枚だけ**
で、残り 61 枚へは様子を見てから広げる。

現行の値（2 枚に入っているものと同一。広げるときはこれをそのまま貼る）:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com https://www.youtube.com;
style-src 'self' 'unsafe-inline';
img-src 'self';
connect-src 'self' https://cloudflareinsights.com https://raw.githubusercontent.com;
frame-src https://www.youtube.com;
object-src 'none';
base-uri 'none';
form-action 'none'
```

### なぜ CSP なのか（SRI ではなく）

全ページが**外部スクリプト 2 本**を読んでおり、どちらも SRI（`integrity`）を付けられない:

| スクリプト | 付けられない理由 |
|---|---|
| `static.cloudflareinsights.com/beacon.min.js` | Cloudflare が予告なく更新する。ハッシュを固定すると黙って計測が止まる |
| `www.youtube.com/iframe_api` | 内容が日単位で変わる。さらに自身が別の URL の script を読む |

**この 2 本を信頼していることは承知の判断で、付け忘れではない。** どちらかの CDN が
侵害されれば全ページで任意 JS が動くので、防げないことを前提に**被害範囲を CSP で絞る**。
効いてくるのは `connect-src`（持ち出し先の制限）・`img-src`・`base-uri` / `form-action` で、
侵害された script が何をできるかを狭める。

### 各ディレクティブの理由

- **`script-src` に `'unsafe-inline'` を書かない。** そのためにインライン script を
  全ページから無くした（デモの起動は `handball-recorder/demo/mount.js`、LP の開閉は
  `handball-recorder/lp.js`）。hash 方式も採れるが、**本文を 1 文字直すたびに書き換えが
  要り、忘れるとスクリプトが黙って実行されなくなる**（どちらの JS も無くても崩れずに
  degrade するので、壊れても画面に出ない）
- **`'wasm-unsafe-eval'` はデモの wasm コアに必須。** これが無いと
  `handball_toolkit_wasm_bg.wasm` をインスタンス化できず、デモが「読み込み中...」で止まる
- **`style-src` は `'unsafe-inline'` を許す。** `style="..."` 属性が 13 箇所、
  `og-source/` の 4 枚にインライン `<style>` がある。inline style から JS は実行できないので
  script より危険度が低く、外に出す価値がコストを上回らないと判断した
- **`connect-src` の 2 ホスト**: `raw.githubusercontent.com` は配信データ（`demo.js` の
  `RAW_BASE`）、`cloudflareinsights.com` はビーコンの送信先。**ビーコンの配信元
  （`static.` 付き）と送信先（`static.` なし）はホストが違う**ので両方要る
- **`frame-src` / `script-src` の `www.youtube.com`**: プレーヤーの iframe と `iframe_api`。
  `s.ytimg.com` は**要らない**（実測。iframe_api が読む `www-widgetapi.js` も
  `www.youtube.com` から出る）

### `<meta>` では効かないもの

**`frame-ancestors` と `report-uri` / `report-to` は `<meta>` では仕様上無視される。**
つまり GitHub Pages のままでは**クリックジャッキング対策も違反レポートの収集も入らない**。
必要になったら Cloudflare の Transform Rules（Modify Response Header）で
`Content-Security-Policy` ヘッダを足す道がある。DNS は既に Cloudflare を通っている。

同じ理由で **`<meta>` の CSP に Report-Only は無い**。試すなら本番の前にローカルで配る。

### 広げるときの検証手順

`main` は保護されているが required check が無く、**merge = 即公開**なので本番で試せない。
ローカルで配って違反が出ないことを確かめてから出す。

```sh
cd apps/handball-apps-site
python3 -m http.server 8931 --bind 127.0.0.1
```

**拡張機能やブラウザ自動化から console を読む手は使えない** — 厳しい CSP は
それらが page context へ差し込む script も止めるので、**違反が無いのではなく
何も読めない**状態と区別できない。`'self'` で許可される検証用スクリプトを一時的に置き、
`securitypolicyviolation` イベントを拾わせて `document.title` に出すのが確実
（#284 の作業ではこの方法で 9 種のページが無違反であることと、わざと違反を仕込むと
検出されることの両方を確認した）。

見るページは 9 種類:
`/`・`/handball-recorder/`（LP）・`demo/`・`demo/?match=<slug>`・`demo/list/`・
`match/<slug>/`・`highlight/<slug>/`・`privacy/`・`support/`・`android/`。

- **`127.0.0.1` では YouTube が onError 150 を返す動画がある**（埋め込み元の制限）。
  CSP 違反ではないので取り違えないこと
- **`og-source/` の 4 枚には CSP を入れないこと**（当面）。ヘッドレス Chrome で
  OG 画像を焼く入力で、閲覧者向けページではない。入れるなら
  `scripts/generate-og.sh` が通ることを先に確かめる

## OG 画像の更新手順

X などで URL を貼ったときに出るカード画像の更新は、再生成だけでなく X 側のキャッシュ再クロールまでやって完了。

**手で直す OG は 4 枚。** どの URL を貼られるかで出るカードが違うので、直す対象を先に決める。

| 対象ページ | 生成元 | 出力 |
|---|---|---|
| トップ `/`（傘） | `og-source/index.html` | `images/og.jpg` |
| ハンド記録 `/handball-recorder/`（LP） | `handball-recorder/og-source/index.html` | `handball-recorder/images/og.jpg` |
| 試合データデモ `/handball-recorder/demo/` | `handball-recorder/demo/og-source/index.html` | `handball-recorder/demo/images/og.jpg` |
| Android 版 `/handball-recorder/android/` | `handball-recorder/android/og-source/index.html` | `handball-recorder/android/images/og.jpg` |

**Android 版のカードはアイコンと見出しだけの文字主体にする**（アプリ画面を載せない）。
初代は実画面 2 枚（サマリ + 得点差の推移）だったが、2026-09-01 に作り直した。

**カードに「見るだけ」と書かない。** スコープの正確な説明（記録機能はありません）は
**ページ本文が担当する**ので、嘘にはならない。カード側は「開発中」を添える。

どちらも訴求の判断で、**理由は親リポの戦略メモにある**（この repo は Web 配信されるため。
冒頭の「この repo は公開面」）。

**このページの素材にアプリの実画面を使うなら、動画プレーヤーが写る画面は避けること** —
上部プレーヤーに第三者の配信元サムネイル（ロゴ・チャンネル名）が出るので、親リポの
X 運用ポリシーに触れる。サマリ画面はプレーヤーを含まない。

**試合 / ハイライトの個別ページ（`/handball-recorder/{match,highlight}/<slug>/`）の OG は
この手順で扱わない。** 生成元も出力も親リポの `tools/generate-match-pages/` が作る
（`generate.py --og`。中で `scripts/generate-og.sh` を呼ぶ）。**このディレクトリの
`og-source/` を編集しても個別ページのカードは変わらない**ので、直す先を間違えないこと。
生成元 HTML はコミットされない（配信データから完全に導出できるため）。**中身はその試合の
実データ**（得点者名・得点王・成功率）なので、配信を差し替えたら画像も作り直すこと。

デモは LP と OG を共有していたが #229 で分けた。デモ URL を X に貼ると（#211）
リンク先は「その場で見られるページ」なのに LP の「落とすアプリ」のカードが出て
中身が伝わらなかったため。分けたことで互いに独立して更新できる（以前は LP の OG を
直すたびにデモ URL の再クロールも要った）。

1. 対象の `og-source/index.html` を編集する（1200×630 に収まる長さを保つ）
2. `scripts/generate-og.sh <src.html> <out.jpg>` で再生成する（macOS + Chrome 前提、1200×630 で出力）
   - 引数なしで実行するとハンド記録の LP ぶんを作る（既定）
   - 傘は `scripts/generate-og.sh og-source/index.html images/og.jpg`
   - デモは `scripts/generate-og.sh handball-recorder/demo/og-source/index.html handball-recorder/demo/images/og.jpg`
3. commit & push し、GitHub Pages への反映（1〜2 分）を確認する
4. X のカードキャッシュを再クロールさせる: **ログイン済みブラウザ**で <https://cards-dev.x.com/validator> を開き、
   **その OG を参照している URL を全部**送信する。**直したファイル名からこの表で送信先を引くこと**:

   > **2026-09-01 時点で Card Validator は廃止されており、この手順は使えない。**
   > カードは URL 単位でキャッシュされ、**こちらから再クロールさせる手段が無い**。
   > つまり**一度 X に貼った URL の OG は事実上差し替えられない**ので、
   > **貼る前に OG を確定させること**。新しいページを公開するときは特に注意する。

   | 直した OG | 送信する URL |
   |---|---|
   | `images/og.jpg`（傘） | `https://hand-plus.com/` |
   | `handball-recorder/images/og.jpg` | `https://hand-plus.com/handball-recorder/` |
   | `handball-recorder/demo/images/og.jpg` | `https://hand-plus.com/handball-recorder/demo/` |
   | `handball-recorder/android/images/og.jpg` | `https://hand-plus.com/handball-recorder/android/` |
   | `handball-recorder/{match,highlight}/<slug>/og.jpg` | `https://hand-plus.com/handball-recorder/{match,highlight}/<slug>/`（その slug だけ） |

   プライバシー / サポートの 2 ページは OG タグを持たないので対象外。
   - **1 枚 = 1 ページの対応**（#229 でデモを分けた結果、#231 の個別ページも 1 対 1）。
     以前は LP とデモが 1 枚を共有していて、片方だけ再クロールして古いカードが残る事故があった
   - **個別ページの絵柄を変えたら 51 件すべての再クロールが要る** = 実質やり直せないので、
     絵柄は X に貼り始める前に固めておくこと
   - プレビューは表示されない（2022 年に廃止済み）。ログに `Page fetched successfully` / `Card loaded successfully` が出れば再クロール成功
   - **API では代替できない**。Card Validator はログインセッションを要求し、公開 API も無い。
     ここだけは手作業として残る
5. ポスト作成画面に URL を貼り、新しいカードが表示されることを確認して破棄する（投稿しない）。固定ポストなど既存ポストのカードも数分で置き換わる
- 親リポ `handball-project` から submodule として参照される
