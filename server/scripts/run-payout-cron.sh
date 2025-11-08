#!/usr/bin/env bash
# Safe wrapper to run the payout script with a simple lock (works on macOS)
set -euo pipefail

LOCK_DIR="/tmp/battlehub-payout.lockdir"
LOG_DIR="$(cd "$(dirname "$0")" && pwd)/logs"
mkdir -p "$LOG_DIR"

# Try to acquire lock by creating directory (atomic)
if mkdir "$LOCK_DIR" 2>/dev/null; then
  # acquired lock
  trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM
  echo "[`date -u +'%Y-%m-%dT%H:%M:%SZ'`] Starting payout run (apply=true)" >> "$LOG_DIR/payout-$(date +%Y%m%d).log"
  # Run payout script (node) — adjust PATH if needed
  /usr/bin/env node "$(cd "$(dirname "$0")" && pwd)/scripts/payout-unpaid.js" --apply >> "$LOG_DIR/payout-$(date +%Y%m%d).log" 2>&1 || {
    echo "[`date -u +'%Y-%m-%dT%H:%M:%SZ'`] payout script failed" >> "$LOG_DIR/payout-$(date +%Y%m%d).log"
    exit 1
  }
  echo "[`date -u +'%Y-%m-%dT%H:%M:%SZ'`] Finished payout run" >> "$LOG_DIR/payout-$(date +%Y%m%d).log"
  exit 0
else
  # lock exists -> another job running
  echo "[`date -u +'%Y-%m-%dT%H:%M:%SZ'`] Lock present, skipping payout run" >> "$LOG_DIR/payout-$(date +%Y%m%d).log"
  exit 0
fi
