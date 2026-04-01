---
name: chat-widget
description: Embeddable JS chat widget for merchant storefronts
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 16: Chat Widget

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
1. src/modules/chat/widget/chat-widget.ts — lightweight widget: bubble, chat window, message bubbles, typing indicator
2. src/modules/chat/widget/widget.controller.ts — GET /widget/{apiKey}/chat.js serves compiled widget
3. docs/widget-installation.md — Shopify embed + Salla snippet instructions
4. Tests + verify

## Depends On: Agent 14