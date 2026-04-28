---
name: security-audit
description: Read-only security scan of entire codebase
allowed_tools: [Read, Bash]
---
# Agent 27: Security Audit (READ-ONLY)

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


## Task — DO NOT EDIT CODE
1. Scan every Prisma query for merchantId filter — report any missing
2. Verify @UseGuards on all controllers (except webhooks)
3. Verify class-validator on all DTOs
4. Verify encrypted fields are encrypted
5. Verify webhook signature verification
6. Check raw SQL for injection
7. Check no secrets in logs
8. Output: create security-audit-report.md with findings

Run: docker compose exec app npx tsc --noEmit