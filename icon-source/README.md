# icon-source/

傘（ハンドプラス）自身のブランドマークの**元データ**を置くディレクトリ。

アプリのアイコンはそれぞれのアプリ repo が持つ（`HandballRecorder.icon` /
`handball_app.icon`）。ここに置くのは**サイトの傘としてのマークだけ**。

```
icon-source/
└── brand-mark.svg   透過 SVG。fill は currentColor
```

## Icon Composer を使っていない理由

アプリのアイコンは Icon Composer（Xcode 同梱）で作っているが、**傘のマークには使えない**。
角丸の枠（squircle）が必ず適用され、**透過の枠を作れない**ため。マーク単体で背景を選ばず
使いたいので、素の SVG で持っている。

## 書き出し

```sh
scripts/generate-brand-icon.sh
```

| 生成物 | 用途 |
|---|---|
| `images/brand-icon.png`（1024） | OG の署名など大きく使う場面 |
| `images/icon-180.png` | apple-touch-icon |
| `images/icon-32.png` | favicon |
| `images/icon-512.png` | 予備 |

色は琥珀 `#F59E0B` 固定（`COLOR` 環境変数で上書き可）。**明暗どちらの背景でも沈まない**
ので、白タブ用と黒タブ用を作り分けずに 1 系統で運用できる。

## 形状の根拠

`brand-mark.svg` の冒頭コメントに、回転角・隙間の作り方・隙間が必須である理由を
すべて書いてある（#211 で 3 方式 × 回転 7 × 押し込み量 6 を比較して決定）。**形を変える
ときはそのコメントも直すこと。**

## 注意

- **アプリのアイコン（Icon Composer 書き出し）は角丸が焼き込まれている**（四隅が透明）。
  CSS で `border-radius` を重ねると二重に丸まって隅が欠けるので当てないこと。
  `style.css` の `.app-list-icon` / `.header-icon` / `.app-icon` は同じ理由で角丸を外してある
- **傘のマークは角丸を持たない**（枠が無いので不要）
- `h++` は**ワードマーク**でマークとは別物。OG の署名では「マーク + `h++`」を並べる
