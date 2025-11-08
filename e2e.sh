#!/usr/bin/env bash
set -euo pipefail

# ---- CONFIG (tokens & admin key you provided) ----
API_BASE="http://localhost:4000"
ALICE_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5MGE0ZWI0M2FmNjg0ZmE3ZWU5ZGU5MSIsImVtYWlsIjoiYWxpY2VAYmF0dGxlaHViLmxvY2FsIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NjIyODMyNjYsImV4cCI6MTc2Mjg4ODA2Nn0.rjkP1pR5mSIrz5CsvWirZyOpgPrMpVhK4tP_wLe3Ee0"
BOB_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5MGE2OTdkZGEzMzNiNDM0MTNjY2Q3YSIsImVtYWlsIjoiYm9iQGJhdHRsZWh1Yi5sb2NhbCIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzYyMjkwMDQ1LCJleHAiOjE3NjI4OTQ4NDV9.QqK9me47P80O3CFll-_i1eEPmXfA4k7FyOiNKL7_UDI"
ADMIN_KEY='BattleHub2025Secret!'

# Ensure jq exists
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed. Install jq and rerun."
  exit 1
fi

echo "=== Starting E2E test run ==="

# 1) Create a test battle (startAt in the past to be immediately eligible)
TITLE="E2E: AutoPayout Test $(date +%s)"
START_AT="2025-11-01T00:00:00.000Z"

echo "1) Creating battle..."
CREATE_RESP=$(curl -s -X POST "${API_BASE}/battles/create" \
  -H "Authorization: Bearer ${ALICE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"${TITLE}\",\"sport\":\"car\",\"entryFeeUSD\":5,\"startAt\":\"${START_AT}\"}")

echo "${CREATE_RESP}" | jq
BATTLE_ID=$(printf "%s" "${CREATE_RESP}" | jq -r '.battle._id // empty')
if [ -z "$BATTLE_ID" ]; then
  echo "ERROR: could not get battle id from create response"
  exit 1
fi
echo " -> BATTLE_ID=${BATTLE_ID}"

# 2) Join battle as Alice
echo "2) Joining battle as Alice..."
curl -s -X POST "${API_BASE}/battles/${BATTLE_ID}/join" \
  -H "Authorization: Bearer ${ALICE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}' | jq

# 3) Join battle as Bob
echo "3) Joining battle as Bob..."
curl -s -X POST "${API_BASE}/battles/${BATTLE_ID}/join" \
  -H "Authorization: Bearer ${BOB_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}' | jq

# 4) Confirm entries
echo "4) Entries for battle ${BATTLE_ID}:"
curl -s "${API_BASE}/battles/${BATTLE_ID}/entries" | jq

# 5) Run matchmaking (admin)
echo "5) Running matchmaking (admin)..."
MATCHMAKING_RESP=$(curl -s -X POST "${API_BASE}/admin/run-matchmaking" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -H "Content-Type: application/json" )

echo "${MATCHMAKING_RESP}" | jq

# grab the created match id (if any)
MATCH_ID=$(printf "%s" "${MATCHMAKING_RESP}" | jq -r '.processed[0].matchId // empty')
if [ -z "$MATCH_ID" ]; then
  echo "No match created by matchmaking. Exiting."
  exit 0
fi
echo " -> MATCH_ID=${MATCH_ID}"

# 6) Verify the match (audit)
echo "6) Verify match audit:"
curl -s -H "x-admin-key: ${ADMIN_KEY}" "${API_BASE}/admin/match/${MATCH_ID}/verify" | jq

# 7) Payout the match
echo "7) Attempting payout for match ${MATCH_ID}..."
PAYOUT_RESP=$(curl -s -X POST -H "x-admin-key: ${ADMIN_KEY}" "${API_BASE}/admin/payout/${MATCH_ID}")
echo "${PAYOUT_RESP}" | jq

# 8) Show updated transactions & users
echo "8) Transactions:"
curl -s -H "x-admin-key: ${ADMIN_KEY}" "${API_BASE}/admin/transactions" | jq

echo "9) Users (balances):"
curl -s -H "x-admin-key: ${ADMIN_KEY}" "${API_BASE}/admin/users" | jq

echo "=== E2E test complete ==="
