---
name: order-confirmation
description: Auto-confirmation via WhatsApp with fraud scoring
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 18: Order Confirmation

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
1. order-confirmation.flow.ts — send WhatsApp, wait 2h, confirm or flag
2. order-scoring.service.ts — 0-100 score: previous orders, phone verified, value range, delivery area
3. Score < 40 → manual review
4. Tests + verify

## Depends On: Agent 17