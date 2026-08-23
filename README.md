# handball-apps-site

ハンドボール関連 iOS アプリの公式サイト。GitHub Pages で公開する静的サイト。

App Store 申請時に必要な **Privacy Policy URL** と **Support URL** をホスティングするのが主目的。

## 公開 URL

`https://hand-plus.com/`（旧 `kinjo-ryura.github.io/handball-apps-site/` は 301 リダイレクト）

| ページ | パス |
|--------|------|
| トップ | `/` |
| ハンド記録 アプリページ | `/handball-recorder/` |
| ハンド記録 試合データデモ | `/handball-recorder/demo/` |
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
    ├── images/                         # スクリーンショット・アイコン・OG 画像
    ├── og-source/index.html            # OG 画像の生成元
    ├── privacy/index.html              # Privacy Policy
    └── support/index.html              # Support
```

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

## OG 画像の更新手順

X などで URL を貼ったときに出るカード画像の更新は、再生成だけでなく X 側のキャッシュ再クロールまでやって完了。

**OG は 3 枚ある。** どの URL を貼られるかで出るカードが違うので、直す対象を先に決める。

| 対象ページ | 生成元 | 出力 |
|---|---|---|
| トップ `/`（傘） | `og-source/index.html` | `images/og.jpg` |
| ハンド記録 `/handball-recorder/`（LP） | `handball-recorder/og-source/index.html` | `handball-recorder/images/og.jpg` |
| 試合データデモ `/handball-recorder/demo/` | `handball-recorder/demo/og-source/index.html` | `handball-recorder/demo/images/og.jpg` |

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

   | 直した OG | 送信する URL |
   |---|---|
   | `images/og.jpg`（傘） | `https://hand-plus.com/` |
   | `handball-recorder/images/og.jpg` | `https://hand-plus.com/handball-recorder/` |
   | `handball-recorder/demo/images/og.jpg` | `https://hand-plus.com/handball-recorder/demo/` |

   プライバシー / サポートの 2 ページは OG タグを持たないので対象外。
   - **いまは 1 枚 = 1 ページの対応**（#229 でデモを分けた結果）。以前は LP とデモが
     1 枚を共有していて、片方だけ再クロールして古いカードが残る事故があった。
     将来また共有が生じたら、この表に URL を並べて取りこぼしを防ぐこと
   - プレビューは表示されない（2022 年に廃止済み）。ログに `Page fetched successfully` / `Card loaded successfully` が出れば再クロール成功
   - **API では代替できない**。Card Validator はログインセッションを要求し、公開 API も無い。
     ここだけは手作業として残る
5. ポスト作成画面に URL を貼り、新しいカードが表示されることを確認して破棄する（投稿しない）。固定ポストなど既存ポストのカードも数分で置き換わる
- 親リポ `handball-project` から submodule として参照される
