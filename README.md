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
- Docker & Docker Compose

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
- `GET /api/users` — List users
- `GET /api/users/:id` — Get user
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

## Testing

```bash
npm test
```

## Architecture

```
src/
├── index.ts          # Server entrypoint
├── app.ts            # Express app setup
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
