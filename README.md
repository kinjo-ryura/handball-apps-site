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
