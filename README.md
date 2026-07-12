# handball-apps-site

ハンドボール関連 iOS アプリの公式サイト。GitHub Pages で公開する静的サイト。

App Store 申請時に必要な **Privacy Policy URL** と **Support URL** をホスティングするのが主目的。

## 公開 URL

`https://kinjo-ryura.github.io/handball-apps-site/`

| ページ | パス |
|--------|------|
| トップ | `/` |
| ハンド記録 アプリページ | `/handball-recorder/` |
| ハンド記録 プライバシーポリシー | `/handball-recorder/privacy/` |
| ハンド記録 サポート | `/handball-recorder/support/` |

## ディレクトリ構成

```
.
├── index.html                          # トップ（アプリ一覧）
├── style.css                           # 共通スタイル
└── handball-recorder/
    ├── index.html                      # アプリ概要
    ├── privacy/index.html              # Privacy Policy
    └── support/index.html              # Support
```

新しいアプリを追加する場合は `<app-slug>/{privacy,support}/index.html` を増やす。

## GitHub Pages 設定

リポジトリの **Settings → Pages → Branch: `main` / `/` (root)** で公開する。

公開反映までは push 後 1〜2 分。

### デプロイが「Deployment failed, try again later.」で失敗するとき

ビルド成功後の deploy 工程だけが失敗することがある（サービスステータスは operational のまま。2026-07-05 に 3 連続発生）。

- 復旧は `gh api -X POST repos/kinjo-ryura/handball-apps-site/pages/builds` で新規ビルドを投入するのが最も確実
- GUI に「Run workflow」ボタンは無い（Pages のワークフローは GitHub 管理）。Actions の「Re-run all jobs」は re-run が queue に入らず宙吊りになることがあり、その状態の run はキャンセルも不可（放置でよい）
- 反映確認は `curl` で新規追加ファイルの 200 と HTML 内の目印文字列を見る。REST の `pages/builds/latest` は状態が陳腐化することがあるため `gh run list --workflow pages-build-deployment` の方が正確

### キャッシュ特性

Pages は CSS 等を約 10 分キャッシュさせるため、デプロイ直後の再訪問者（特に X アプリ内 WebView）は「新 HTML + 旧 CSS」で表示が崩れることがある。時間経過で自然解消し、初見の訪問者には影響しない。

## 編集時のメモ

- HTML 内のリンクパスはサブパス公開（`/handball-apps-site/...`）前提で書いている。カスタムドメインに切り替える場合は absolute path を相対 path に直すか、base 要素を入れる
- OG 画像（`handball-recorder/images/og.jpg`）は直接編集しない。更新は下記「OG 画像の更新手順」に従う

## OG 画像の更新手順

X などで URL を貼ったときに出るカード画像の更新は、再生成だけでなく X 側のキャッシュ再クロールまでやって完了。

1. `handball-recorder/og-source/index.html` を編集する（1200×630 に収まるよう、箇条書きは 4 項目・1 行に収まる長さを保つ）
2. `scripts/generate-og.sh` を実行して `og.jpg` を再生成する（macOS + Chrome 前提、1200×630 で出力）
3. commit & push し、GitHub Pages への反映（1〜2 分）を確認する
4. X のカードキャッシュを再クロールさせる: **ログイン済みブラウザ**で <https://cards-dev.x.com/validator> を開き、対象ページの URL（例: `https://kinjo-ryura.github.io/handball-apps-site/handball-recorder/`）を送信する
   - プレビューは表示されない（2022 年に廃止済み）。ログに `Page fetched successfully` / `Card loaded successfully` が出れば再クロール成功
5. ポスト作成画面に URL を貼り、新しいカードが表示されることを確認して破棄する（投稿しない）。固定ポストなど既存ポストのカードも数分で置き換わる
- 親リポ `handball-project` から submodule として参照される
