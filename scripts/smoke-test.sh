#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# eos-oncallers smoke test
# Verifies all tabs and features work locally
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

# ── 2. Dashboard HTML with all tabs ─────────────────────
DASH=$(curl -sf "${BASE_URL}/" 2>/dev/null || echo "")
if echo "$DASH" | grep -q "eos-oncallers"; then
  pass "/ returns HTML with app title"
else
  fail_test "/ did not return expected HTML"
fi

for TAB in tab-overview tab-incidents tab-services tab-schedules tab-escalations tab-users tab-teams tab-integrations tab-status-pages tab-automation tab-analytics tab-audit tab-settings; do
  if echo "$DASH" | grep -q "$TAB"; then
    pass "HTML has $TAB marker"
  else
    fail_test "HTML missing $TAB marker"
  fi
done

# ── 3. Login with admin credentials ────────────────────
LOGIN=$(curl -sf -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${SEED_ADMIN_EMAIL:-admin@oncall.local}\",\"password\":\"${SEED_ADMIN_PASSWORD:?Set SEED_ADMIN_PASSWORD env var}\"}" 2>/dev/null || echo "")
TOKEN=$(echo "$LOGIN" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [[ -n "$TOKEN" ]]; then
  pass "Login successful, got JWT token"
else
  fail_test "Login failed (response: ${LOGIN:-empty})"
fi

AUTH="-H \"Authorization: Bearer ${TOKEN}\""

# ── 4. Dashboard summary ───────────────────────────────
if [[ -n "$TOKEN" ]]; then
  SUMMARY=$(curl -sf "${BASE_URL}/api/dashboard/summary" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  SERVICES=$(echo "$SUMMARY" | grep -o '"services":[0-9]*' | cut -d: -f2)
  SCHEDULES=$(echo "$SUMMARY" | grep -o '"schedules":[0-9]*' | cut -d: -f2)
  
  if [[ "${SERVICES:-0}" -gt 0 ]]; then
    pass "Dashboard: ${SERVICES} services"
  else
    fail_test "Dashboard: expected >0 services (got: ${SERVICES:-null})"
  fi
  
  if [[ "${SCHEDULES:-0}" -gt 0 ]]; then
    pass "Dashboard: ${SCHEDULES} schedules"
  else
    fail_test "Dashboard: expected >0 schedules (got: ${SCHEDULES:-null})"
  fi
fi

# ── 5. Users API ─────────────────────────────────────────
if [[ -n "$TOKEN" ]]; then
  USERS=$(curl -sf "${BASE_URL}/api/users" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  if echo "$USERS" | grep -q '"email"'; then
    USER_COUNT=$(echo "$USERS" | grep -o '"email"' | wc -l | tr -d " ")
    pass "Users API: ${USER_COUNT} users"
  else
    fail_test "Users API: no users returned"
  fi

  if echo "$USERS" | grep -q '"hasPhone"'; then
    pass "Users API: masks phone (hasPhone)"
  else
    fail_test "Users API: missing hasPhone"
  fi
fi

# ── 6. Schedules API ────────────────────────────────────
if [[ -n "$TOKEN" ]]; then
  SCHEDS=$(curl -sf "${BASE_URL}/api/schedules" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  if echo "$SCHEDS" | grep -q '"layers"'; then
    pass "Schedules API: returned with layers"
  else
    fail_test "Schedules API: no layers"
  fi

  if echo "$SCHEDS" | grep -q '"currentOnCall"'; then
    pass "Schedules API: currentOnCall present"
  else
    fail_test "Schedules API: missing currentOnCall"
  fi
fi

# ── 7. Services API ─────────────────────────────────────
if [[ -n "$TOKEN" ]]; then
  SVCS=$(curl -sf "${BASE_URL}/api/services" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  if echo "$SVCS" | grep -q '"name"'; then
    pass "Services API: returned services"
  else
    fail_test "Services API: no services"
  fi
fi

# ── 8. Escalation Policies API ──────────────────────────
if [[ -n "$TOKEN" ]]; then
  ESCAL=$(curl -sf "${BASE_URL}/api/escalation-policies" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  if echo "$ESCAL" | grep -q '"levels"'; then
    pass "Escalation Policies API: returned with levels"
  else
    fail_test "Escalation Policies API: no levels data"
  fi
fi

# ── 9. Teams API ────────────────────────────────────────
if [[ -n "$TOKEN" ]]; then
  TEAMS=$(curl -sf "${BASE_URL}/api/teams" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  if echo "$TEAMS" | grep -q '"name"'; then
    pass "Teams API: returned teams"
  else
    fail_test "Teams API: no teams"
  fi
fi

# ── 10. Trigger incident via webhook ────────────────────
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
  
  if echo "$TRIGGER" | grep -q '"status"'; then
    pass "Webhook trigger: received response"
  else
    fail_test "Webhook trigger failed (response: ${TRIGGER:-empty})"
  fi
fi

# ── 11. Incidents API ───────────────────────────────────
if [[ -n "$TOKEN" ]]; then
  INCS=$(curl -sf "${BASE_URL}/api/incidents" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  if echo "$INCS" | grep -q '"title"'; then
    pass "Incidents API: returned incidents"
  else
    fail_test "Incidents API: no incidents"
  fi
fi

# ── 12. Analytics API ───────────────────────────────────
if [[ -n "$TOKEN" ]]; then
  ANALYTICS=$(curl -sf "${BASE_URL}/api/analytics/summary" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  if echo "$ANALYTICS" | grep -q '"total"'; then
    pass "Analytics API: returned summary"
  else
    fail_test "Analytics API: failed (response: ${ANALYTICS:-empty})"
  fi
fi

# ── 13. Activity Log API ────────────────────────────────
if [[ -n "$TOKEN" ]]; then
  AUDIT=$(curl -sf "${BASE_URL}/api/activity-log" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  if echo "$AUDIT" | grep -q '"total"'; then
    pass "Activity Log API: returned response"
  else
    fail_test "Activity Log API: failed (response: ${AUDIT:-empty})"
  fi
fi

# ── 14. Settings API ────────────────────────────────────
if [[ -n "$TOKEN" ]]; then
  SETTINGS=$(curl -sf "${BASE_URL}/api/settings" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  if echo "$SETTINGS" | grep -q '"integrations"'; then
    pass "Settings API: returned config"
  else
    fail_test "Settings API: failed (response: ${SETTINGS:-empty})"
  fi
fi

# ── 15. Status Pages API ────────────────────────────────
if [[ -n "$TOKEN" ]]; then
  STATUS=$(curl -sf "${BASE_URL}/api/status-pages" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  if echo "$STATUS" | grep -q '\['; then
    pass "Status Pages API: returned array"
  else
    fail_test "Status Pages API: failed"
  fi
fi

# ── 16. Alert Rules API ─────────────────────────────────
if [[ -n "$TOKEN" ]]; then
  RULES=$(curl -sf "${BASE_URL}/api/alert-rules" \
    -H "Authorization: Bearer ${TOKEN}" 2>/dev/null || echo "")
  
  if echo "$RULES" | grep -q '\['; then
    pass "Alert Rules API: returned array"
  else
    fail_test "Alert Rules API: failed"
  fi
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
