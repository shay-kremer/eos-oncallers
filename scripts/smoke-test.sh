#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# eos-oncallers smoke test
# Verifies the local server is running and healthy
# ──────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

pass() { echo -e "${GREEN}✔ PASS${NC} $*"; PASS=$((PASS+1)); }
fail_test() { echo -e "${RED}✖ FAIL${NC} $*"; FAIL=$((FAIL+1)); }

echo -e "${CYAN}Running smoke tests against ${BASE_URL}${NC}"
echo ""

# ── 1. Health check ─────────────────────────────────────
HEALTH=$(curl -sf "${BASE_URL}/health" 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  pass "/health returns OK"
else
  fail_test "/health did not return ok (got: ${HEALTH:-connection refused})"
fi

# ── 2. Dashboard HTML ───────────────────────────────────
DASH=$(curl -sf "${BASE_URL}/" 2>/dev/null || echo "")
if echo "$DASH" | grep -q "eos-oncallers"; then
  pass "/ returns HTML with dashboard marker"
else
  fail_test "/ did not return expected HTML dashboard"
fi

# ── 3. Login with admin credentials ────────────────────
LOGIN=$(curl -sf -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@oncall.local","password":"admin123!"}' 2>/dev/null || echo "")
TOKEN=$(echo "$LOGIN" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [[ -n "$TOKEN" ]]; then
  pass "Login successful, got JWT token"
else
  fail_test "Login failed (response: ${LOGIN:-empty})"
fi

# ── 4. Dashboard summary with auth ─────────────────────
if [[ -n "$TOKEN" ]]; then
  SUMMARY=$(curl -sf "${BASE_URL}/api/dashboard/summary" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  SERVICES=$(echo "$SUMMARY" | grep -o '"services":[0-9]*' | cut -d: -f2)
  SCHEDULES=$(echo "$SUMMARY" | grep -o '"schedules":[0-9]*' | cut -d: -f2)
  
  if [[ "${SERVICES:-0}" -gt 0 ]]; then
    pass "Dashboard summary: ${SERVICES} services"
  else
    fail_test "Dashboard summary: expected >0 services (got: ${SERVICES:-null}, response: ${SUMMARY:-empty})"
  fi
  
  if [[ "${SCHEDULES:-0}" -gt 0 ]]; then
    pass "Dashboard summary: ${SCHEDULES} schedules"
  else
    fail_test "Dashboard summary: expected >0 schedules (got: ${SCHEDULES:-null})"
  fi
fi

# ── 5. Trigger incident via webhook events endpoint ─────
if [[ -n "$TOKEN" ]]; then
  TRIGGER=$(curl -sf -X POST "${BASE_URL}/api/webhooks/events" \
    -H "Content-Type: application/json" \
    -d '{
      "routing_key": "demo-integration-key-001",
      "event_action": "trigger",
      "dedup_key": "smoke-test-'$$'",
      "payload": {
        "summary": "Smoke test incident",
        "source": "smoke-test",
        "severity": "INFO"
      }
    }' 2>/dev/null || echo "")
  
  if echo "$TRIGGER" | grep -q '"status":"triggered"'; then
    pass "Webhook triggered incident successfully"
  elif echo "$TRIGGER" | grep -q '"status":"deduplicated"'; then
    pass "Webhook deduplicated (incident already exists)"
  else
    fail_test "Webhook trigger failed (response: ${TRIGGER:-empty})"
  fi
fi

# ── 6. Users API ─────────────────────────────────────────
if [[ -n "$TOKEN" ]]; then
  USERS=$(curl -sf "${BASE_URL}/api/users" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  if echo "$USERS" | grep -q email; then
    USER_COUNT=$(echo "$USERS" | grep -o email | wc -l | tr -d " ")
    pass "Users API: ${USER_COUNT} users returned with email field"
  else
    fail_test "Users API: no users returned (response: ${USERS:-empty})"
  fi

  if echo "$USERS" | grep -q teams; then
    pass "Users API: includes team memberships"
  else
    fail_test "Users API: missing teams field"
  fi

  if echo "$USERS" | grep -q hasPhone; then
    pass "Users API: masks phone (shows hasPhone indicator)"
  else
    fail_test "Users API: missing hasPhone indicator"
  fi
fi

# ── 7. Schedules API ────────────────────────────────────
if [[ -n "$TOKEN" ]]; then
  SCHEDS=$(curl -sf "${BASE_URL}/api/schedules" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  if echo "$SCHEDS" | grep -q layers; then
    SCHED_COUNT=$(echo "$SCHEDS" | grep -o name | wc -l | tr -d " ")
    pass "Schedules API: returned schedules with layers (${SCHED_COUNT} name fields)"
  else
    fail_test "Schedules API: no schedules with layers (response: ${SCHEDS:-empty})"
  fi

  if echo "$SCHEDS" | grep -q currentOnCall; then
    pass "Schedules API: includes currentOnCall computation"
  else
    fail_test "Schedules API: missing currentOnCall field"
  fi
fi

# ── 8. Dashboard UI markers ─────────────────────────────
DASH_HTML=$(curl -sf "${BASE_URL}/" 2>/dev/null || echo "")

if echo "$DASH_HTML" | grep -q tab-users; then
  pass "Dashboard HTML: has Users tab marker"
else
  fail_test "Dashboard HTML: missing tab-users marker"
fi

if echo "$DASH_HTML" | grep -q tab-schedules; then
  pass "Dashboard HTML: has Schedules tab marker"
else
  fail_test "Dashboard HTML: missing tab-schedules marker"
fi

if echo "$DASH_HTML" | grep -q panel-users; then
  pass "Dashboard HTML: has Users panel"
else
  fail_test "Dashboard HTML: missing panel-users"
fi

if echo "$DASH_HTML" | grep -q schedules-list; then
  pass "Dashboard HTML: has Schedules list"
else
  fail_test "Dashboard HTML: missing schedules-list"
fi

if echo "$DASH_HTML" | grep -q loadUsers; then
  pass "Dashboard JS: has loadUsers function"
else
  fail_test "Dashboard JS: missing loadUsers function"
fi

if echo "$DASH_HTML" | grep -q loadSchedules; then
  pass "Dashboard JS: has loadSchedules function"
else
  fail_test "Dashboard JS: missing loadSchedules function"
fi


# ── Results ─────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e " Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
