---
name: salla-oauth
description: Salla OAuth with token refresh mutex
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 9: Salla OAuth & Token Management

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


## Task (ioredis, axios already installed)
1. src/modules/platform/adapters/salla/salla-oauth.controller.ts:
   - GET /auth/salla/install → redirect to https://accounts.salla.sa/oauth2/auth?...
   - GET /auth/salla/callback → exchange code at POST https://accounts.salla.sa/oauth2/token, save tokens
   - Fetch store info from GET https://accounts.salla.sa/oauth2/user/info

2. src/modules/platform/adapters/salla/salla-token.service.ts:
   - refreshToken(merchantId) with Redis mutex (SET NX EX 30)
   - Salla refresh tokens are SINGLE-USE — must use mutex to prevent parallel refresh
   - Schedule BullMQ job to refresh 1 day before expiry
   - On failure: emit MerchantReauthRequiredEvent

3. Tests for concurrent refresh (only one should succeed)
4. Verify: docker compose exec app npx tsc --noEmit && docker compose exec app npx jest

## Depends On: Agent 8