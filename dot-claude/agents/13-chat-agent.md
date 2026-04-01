---
name: chat-agent
description: LangChain AI sales advisor with tools and conversation memory
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 13: Chat Agent Core

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
1. src/modules/chat/services/chat-agent.service.ts:
   - processMessage(merchantId, sessionId, message) → AsyncGenerator<string>
   - System prompt with merchant brand voice
   - LangChain tools: search_products, get_product_details, check_order_status, collect_customer_info, add_to_cart
   - Memory: Redis for active (last 20 msgs), PostgreSQL for history
   - Model: gpt-4o-mini default, escalate to gpt-4o after 10 turns

2. Tests: verify tool invocation on product search query
3. Verify: docker compose exec app npx tsc --noEmit && docker compose exec app npx jest

## Depends On: Agent 12