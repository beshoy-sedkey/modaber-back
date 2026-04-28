# E-Commerce AI Automation System

AI-powered e-commerce automation platform integrating with **Shopify** and **Salla**.
Built with NestJS, TypeScript, Prisma, PostgreSQL (pgvector), and Redis.

---

## Tech Stack

| Layer        | Technology                                 |
|--------------|--------------------------------------------|
| Runtime      | Node.js 20 / TypeScript 5                  |
| Framework    | NestJS 10                                  |
| Database     | PostgreSQL 16 + pgvector extension         |
| ORM          | Prisma 5                                   |
| Cache/Queue  | Redis 7 + BullMQ                           |
| AI           | OpenAI (embeddings + chat)                 |
| Auth         | JWT + Passport                             |
| Real-time    | Socket.IO                                  |
| Container    | Docker + Docker Compose                    |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Docker Compose v2)
- Git

No Node.js installation needed on the host — everything runs inside Docker.

---

## Quick Start

```bash
# 1. Clone the repo
git clone <repo-url>
cd modaber-back

# 2. (Optional) Copy and fill in your API keys
cp .env.example .env
# Edit .env with your real keys

# 3. Start everything
chmod +x run.sh
./run.sh start
```

After startup the following are available:

| Service       | URL                          |
|---------------|------------------------------|
| REST API      | http://localhost:3000        |
| Swagger Docs  | http://localhost:3000/api    |
| PostgreSQL    | localhost:5432               |
| Redis         | localhost:6379               |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values you need:

```env
# ── Required ──────────────────────────────────────
OPENAI_API_KEY=sk-...

# ── Shopify (if using Shopify integration) ─────────
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...

# ── Salla (if using Salla integration) ────────────
SALLA_CLIENT_ID=...
SALLA_CLIENT_SECRET=...
SALLA_WEBHOOK_TOKEN=...

# ── WhatsApp Business API ─────────────────────────
WHATSAPP_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=...
```

The `docker-compose.yml` already includes safe development defaults for
`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, and `ENCRYPTION_KEY`.
Change them before any production deployment.

---

## Project Structure

```
src/
├── main.ts                    # Bootstrap
├── app.module.ts
└── modules/
    ├── auth/                  # JWT authentication
    ├── platform/              # Shopify & Salla adapters + OAuth
    ├── products/              # Product catalog + embeddings
    ├── orders/                # Order management
    ├── chat/                  # AI chat agent + Socket.IO gateway
    ├── whatsapp/              # WhatsApp Business API
    ├── shipping/              # Carrier adapters + auto-assignment
    ├── order-confirmation/    # Auto-confirm + fraud scoring
    ├── reports/               # Sales, traffic, customer reports
    └── dashboard/             # Merchant overview

prisma/
└── schema.prisma              # Database schema (source of truth)
```

---

## Modules Overview

### Authentication (`/auth`)
- Shopify OAuth flow: `GET /auth/shopify/install` → callback
- Salla OAuth flow: `GET /auth/salla/install` → callback
- JWT issued on successful OAuth; includes `merchantId`, `platformType`, `planTier`

### Products (`/products`)
- CRUD for product catalog synced from platform
- Vector embeddings stored in pgvector for semantic search
- Scheduled background sync via BullMQ

### Orders (`/orders`)
- Order list, detail, status updates
- Fraud scoring on new orders
- Auto-confirmation via WhatsApp

### AI Chat (`/chat`, WebSocket)
- LangChain-powered sales advisor
- Semantic product search using embeddings
- Real-time responses over Socket.IO
- Embeddable JS widget for merchant storefronts

### WhatsApp (`/webhooks/whatsapp`)
- Inbound message handling
- Order status notifications
- Confirmation flows

### Shipping (`/shipping`)
- Multi-carrier support
- Auto-assign best carrier per order
- Tracking updates

### Reports (`/reports`)
- Sales, Orders, Shipping, AI Usage, Stock
- Customers, Products, Traffic, Campaigns
- CSV / JSON export

### Dashboard (`/dashboard`)
- Real-time KPI overview
- Recent activity feed

---

## Runner Script

`run.sh` wraps common Docker + Prisma + Jest commands:

```bash
./run.sh start        # Build and start all services
./run.sh stop         # Stop all services
./run.sh restart      # Restart without rebuilding
./run.sh rebuild      # Rebuild images from scratch
./run.sh logs         # Follow app container logs
./run.sh migrate      # Run Prisma migrations
./run.sh studio       # Open Prisma Studio at localhost:5555
./run.sh test         # Run all unit tests
./run.sh typecheck    # Run TypeScript compiler check
./run.sh shell        # Shell into the app container
./run.sh status       # Show Docker container status
./run.sh reset        # !! Wipe data and start fresh
```

---

## Development Workflow

```bash
# Install a new package
docker compose exec app npm install <package-name>

# Install a dev package
docker compose exec app npm install -D <package-name>

# Run tests for a specific module
docker compose exec app npx jest src/modules/shipping

# Run tests with coverage
docker compose exec app npx jest --coverage

# Apply a new Prisma migration after schema change
docker compose exec app npx prisma migrate dev --name <migration-name>

# Regenerate the Prisma client
docker compose exec app npx prisma generate
```

> **Never** run `npm install` directly on the host machine.
> `node_modules` lives inside the container.

---

## API Authentication

All endpoints require a Bearer token except:
- `POST /webhooks/*` — verified by HMAC or token header
- `GET /auth/shopify/*` and `GET /auth/salla/*` — OAuth flows
- `GET /widget/*` — public chat widget
- `GET /health` — health check

```http
Authorization: Bearer <jwt_token>
```

---

## Webhooks

| Platform | Endpoint                  | Verification         |
|----------|---------------------------|----------------------|
| Shopify  | `POST /webhooks/shopify`  | HMAC-SHA256          |
| Salla    | `POST /webhooks/salla`    | Authorization header |
| WhatsApp | `POST /webhooks/whatsapp` | Verify token         |

Webhooks respond with `200` immediately and process asynchronously via BullMQ.

---

## Testing

```bash
./run.sh test                                          # all tests
docker compose exec app npx jest --passWithNoTests     # skip when no tests exist
docker compose exec app npx jest src/modules/auth      # single module
docker compose exec app npx jest --coverage            # coverage report
```

---

## Multi-Tenancy

Every database query is automatically scoped to the authenticated merchant:
- Prisma middleware injects `merchantId` on every query
- `@CurrentMerchant()` decorator extracts it from the JWT
- Merchant A can **never** access Merchant B's data

---

## Troubleshooting

**App won't start / database errors**
```bash
docker compose ps          # check all containers are running
./run.sh logs              # read app logs
./run.sh rebuild           # rebuild images if Dockerfile changed
```

**TypeScript errors**
```bash
./run.sh typecheck
```

**Reset to a clean state**
```bash
./run.sh reset             # wipes volumes and restarts
```

**View the database in a browser**
```bash
./run.sh studio            # opens Prisma Studio at localhost:5555
```

---

## Security Notes

- JWT secret and encryption key **must** be changed before production
- All sensitive fields are encrypted with AES-256-GCM via `EncryptionService`
- Shopify webhook HMAC and Salla token verification are enforced on every request
- Rate limiting and Helmet headers are applied globally

---

## License

Private — All rights reserved.
