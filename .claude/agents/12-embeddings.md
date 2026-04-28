---
name: embeddings
description: Product embedding pipeline with OpenAI and pgvector search
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 12: Embeddings

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
docker compose exec app npm install langchain @langchain/openai @langchain/community
```

## Task
1. src/modules/chat/services/embedding.service.ts:
   - generateEmbedding(text) — OpenAI text-embedding-3-small → 1536-dim vector
   - embedProduct(product) — concat name+desc+category+brand, embed, upsert ProductEmbedding
   - embedAllProducts(merchantId) — batch embed all active products
   - searchSimilarProducts(merchantId, queryText, limit=5) — embed query, cosine similarity SQL

2. Prisma migration: CREATE INDEX ON product_embeddings USING ivfflat (embedding vector_cosine_ops)
3. Listen for ProductSyncedEvent → auto re-embed
4. Create src/modules/chat/chat.module.ts
5. Tests + verify

## Depends On: Agent 11