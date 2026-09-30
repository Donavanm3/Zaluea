#!/bin/bash
# Stops the Autobahn Outlaws server started by tools/start-game.command.
PORT="${PORT:-3000}"
PIDS="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null)"
if [ -n "$PIDS" ]; then
  kill $PIDS
  echo "Stopped the game server on port $PORT."
else
  echo "No game server is running on port $PORT."
fi
