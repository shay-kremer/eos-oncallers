#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# eos-oncallers local development startup script
# ──────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}ℹ ${NC}$*"; }
ok()    { echo -e "${GREEN}✔ ${NC}$*"; }
warn()  { echo -e "${YELLOW}⚠ ${NC}$*"; }
fail()  { echo -e "${RED}✖ ${NC}$*" >&2; exit 1; }

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# ── Check mode ──────────────────────────────────────────
if [[ "${1:-}" == "--check" ]]; then
  echo "Running start:local preflight checks..."
  errors=0
  command -v docker >/dev/null 2>&1 || { warn "docker not found"; errors=$((errors+1)); }
  command -v node >/dev/null 2>&1   || { warn "node not found"; errors=$((errors+1)); }
  command -v npx >/dev/null 2>&1    || { warn "npx not found"; errors=$((errors+1)); }
  if command -v docker >/dev/null 2>&1; then
    docker info >/dev/null 2>&1 || { warn "Docker daemon not running"; errors=$((errors+1)); }
  fi
  [[ -f "$PROJECT_ROOT/package.json" ]] || { warn "package.json not found"; errors=$((errors+1)); }
  [[ -d "$PROJECT_ROOT/node_modules" ]] || { warn "node_modules missing (run npm install)"; errors=$((errors+1)); }
  if [[ $errors -eq 0 ]]; then
    ok "All preflight checks passed"
    exit 0
  else
    fail "$errors preflight check(s) failed"
  fi
fi

# ── 1. Check Docker ─────────────────────────────────────
info "Checking Docker..."
if ! command -v docker >/dev/null 2>&1; then
  fail "Docker is not installed. Install Docker Desktop: https://docs.docker.com/desktop/install/mac-install/"
fi

if ! docker info >/dev/null 2>&1; then
  warn "Docker daemon is not running. Attempting to start Docker Desktop..."
  open -a Docker 2>/dev/null || true
  for i in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then
      break
    fi
    if [[ $i -eq 30 ]]; then
      fail "Docker Desktop did not start within 30s. Please start Docker Desktop manually and retry."
    fi
    sleep 1
  done
  ok "Docker Desktop started"
fi
ok "Docker is running"

# ── 2. Start compose services ───────────────────────────
info "Starting postgres and redis containers..."
docker compose up -d postgres redis

# ── 3. Wait for Postgres readiness ──────────────────────
info "Waiting for Postgres to be ready..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U oncall >/dev/null 2>&1; then
    break
  fi
  if [[ $i -eq 30 ]]; then
    fail "Postgres did not become ready within 30s. Check: docker compose logs postgres"
  fi
  sleep 1
done
ok "Postgres is ready"

# ── 4. Set DATABASE_URL ─────────────────────────────────
export DATABASE_URL="postgresql://oncall:oncall@localhost:5432/oncall"
export REDIS_URL="redis://localhost:6379"
export NODE_ENV="development"
export JWT_SECRET="dev-secret-change-in-production"

# Create .env if it doesn't exist (for tools that read it directly)
if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
  info "Creating .env from .env.example..."
  cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
  ok ".env created"
fi

# ── 5. Install deps if needed ───────────────────────────
if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
  info "Installing dependencies..."
  npm install
  ok "Dependencies installed"
fi

# ── 6. Prisma generate + migrate ────────────────────────
info "Running Prisma generate..."
npx prisma generate

info "Running Prisma migrate deploy..."
npx prisma migrate deploy
ok "Database migrations applied"

# ── 7. Seed database (idempotent) ───────────────────────
info "Seeding database..."
npm run db:seed 2>&1 || warn "Seed had warnings (may already be seeded)"
ok "Database seeded"

# ── 8. Import PagerDuty data (idempotent) ───────────────
info "Importing PagerDuty data..."
npm run db:import-pd 2>&1 || warn "PagerDuty import had warnings (may already be imported)"
ok "PagerDuty data imported"

# ── 9. Start dev server ─────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN} eos-oncallers is starting...${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e " URL:          ${CYAN}http://localhost:3000${NC}"
echo -e " Health:       ${CYAN}http://localhost:3000/health${NC}"
echo ""
echo -e " Login:        POST /api/auth/login"
echo -e "   admin:      admin@oncall.local / admin123!"
echo -e "   leader:     leader@oncall.local / user123!"
echo ""
echo -e " Example:      curl -s http://localhost:3000/api/services | jq '.data[:2]'"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

exec npx tsx watch src/index.ts
