#!/bin/bash
# Starts Autobahn Outlaws on http://localhost:3000 and opens it in your browser.
# Works from Terminal, a Finder double-click, or a macOS Automator "Run Shell Script" action.
# The server keeps running in the background; stop it with tools/stop-game.command.

PORT="${PORT:-3000}"
URL="http://localhost:$PORT"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
GAME="$DIR/Site/games/autobahn-outlaws"
LOG="${TMPDIR:-/tmp}/autobahn-outlaws-server.log"

# Automator and Finder start with a minimal PATH, so add the usual Node install locations.
NVM_NODE="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -n 1)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:${NVM_NODE:+$NVM_NODE:}$PATH"

say_error() {
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display alert \"Autobahn Outlaws\" message \"$1\"" >/dev/null 2>&1
  fi
  echo "Autobahn Outlaws: $1" >&2
}

is_up() { curl -s -o /dev/null --max-time 1 "$URL/"; }

if ! is_up; then
  if command -v node >/dev/null 2>&1; then
    PORT="$PORT" nohup node "$DIR/tools/serve-game.mjs" </dev/null >"$LOG" 2>&1 &
  elif command -v python3 >/dev/null 2>&1 && python3 -c 'import http.server' >/dev/null 2>&1; then
    nohup python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$GAME" </dev/null >"$LOG" 2>&1 &
  else
    say_error "Node.js is needed to run the game. Install it from nodejs.org, then try again."
    exit 1
  fi
  for _ in $(seq 1 40); do
    is_up && break
    sleep 0.25
  done
fi

if ! is_up; then
  say_error "The game server did not start. Is port $PORT already used by another app? Details: $LOG"
  exit 1
fi

if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1
else
  echo "Autobahn Outlaws is running at $URL"
fi
