---
name: shopify-adapter
description: ShopifyAdapter implementing PlatformAdapter for products, orders, customers
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 6: Shopify Adapter

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


## Task (axios already installed by Agent 5)
1. src/modules/platform/adapters/shopify/shopify.adapter.ts implementing PlatformAdapter:
   - fetchProducts — GET /admin/api/2024-01/products.json, pagination via Link header
   - fetchOrders — GET /admin/api/2024-01/orders.json with status filter
   - All other PlatformAdapter methods
   - Rate limit: handle 429 with Retry-After header
   - Header: X-Shopify-Access-Token

2. src/modules/platform/adapters/shopify/shopify-mapper.ts:
   - mapShopifyProduct → PlatformProduct
   - mapShopifyOrder → PlatformOrder

3. Unit tests for mapping with sample Shopify responses
4. Verify: docker compose exec app npx tsc --noEmit && docker compose exec app npx jest

## Depends On: Agent 5