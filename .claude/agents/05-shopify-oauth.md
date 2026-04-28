---
name: shopify-oauth
description: Shopify OAuth with HMAC verification and code exchange
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 5: Shopify OAuth

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
docker compose exec app npm install axios
```

## Task
1. src/modules/platform/adapters/shopify/shopify-oauth.controller.ts:
   - GET /auth/shopify/install?shop=<domain> — builds auth URL, redirects
   - GET /auth/shopify/callback — verifies HMAC, exchanges code, saves Merchant, returns JWT

2. src/modules/platform/adapters/shopify/shopify-auth.service.ts:
   - buildInstallUrl(shop, scopes, redirectUri)
   - verifyHmac(query) — SHA256 of sorted params using SHOPIFY_API_SECRET
   - exchangeCode(shop, code) — POST https://{shop}/admin/oauth/access_token

3. Unit tests for HMAC verification
4. Verify: docker compose exec app npx tsc --noEmit && docker compose exec app npx jest

## Depends On: Agent 4