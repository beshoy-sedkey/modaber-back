---
name: automation-engine
description: Event-driven automation with saga state machine
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 17: Automation Engine

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
1. src/modules/automation/automation-engine.service.ts — listen events, evaluate rules, execute actions
2. Saga: pending→confirmed→shipping_assigned→shipped→delivered→rated
3. Rule CRUD for merchants
4. Tests + verify

## Depends On: Agent 16