---
name: shopify-webhooks
description: Webhook controller with HMAC, BullMQ processor for all topics
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 7: Shopify Webhooks

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
1. src/modules/platform/adapters/shopify/shopify-webhook.controller.ts:
   - POST /webhooks/shopify
   - Read raw body for HMAC: crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
   - Compare with X-Shopify-Hmac-SHA256 header
   - Invalid → 401. Valid → dispatch to BullMQ, return 200

2. src/modules/platform/adapters/shopify/shopify-webhook.processor.ts:
   - orders/create → upsert Order + OrderItems, emit OrderReceivedEvent
   - orders/updated → update Order
   - products/create, products/update → upsert Product, emit ProductSyncedEvent
   - products/delete → soft-delete
   - app/uninstalled → deactivate Merchant
   - Idempotency: check exists before create

3. registerWebhooks() in ShopifyAdapter: POST /admin/api/2024-01/webhooks.json

4. Tests for HMAC + processor
5. Verify: docker compose exec app npx tsc --noEmit && docker compose exec app npx jest

## Depends On: Agent 6