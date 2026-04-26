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
- 親リポ `handball-project` から submodule として参照される
