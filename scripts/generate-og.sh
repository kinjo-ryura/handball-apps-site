#!/usr/bin/env bash
# og-source/index.html をヘッドレス Chrome で 1200×630 に描画し、
# handball-recorder/images/og.jpg を再生成する。
#
# 使い方:
#   scripts/generate-og.sh
#
# 前提: macOS（sips 使用）+ Google Chrome。
# Chrome の場所が違う場合は環境変数 CHROME で指定する。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/handball-recorder/og-source/index.html"
OUT="$REPO_ROOT/handball-recorder/images/og.jpg"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --window-size=1200,630 --screenshot="$TMP_DIR/og.png" \
    "file://$SRC" >/dev/null 2>&1

sips -s format jpeg -s formatOptions 90 "$TMP_DIR/og.png" --out "$OUT" >/dev/null

sips -g pixelWidth -g pixelHeight "$OUT"
echo "generated: $OUT"
