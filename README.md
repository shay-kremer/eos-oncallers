# eos-oncallers

On-call incident management system — a PagerDuty-like platform for managing schedules, incidents, escalations, and integrations.

## Features

- **Schedules** — Multi-layer rotations (daily/weekly) with overrides and on-call resolution
- **Incidents** — Full lifecycle: trigger → acknowledge → resolve with deduplication
- **Escalation Policies** — Multi-level escalation with configurable delays and targets (users/schedules)
- **Services & Teams** — Organize by team with service ownership
- **Alert Rules** — Configurable alert routing with severity and urgency
- **Integrations** — Slack, Twilio (SMS/phone), Datadog, generic webhooks, AWS webhook
- **Status Pages** — Monitor external status pages with subscriptions
- **RBAC** — Three-tier roles: Admin, Group Leader, User
- **Events API** — PagerDuty-compatible webhook ingestion (trigger/acknowledge/resolve)
- **Notification Engine** — Route notifications based on user rules, urgency, and contact preferences
- **Activity Timeline** — Full audit trail on incidents

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose (**Docker Desktop must be running**)

### 1. Start infrastructure

```bash
docker compose up -d postgres redis
```

### 2. Install dependencies

```bash
npm install
```

### 3. Setup environment

```bash
cp .env.example .env
```

### 4. Run database migrations and seed

```bash
npx prisma migrate dev
npm run db:seed
```

### 5. Start the server

```bash
npm run dev
```

Server runs at http://localhost:3000

### One-command start (does everything above)

```bash
npm run start:local
```

This script will:
1. Check Docker is running (starts Docker Desktop on macOS if needed)
2. Start Postgres and Redis containers
3. Wait for Postgres readiness
4. Create `.env` from `.env.example` if missing
5. Run Prisma migrations and seed
6. Import PagerDuty data
7. Start the dev server at http://localhost:3000

**Preflight check only** (no server start):
```bash
npm run start:local:check

**Smoke test** (verify everything works — run in a second terminal):
```bash
npm run smoke:local
```
```



## Local Dashboard

After starting the server, open **http://localhost:3000** in your browser.

The dashboard provides a tabbed admin console with:
- **Overview** — System stats (services, teams, users, schedules), incident counts, recent incidents table
- **Users** — Browse all users with search by name/email, filter by role, view team memberships and masked contact info
- **Schedules** — Browse all schedules with rotation layers, member lists, and real-time on-call badges
- **Escalation Policies** — Multi-level policies overview
- **Services** — With team and policy assignments
- **Incidents** — Full list with status badges and actions
- **Integrations** — Shows integration key in dev mode, trigger demo incident
- **Health indicator** — Green dot showing API health

### Demo Login

In development mode, credentials are shown on the login page:
- **Email:** `admin@oncall.local`
- **Password:** `admin123!`

The integration key for triggering test incidents is displayed in the Integrations panel (dev only).

### Full Docker setup (production-like)

```bash
docker compose up --build
```

## Default Credentials (seed data)

| User | Email | Password | Role |
|------|-------|----------|------|
| Admin | admin@oncall.local | admin123! | ADMIN |
| Leader | leader@oncall.local | user123! | GROUP_LEADER |
| Alice | alice@oncall.local | user123! | USER |
| Bob | bob@oncall.local | user123! | USER |

**Demo integration key:** `demo-integration-key-001`

## API Endpoints

### Auth
- `POST /api/auth/register` — Register new user
- `POST /api/auth/login` — Login, returns JWT
- `GET /api/auth/me` — Current user profile

### Users
- `GET /api/users` — List users (query: `?search=`, `?role=`, `?team=`)
- `GET /api/users/:id` — Get user with schedules
- `PATCH /api/users/:id/role` — Update role (admin only)

### Teams
- `GET /api/teams` — List teams
- `POST /api/teams` — Create team (admin)
- `POST /api/teams/:id/members` — Add member (admin/leader)
- `DELETE /api/teams/:id/members/:userId` — Remove member

### Services
- `GET /api/services` — List services
- `GET /api/services/:id` — Get service with integrations
- `POST /api/services` — Create service (admin/leader)
- `PUT /api/services/:id` — Update service
- `DELETE /api/services/:id` — Delete service (admin)

### Incidents
- `GET /api/incidents` — List (filter: status, serviceId, urgency)
- `GET /api/incidents/:id` — Get with timeline
- `POST /api/incidents` — Create incident
- `POST /api/incidents/:id/acknowledge` — Acknowledge
- `POST /api/incidents/:id/resolve` — Resolve
- `POST /api/incidents/:id/reassign` — Reassign

### Schedules
- `GET /api/schedules` — List schedules
- `GET /api/schedules/:id` — Get with layers/overrides
- `POST /api/schedules` — Create (admin/leader)
- `POST /api/schedules/:id/layers` — Add rotation layer
- `POST /api/schedules/:id/overrides` — Create override
- `GET /api/schedules/:id/oncall` — Who's on call now?

