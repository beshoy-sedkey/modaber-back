---
name: app-listings
description: App store content and merchant documentation
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 29: App Listings

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
1. docs/shopify-listing/ — name, description EN+AR, features, pricing, privacy policy
2. docs/salla-listing/ — same for Salla
3. docs/widget-installation/ — Shopify embed + Salla snippet step-by-step
4. docs/merchant-onboarding/ — welcome flow, setup steps, FAQ
5. Verify Swagger completeness

## Depends On: Agent 28