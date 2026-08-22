#!/usr/bin/env bash
# og-source の HTML をヘッドレス Chrome で 1200×630 に描画し、OG 画像を再生成する。
#
# 使い方:
#   scripts/generate-og.sh                      # ハンド記録（既定）
#   scripts/generate-og.sh <src.html> <out.jpg> # 任意のソース / 出力
#
# 傘（ハンドプラス）の OG:
#   scripts/generate-og.sh og-source/index.html images/og.jpg
#
# 前提: macOS（sips 使用）+ Google Chrome。
# Chrome の場所が違う場合は環境変数 CHROME で指定する。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# 引数があればそれを使う（リポジトリルートからの相対パスでも絶対パスでも可）。
SRC="${1:-handball-recorder/og-source/index.html}"
OUT="${2:-handball-recorder/images/og.jpg}"
[[ "$SRC" = /* ]] || SRC="$REPO_ROOT/$SRC"
[[ "$OUT" = /* ]] || OUT="$REPO_ROOT/$OUT"
mkdir -p "$(dirname "$OUT")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --window-size=1200,630 --screenshot="$TMP_DIR/og.png" \
    "file://$SRC" >/dev/null 2>&1

sips -s format jpeg -s formatOptions 90 "$TMP_DIR/og.png" --out "$OUT" >/dev/null

sips -g pixelWidth -g pixelHeight "$OUT"
echo "generated: $OUT"
