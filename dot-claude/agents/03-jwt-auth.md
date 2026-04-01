---
name: jwt-auth
description: JWT authentication with passport strategy
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 3: JWT Auth Module

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
docker compose exec app npm install @nestjs/jwt @nestjs/passport passport passport-jwt
docker compose exec app npm install -D @types/passport-jwt
```

## Task
1. src/modules/auth/strategies/jwt.strategy.ts — validates JWT, extracts merchantId, platformType, planTier
2. src/modules/auth/auth.service.ts — generateToken(merchant), validateMerchant(merchantId)
3. src/modules/auth/auth.controller.ts — POST /auth/token (temp: takes merchantId, returns token for testing)
4. src/modules/auth/auth.module.ts — imports JwtModule, PassportModule, exports guards
5. Update app.module.ts
6. Unit tests for token generation/validation
7. Verify: docker compose exec app npx tsc --noEmit && docker compose exec app npx jest

## Depends On: Agent 2