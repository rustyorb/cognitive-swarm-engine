#!/usr/bin/env bash
# Stop the running Cognitive Swarm Engine (uses the PID it wrote on startup).
cd "$(dirname "$0")"

if [ ! -f .swarm.pid ]; then
  echo "No .swarm.pid found - the server does not appear to be running."
  exit 0
fi

PID=$(head -n1 .swarm.pid)
echo "Stopping Cognitive Swarm Engine (PID $PID)..."

if command -v taskkill >/dev/null 2>&1; then
  # Windows (incl. Git Bash): POSIX `kill` uses MSYS pseudo-pids and cannot
  # terminate a native Windows process, so use taskkill with a tree (/T) kill.
  taskkill //PID "$PID" //T //F >/dev/null 2>&1 || taskkill /PID "$PID" /T /F >/dev/null 2>&1
else
  # Unix: graceful then forceful.
  kill "$PID" 2>/dev/null || true
  sleep 1
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" 2>/dev/null || true
  fi
fi

rm -f .swarm.pid
echo "Stopped."
