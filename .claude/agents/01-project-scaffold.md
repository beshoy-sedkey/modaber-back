---
name: project-scaffold
description: Creates NestJS project structure, Prisma migration, Swagger, base config
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 1: Project Scaffold & Prisma Setup

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
1. Create folder structure:
   - src/modules/ with empty folders: platform, chat, automatio
   n, shipping, marketing, reports, dashboard, auth
   - src/shared/ with folders: prisma, guards, encryption, interceptors, decorators, filters
   - src/config/
   - test/unit/, test/integration/, test/e2e/

2. Create src/main.ts:
   - Swagger at /api/docs
   - helmet()
   - CORS enabled
   - Global ValidationPipe with whitelist and transform
   - Port from env (default 3000)
   - Enable raw body for webhooks: app.use(json({ verify: (req,res,buf) => req.rawBody = buf }))

3. Create src/app.module.ts with ConfigModule.forRoot() and env validation

4. Run: docker compose exec app npx prisma generate
5. Run: docker compose exec app npx prisma migrate dev --name init
6. Verify: docker compose exec app npx tsc --noEmit

## Output
Project compiles. 14 database tables created. Swagger at localhost:3000/api/docs.