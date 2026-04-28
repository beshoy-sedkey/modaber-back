---
name: store-website
description: Store website generation with theme selection and guided setup
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 25: Store Website Generation

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
1. src/modules/store/store.module.ts + store.service.ts + store.controller.ts

2. Theme system:
   - Prisma model: StoreTheme { id, name, previewImageUrl, layoutJson }
   - Seed 5 default themes (minimal, bold, elegant, modern, classic)
   - GET /store/themes — list available themes
   - GET /store/themes/:id — theme preview details

3. Store setup wizard (guided generation):
   - POST /store/setup — accepts: { themeId, storeName, logoUrl, primaryColor, currency, language }
   - Saves merchant store config to DB (StoreConfig model)
   - Auto-imports existing products from platform (Shopify/Salla) via PlatformAdapterFactory
   - Returns store preview URL

4. Store config management:
   - GET /store/config — get current store config
   - PUT /store/config — update branding (logo, colors, name)
   - PUT /store/config/theme — switch active theme

5. All endpoints protected by JwtAuthGuard, scoped by merchantId
6. Tests + verify

## Depends On: Agent 24
