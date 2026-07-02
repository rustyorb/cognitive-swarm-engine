#!/usr/bin/env bash
# Start the Cognitive Swarm Engine in the background.
# Optional first argument overrides the port (default: 3737 to avoid common 3000 clashes).
set -e
cd "$(dirname "$0")"

PORT="${1:-${PORT:-3737}}"
export PORT

echo "Starting Cognitive Swarm Engine on port $PORT (auto-falls-back if busy)..."
nohup npm run dev > swarm.log 2>&1 &

# Surface the actual URL the server binds to (it may auto-increment if PORT is busy).
for _ in $(seq 1 40); do
  url=$(grep -m1 -o 'http://localhost:[0-9]*' swarm.log 2>/dev/null || true)
  if [ -n "$url" ]; then
    echo "  ⬡  Running at: $url"
    break
  fi
  sleep 0.5
done

echo "Logs: swarm.log   |   Stop with: ./stop.sh"
