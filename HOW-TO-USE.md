# How to Use This — Step by Step

## First Time Setup (Do This Once)

### Step 1: Install Claude Code on your machine
```bash
# On Mac/Linux
curl -fsSL https://cli.claude.com/install.sh | sh

# On Windows (requires Git for Windows)
npm install -g @anthropic-ai/claude-code
```

### Step 2: Copy this project folder to your workspace
```bash
# Extract the tar.gz you downloaded
mkdir my-ecommerce-project
cd my-ecommerce-project
tar -xzf Agent_Config_Final.tar.gz .
```

### Step 3: Copy your Prisma schema
Copy the `schema.prisma` file (from earlier in our conversation) into `prisma/schema.prisma`

### Step 4: Start Docker containers
```bash
# This builds the app and starts PostgreSQL + Redis + NestJS
docker compose up -d

# Wait 30 seconds for everything to start, then check:
docker compose ps
# All 3 services should show "running" or "healthy"
```

### Step 5: Verify everything works
```bash
# Check the app is running
docker compose logs app

# Check database is ready
docker compose exec app npx prisma generate
```

You're ready to start running agents!

---

## How to Run Each Agent

### The Pattern (Same Every Time)

```bash
# 1. Navigate to your project folder
cd my-ecommerce-project

# 2. Start a Claude Code session with the agent
claude --agent <agent-name>

# 3. When Claude starts, it reads CLAUDE.md and the agent file automatically
#    It will start building. Watch it work.
#    If it needs to install a package, it runs:
#    docker compose exec app npm install <package>

# 4. When the agent finishes, it runs tests:
#    docker compose exec app npx tsc --noEmit
#    docker compose exec app npx jest

# 5. Review what it built. If you're happy, exit (Ctrl+C) and start the next agent.
```

### Run Agents in Order

```bash
# ═══ PHASE 1: Foundation (Day 1-2) ═══

claude --agent project-scaffold
# Wait for it to finish → review → exit

claude --agent shared-services
# Wait → review → exit

claude --agent jwt-auth
# Wait → review → exit


# ═══ PHASE 2: Platform Integration (Day 3-8) ═══

claude --agent platform-interface
# Wait → review → exit

claude --agent shopify-oauth
# Wait → review → exit

claude --agent shopify-adapter
# Wait → review → exit

claude --agent shopify-webhooks
# Wait → review → exit

claude --agent shopify-sync
# Wait → review → exit
# >>> TEST: Try with real Shopify dev store <<<

claude --agent salla-oauth
# Wait → review → exit

claude --agent salla-adapter
# Wait → review → exit

claude --agent salla-webhooks-sync
# Wait → review → exit
# >>> TEST: Try with real Salla demo store <<<


# ═══ PHASE 3: AI Chat (Day 9-13) ═══

claude --agent embeddings
# Wait → review → exit

claude --agent chat-agent
# Wait → review → exit

claude --agent socketio-gateway
# Wait → review → exit

claude --agent whatsapp
# Wait → review → exit

claude --agent chat-widget
# Wait → review → exit
# >>> TEST: Open chat widget, send messages <<<


# ═══ PHASE 4: Automation (Day 14-17) ═══

claude --agent automation-engine
# Wait → review → exit

claude --agent order-confirmation
# Wait → review → exit

claude --agent shipping
# Wait → review → exit

claude --agent tracking-ratings
# Wait → review → exit
# >>> TEST: Full order lifecycle <<<


# ═══ PHASE 5: Marketing & Reports (Day 18-22) ═══

claude --agent marketing-content
# Wait → review → exit

claude --agent campaign-scheduling
# Wait → review → exit

claude --agent reports-first-five
# Wait → review → exit

claude --agent reports-last-four
# Wait → review → exit

claude --agent dashboard
# Wait → review → exit
# >>> TEST: All reports, dashboard overview <<<


# ═══ PHASE 6: Launch (Day 23-27) ═══

claude --agent security-audit
# Wait → READ THE REPORT → fix critical issues yourself → exit

claude --agent e2e-tests
# Wait → review → exit

claude --agent infrastructure
# Wait → review → exit

claude --agent app-listings
# Wait → review → exit
# >>> MVP COMPLETE! <<<
```

---

## Troubleshooting

### Agent can't connect to database
```bash
# Check postgres is running
docker compose ps postgres
# If not running:
docker compose up -d postgres
# Wait 10 seconds, then try the agent again
```

### Agent says "module not found" or "cannot find package"
```bash
# The agent should install it via docker compose exec app npm install <pkg>
# If it fails, install manually:
docker compose exec app npm install <package-name>
# Then restart the agent session
```

### Agent's code has TypeScript errors
```bash
# Check what errors:
docker compose exec app npx tsc --noEmit
# Fix them in the next agent session, or start the same agent again
```

### Need to rebuild the Docker container
```bash
# If package.json was changed or Dockerfile was modified:
docker compose down
docker compose up -d --build
```

### Want to see the database
```bash
docker compose exec app npx prisma studio
# Opens a browser UI at localhost:5555 showing all tables
```

### Want to restart fresh
```bash
docker compose down -v    # -v deletes database data too
docker compose up -d --build
docker compose exec app npx prisma migrate dev --name init
```

---

## What Each Agent Installs

| Agent | Packages Installed |
|-------|-------------------|
| 1 | None (base packages already in package.json) |
| 2 | @nestjs/event-emitter |
| 3 | @nestjs/jwt, @nestjs/passport, passport, passport-jwt |
| 4 | @nestjs/bullmq, bullmq, ioredis |
| 5 | axios |
| 6-7 | None (uses axios from Agent 5) |
| 8 | @nestjs/schedule |
| 9-11 | None (uses ioredis, axios from earlier) |
| 12 | langchain, @langchain/openai, @langchain/community |
| 13 | None (uses langchain from Agent 12) |
| 14 | @nestjs/websockets, @nestjs/platform-socket.io, socket.io, socket.io-client |
| 15-21 | None |
| 22 | None |
| 23 | None |
| 24 | json2csv |
| 25-29 | None |
