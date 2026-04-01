---
name: e2e-tests
description: End-to-end test suite
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 27: E2E Tests

## How to Install Packages
When you need a new npm package:
```
docker compose exec app npm install <package-name>
docker compose exec app npm install -D <package-name>   # for dev dependencies
```

## How to Run Commands
ALL commands run inside Docker:
```
docker compose exec app npx tsc --noEmit          # typecheck
docker compose exec app npx jest                   # run tests
docker compose exec app npx jest --passWithNoTests # if no tests yet
docker compose exec app npx prisma generate        # after schema change
docker compose exec app npx prisma migrate dev --name <n>  # migration
```

## Before Starting
1. Read CLAUDE.md in project root
2. Read prisma/schema.prisma
3. Check what files already exist in src/


## Task
1. Shopify full flow: OAuth→sync→webhook→order→confirm→ship→deliver→rate
2. Salla full flow
3. Chat flow: connect→ask products→AI responds→order status
4. Tenant isolation: Merchant A vs B complete separation
All external APIs mocked.
Run: docker compose exec app npx jest --config test/jest-e2e.json

## Depends On: Agent 26