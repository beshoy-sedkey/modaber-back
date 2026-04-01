---
description: Prepare and verify a deployment
---

# /project:deploy

Prepare for deployment:

1. Run: docker compose exec app npx tsc --noEmit (must pass with 0 errors)
2. Run: docker compose exec app npx jest (all tests must pass)
3. Run: docker compose exec app npx jest --coverage (report coverage %)
4. Check for any TODO or FIXME comments in src/
5. Verify .env.example has all required variables documented
6. Verify Swagger docs are complete (all endpoints have descriptions)
7. Report: ready to deploy or list blocking issues
