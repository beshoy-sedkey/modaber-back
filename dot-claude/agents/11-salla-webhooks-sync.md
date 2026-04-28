---
name: salla-webhooks-sync
description: Salla webhook controller, processor, and product sync
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 11: Salla Webhooks & Sync

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
1. salla-webhook.controller.ts — POST /webhooks/salla, verify token, dispatch to BullMQ
2. salla-webhook.processor.ts — handle: order.created, order.updated, order.status.updated, product.created, product.updated, product.deleted, app.uninstalled, app.subscription.started, app.subscription.canceled
3. salla-sync.service.ts — full product sync with Salla pagination
4. POST /platform/salla/sync manual trigger
5. Tests + verify

## Depends On: Agent 10