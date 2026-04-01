---
name: whatsapp
description: WhatsApp Business API integration via Meta Cloud API
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 15: WhatsApp

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
1. src/modules/chat/channels/whatsapp.controller.ts — GET (Meta verify), POST (incoming messages, verify X-Hub-Signature-256)
2. src/modules/chat/channels/whatsapp.service.ts — sendMessage, sendTemplateMessage, parse incoming
3. Route through SAME ChatAgentService as web chat
4. Handle 24h window rule
5. Tests + verify

## Depends On: Agent 14