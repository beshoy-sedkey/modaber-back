---
name: reports-first-five
description: Orders, Sales, Shipping, AI Usage, Stock reports
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 23: Reports 1-5

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
1. Orders Report: by status, counts, avg value
2. Sales Curve: revenue over time, period comparison
3. Shipping Costs: per carrier, per order avg
4. AI Agent Usage: conversations, tokens, resolution rate, latency
5. Stock Level: low stock alerts, velocity
All scoped by merchantId. Raw SQL for aggregations.
GET /reports/{type}?from=&to=
Tests + verify

## Depends On: Agent 22