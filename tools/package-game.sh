#!/bin/sh
# Packages Autobahn Outlaws as a zip with index.html at the root (for itch.io and similar hosts).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GAME="$ROOT/Site/games/autobahn-outlaws"
OUT="$ROOT/dist"
mkdir -p "$OUT"
rm -f "$OUT/autobahn-outlaws.zip"
cd "$GAME"
zip -r -q "$OUT/autobahn-outlaws.zip" index.html style.css README.md src lib
echo "Created $OUT/autobahn-outlaws.zip"