### Escalation Policies
- `GET /api/escalation-policies` — List policies
- `GET /api/escalation-policies/:id` — Get with levels
- `POST /api/escalation-policies` — Create (admin/leader)
- `DELETE /api/escalation-policies/:id` — Delete (admin)

### Alert Rules
- `GET /api/alert-rules` — List (filter: serviceId)
- `POST /api/alert-rules` — Create rule (admin/leader)
- `PATCH /api/alert-rules/:id` — Update rule
- `DELETE /api/alert-rules/:id` — Delete (admin)

### Status Pages
- `GET /api/status-pages` — List status pages
- `GET /api/status-pages/:id` — Get with components
- `POST /api/status-pages` — Create (admin/leader)
- `POST /api/status-pages/:id/subscribe` — Subscribe
- `POST /api/status-pages/:id/components` — Add component
- `PATCH /api/status-pages/:id/components/:componentId` — Update status

### Webhooks (no auth required — uses routing key)
- `POST /api/webhooks/events` — PagerDuty-compatible events API
- `POST /api/webhooks/datadog?routing_key=KEY` — Datadog webhook receiver

## Events API Usage

```bash
# Trigger an incident
curl -X POST http://localhost:3000/api/webhooks/events \
  -H "Content-Type: application/json" \
  -d '{
    "routing_key": "demo-integration-key-001",
    "event_action": "trigger",
    "dedup_key": "my-alert-123",
    "payload": {
      "summary": "CPU usage > 90% on web-01",
      "source": "monitoring",
      "severity": "CRITICAL"
    }
  }'

# Acknowledge
curl -X POST http://localhost:3000/api/webhooks/events \
  -H "Content-Type: application/json" \
  -d '{
    "routing_key": "demo-integration-key-001",
    "event_action": "acknowledge",
    "dedup_key": "my-alert-123"
  }'

# Resolve
curl -X POST http://localhost:3000/api/webhooks/events \
  -H "Content-Type: application/json" \
  -d '{
    "routing_key": "demo-integration-key-001",
    "event_action": "resolve",
    "dedup_key": "my-alert-123"
  }'
```

## Integrations Configuration

All integrations use environment variables — no secrets in code:

| Integration | Required Env Vars | Notes |
|------------|-------------------|-------|
| Slack | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` | Posts to channels with action buttons |
| Twilio SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Sends SMS alerts |
| Twilio Phone | Same as SMS | Voice calls with TwiML prompts |
| Datadog | `DATADOG_API_KEY`, `DATADOG_APP_KEY` | Send/receive events |
| AWS Webhook | `AWS_WEBHOOK_URL` | Forward incidents to Lambda/API Gateway |

When env vars are not set, integrations log mock notifications instead of failing.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `docker.sock: connect: no such file or directory` | Docker Desktop not running | Open Docker Desktop, wait until whale icon is steady |
| `EADDRINUSE: address already in use :::3000` | Port 3000 already occupied | `lsof -ti :3000 \| xargs kill -9` then retry |
| `prisma migrate deploy` fails with connection refused | Postgres container not healthy yet | `docker compose ps` — wait for `(healthy)` status |
| `Environment variable not found: DATABASE_URL` | Missing .env file | Run `cp .env.example .env` or use `npm run start:local` which handles it automatically |


## Testing

```bash
npm test
```

## Architecture

```
src/
├── index.ts          # Server entrypoint
├── app.ts            # Express app setup
├── public/           # Static dashboard UI (index.html)
├── types/            # TypeScript types
├── utils/            # Config, logger, database, password
├── middleware/       # Auth (JWT + RBAC)
├── routes/           # API route handlers
├── services/         # Business logic (notifications, escalation)
└── integrations/     # External service adapters
    ├── slack/
    ├── twilio/
    ├── datadog/
    └── webhook/
```

## License

MIT

## PagerDuty Import

Import your PagerDuty configuration (users, teams, services, schedules, escalation policies) into eos-oncallers.

### Export from PagerDuty

The export script uses the PagerDuty REST API to fetch all configuration data. It requires a PagerDuty API token (read-only access is sufficient).

The exported data is saved to `data/pagerduty-export.json` with sensitive fields (phone numbers, notification contacts) stripped.

### Import into eos-oncallers

```bash
# Import the PagerDuty export into the database
npm run db:import-pd

# Or with a custom export path
npx tsx src/scripts/import-pagerduty.ts path/to/export.json
```

### What gets imported

| PagerDuty Entity | eos-oncallers Entity | Key Mapping |
|-----------------|---------------------|-------------|
| Users | Users | email (unique), role mapped: admin/owner→ADMIN, manager→GROUP_LEADER, others→USER |
| Teams | Teams | name (unique) |
| Services | Services | name (unique), linked to team + escalation policy |
| Schedules | Schedules + Layers + Members | name (unique), layers with rotation type and members |
| Escalation Policies | EscalationPolicy + Levels + Targets | name (unique), levels with delay and user/schedule targets |

### Idempotency

The import is fully idempotent — running it multiple times produces the same result. It uses upsert operations keyed on unique fields (email for users, name for teams/services/schedules/policies).

### Default password

Imported users receive the default password `changeme123!`. Users should change their password on first login.
