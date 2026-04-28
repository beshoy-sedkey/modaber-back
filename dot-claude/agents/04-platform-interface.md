---
name: platform-interface
description: PlatformAdapter interface, factory, events, BullMQ queues
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 4: Platform Adapter Interface & Factory

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
docker compose exec app npm install @nestjs/bullmq bullmq ioredis
```

## Task
1. src/modules/platform/interfaces/platform-adapter.interface.ts — full interface with:
   getInstallUrl, exchangeCodeForToken, refreshAccessToken, fetchProducts, fetchProduct, fetchOrders, fetchOrder, updateOrderStatus, fetchCustomers, registerWebhooks, verifyWebhookSignature, getStoreInfo
   Also define: PlatformProduct, PlatformOrder, PlatformCustomer, StoreInfo types

2. src/modules/platform/platform-adapter.factory.ts — resolves ShopifyAdapter or SallaAdapter by merchant.platformType

3. src/modules/platform/events/ — OrderReceivedEvent, OrderUpdatedEvent, ProductSyncedEvent, AppUninstalledEvent, MerchantReauthRequiredEvent

4. src/modules/platform/platform.module.ts — registers BullMQ queues: shopify-webhooks, salla-webhooks

5. Verify: docker compose exec app npx tsc --noEmit

## Depends On: Agent 3