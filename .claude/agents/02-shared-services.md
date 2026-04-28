---
name: shared-services
description: PrismaService with tenant middleware, guards, encryption, interceptors, filters
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 2: Shared Services

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
docker compose exec app npm install @nestjs/event-emitter
```

## Task
1. src/shared/prisma/prisma.service.ts — extends PrismaClient, onModuleInit, tenant middleware that auto-injects merchantId
2. src/shared/prisma/prisma.module.ts — Global module
3. src/shared/guards/jwt-auth.guard.ts — extends AuthGuard('jwt')
4. src/shared/decorators/current-merchant.decorator.ts — @CurrentMerchant() reads request.user.merchantId
5. src/shared/encryption/encryption.service.ts — AES-256-GCM encrypt/decrypt using ENCRYPTION_KEY env
6. src/shared/encryption/encryption.module.ts — Global module
7. src/shared/interceptors/response.interceptor.ts — wraps responses in {success, data, message, meta}
8. src/shared/filters/global-exception.filter.ts — consistent error format
9. src/shared/shared.module.ts — imports and exports all
10. Update app.module.ts to import SharedModule
11. Write unit test for EncryptionService
12. Verify: docker compose exec app npx tsc --noEmit && docker compose exec app npx jest --passWithNoTests

## Depends On: Agent 1