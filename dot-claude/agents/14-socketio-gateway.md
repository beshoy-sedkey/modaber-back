---
name: socketio-gateway
description: Socket.IO WebSocket gateway with streaming
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 14: Socket.IO Gateway

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
docker compose exec app npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
docker compose exec app npm install -D socket.io-client
```

## Task
1. src/modules/chat/chat.gateway.ts — WebSocket gateway: connect, message, typing, disconnect
2. src/modules/chat/chat.service.ts — startConversation, saveMessage, endConversation
3. Stream tokens via 'response_token' events, 'response_complete' when done
4. Redis adapter for multi-instance
5. Tests + verify

## Depends On: Agent 13