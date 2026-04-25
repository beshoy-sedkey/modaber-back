---
name: marketing-content
description: AI content generation for social media
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 21: Marketing Content

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
1. ContentGenerationService — LangChain generates posts for Instagram/Facebook/TikTok/Snapchat (Arabic + English)
   - Platform-aware: character limits, hashtag style, and tone differ per platform
   - Snapchat: short-form vertical video captions, max 200 chars, casual tone

2. GoogleAdsContentService — generates ad copy for Google Ads campaigns
   - Headlines (max 30 chars each, up to 15), descriptions (max 90 chars each, up to 4)
   - Keyword suggestions based on product catalog
   - Campaign type support: Search, Display, Shopping

3. Campaign CRUD endpoints (social + Google Ads campaigns stored in same Campaign model, differentiated by `platform` enum: INSTAGRAM | FACEBOOK | TIKTOK | SNAPCHAT | GOOGLE_ADS)

4. Regeneration endpoint — regenerate content based on performance feedback

5. Tests + verify

## Depends On: Agent 20