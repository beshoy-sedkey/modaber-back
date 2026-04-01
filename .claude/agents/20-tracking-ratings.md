---
name: tracking-ratings
description: Delivery tracking and rating collection
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 20: Tracking & Ratings

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
1. TrackingService — poll carriers every 30min, update status, notify customer
2. RatingCollectionFlow — 48h delay, WhatsApp request, save rating, 72h reminder
3. Rating endpoints
4. Tests + verify

## Depends On: Agent 19