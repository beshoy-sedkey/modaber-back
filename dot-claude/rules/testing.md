# Testing Rules

## Unit Tests (every service)
- Mock PrismaService — never hit real database
- Mock external APIs (Shopify, Salla, OpenAI, carriers) — never call real APIs
- Test happy path + at least 1 error case per method
- Test tenant isolation: verify queries include merchantId

## Integration Tests (every controller)
- Use Supertest against the NestJS app
- Test: valid request returns correct response
- Test: missing auth returns 401
- Test: wrong merchantId returns 404 (tenant isolation)
- Test: invalid input returns 400 with validation errors

## E2E Tests
- Test complete workflows across modules
- Use test database (same Docker PostgreSQL, separate schema or transaction rollback)
- Mock ALL external HTTP calls

## How to Run
```bash
docker compose exec app npx jest                          # all tests
docker compose exec app npx jest --passWithNoTests        # when no tests exist yet
docker compose exec app npx jest src/modules/shipping     # specific module
docker compose exec app npx jest --coverage               # with coverage report
```

## Naming Convention
- Describe the behavior: `it('should return products filtered by merchantId')`
- NOT: `it('test1')` or `it('works')`
