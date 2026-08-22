#!/usr/bin/env bash
# icon-source/brand-mark.svg から傘（ハンドプラス）のブランドアイコンを書き出す。
#
# 使い方:
#   scripts/generate-brand-icon.sh
#
# 生成物:
#   images/brand-icon.png        1024（OG・大きく使う場面用）
#   images/icon-{512,180,32}.png favicon / apple-touch-icon
#
# 色は琥珀 #F59E0B。両アプリのアイコンで五角形に使われている色で、背景色
# （ハンド記録=紫 / シュートフォーム分析=青）と違って 3 つを貫く family の印になる。
# **明暗どちらの背景でも沈まない**ため、白タブ用と黒タブ用を作り分けずに 1 系統で済む
# （濃色や白にすると背景ごとに差し替えが要る。#211 で実測して選んだ）。
#
# マークの形状の根拠は icon-source/brand-mark.svg のコメントに書いてある。
#
# 背景は透過。Icon Composer を使わないのは、角丸の枠が必ず付いて透過の枠を作れないため。
#
# 前提: macOS（sips 使用）+ Google Chrome。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/icon-source/brand-mark.svg"
OUT_DIR="$REPO_ROOT/images"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
COLOR="${COLOR:-#F59E0B}"

mkdir -p "$OUT_DIR"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

sed "s/currentColor/$COLOR/g" "$SRC" > "$TMP_DIR/m.svg"
cat > "$TMP_DIR/m.html" <<HTML
<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
html,body{margin:0;padding:0;width:1024px;height:1024px;background:transparent}
img{display:block;width:1024px;height:1024px}
</style></head><body><img src="m.svg"></body></html>
HTML
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --window-size=1024,1024 --screenshot="$OUT_DIR/brand-icon.png" \
    "file://$TMP_DIR/m.html" >/dev/null 2>&1

for px in 512 180 32; do
    sips -Z "$px" "$OUT_DIR/brand-icon.png" --out "$OUT_DIR/icon-$px.png" >/dev/null
done

for f in brand-icon icon-512 icon-180 icon-32; do
    printf '  %-18s ' "$f.png"
    sips -g pixelWidth -g pixelHeight "$OUT_DIR/$f.png" | tail -2 | tr -d '\n' | tr -s ' '
    echo
done
echo "color: $COLOR / generated in: $OUT_DIR"
