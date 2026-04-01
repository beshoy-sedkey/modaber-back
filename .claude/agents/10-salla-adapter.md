---
name: salla-adapter
description: SallaAdapter implementing PlatformAdapter
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 10: Salla Adapter

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
1. src/modules/platform/adapters/salla/salla.adapter.ts implementing PlatformAdapter:
   - fetchProducts — GET https://api.salla.dev/admin/v2/products (page/per_page pagination)
   - IMPORTANT: Salla prices are nested {amount, currency} NOT flat numbers
   - fetchOrders, updateOrderStatus (PUT .../orders/{id}/status — Salla supports this)
   - On 401: call SallaTokenService.refreshToken, retry ONCE
   - verifyWebhookSignature: compare Authorization header with SALLA_WEBHOOK_TOKEN
   - registerWebhooks: no-op (configured in Salla Partner Portal)

2. salla-mapper.ts — handle nested price mapping
3. Tests comparing output format with ShopifyAdapter (same PlatformProduct shape)
4. Verify: docker compose exec app npx tsc --noEmit && docker compose exec app npx jest

## Depends On: Agent 9