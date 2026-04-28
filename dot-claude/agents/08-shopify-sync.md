---
name: shopify-sync
description: Product sync with pagination and scheduled jobs
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 8: Shopify Product Sync

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


## Install Needed
```
docker compose exec app npm install @nestjs/schedule
```

## Task
1. src/modules/platform/adapters/shopify/shopify-sync.service.ts:
   - syncAllProducts(merchantId) — paginated fetch, upsert all, track syncedAt
   - removeStaleProducts(merchantId) — deactivate products no longer on Shopify
   - BullMQ repeatable job every 6 hours per merchant

2. POST /platform/shopify/sync — manual trigger (protected by JwtAuthGuard)

3. Tests
4. Verify: docker compose exec app npx tsc --noEmit && docker compose exec app npx jest

## Depends On: Agent 7