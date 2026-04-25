---
name: infrastructure
description: Production Docker, CI/CD, Terraform, monitoring
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 29: Infrastructure

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
1. Dockerfile.prod (multi-stage, non-root user, dumb-init)
2. docker-compose.prod.yml
3. .github/workflows/ci.yml (lint→typecheck→test on PR)
4. .github/workflows/deploy.yml (build→ECR→ECS on merge)
5. infra/terraform/ — ECS, RDS, ElastiCache, ALB, S3, CloudFront, Route53
6. GET /health endpoint
7. README with deployment docs

## Depends On: Agent 27