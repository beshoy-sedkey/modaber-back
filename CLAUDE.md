# E-Commerce AI Automation System

## Project Overview
AI-powered e-commerce automation platform integrating with Shopify and Salla.
NestJS + TypeScript + Prisma + PostgreSQL (pgvector) + Redis.

## CRITICAL: How to Install Dependencies
- The app runs INSIDE Docker. All commands must run inside the container.
- To install a new package: `docker compose exec app npm install <package-name>`
- To install a dev package: `docker compose exec app npm install -D <package-name>`
- NEVER run `npm install` directly on the host machine
- NEVER run bare `npm install <pkg>` — always prefix with `docker compose exec app`
- After installing, the package is immediately available (node_modules is inside the container)
- To run any command: `docker compose exec app <command>`
  Examples:
  - `docker compose exec app npx tsc --noEmit`
  - `docker compose exec app npx jest`
  - `docker compose exec app npx prisma generate`
  - `docker compose exec app npx prisma migrate dev --name <n>`

## Architecture Rules

### Modular Monolith
- Each module in `src/modules/<module-name>/`
- Modules communicate via NestJS EventEmitter or BullMQ queues
- NEVER import a service from another module directly — use events or shared interface
- Each module owns its controllers, services, DTOs, and processors

### Multi-Tenancy (CRITICAL)
- Every database query MUST filter by `merchantId`
- Use `@CurrentMerchant()` decorator to get merchantId from JWT
- Prisma middleware auto-injects merchantId filter
- NEVER write a query without merchantId
- Merchant A must NEVER see Merchant B's data

### Platform Adapter Pattern
- All platform-specific code in `src/modules/platform/adapters/`
- `PlatformAdapter` interface defines the contract
- ShopifyAdapter and SallaAdapter implement this interface
- Correct adapter resolved at runtime via `PlatformAdapterFactory`

## Coding Standards

### TypeScript
- Strict mode (strict: true)
- No `any` types
- All functions must have explicit return types
- Use Prisma enums, not string literals

### NestJS Patterns
- Controllers: thin, HTTP concerns only
- Services: all business logic
- DTOs: class-validator decorators on all request/response
- Guards: authentication and authorization

### File Structure per Module
```
src/modules/<name>/
├── <name>.module.ts
├── <name>.controller.ts
├── <name>.service.ts
├── <name>.processor.ts
├── dto/
├── interfaces/
├── adapters/
└── __tests__/
```

### Error Handling
- Use NestJS exceptions (NotFoundException, BadRequestException, etc.)
- Log errors with context (merchantId, orderId)

### API Response Format
```typescript
{ success: boolean; data: T; message?: string; meta?: { page, limit, total } }
```

## Security Rules
- JWT includes: merchantId, platformType, planTier
- All endpoints require @UseGuards(JwtAuthGuard) except webhooks
- Shopify webhooks: verify HMAC-SHA256
- Salla webhooks: verify Authorization header token
- Return 200 from webhooks immediately, process async via BullMQ
- Encrypted fields: AES-256-GCM via EncryptionService

## Database
- Prisma schema is source of truth: `prisma/schema.prisma`
- After schema change: `docker compose exec app npx prisma generate`
- Migrations: `docker compose exec app npx prisma migrate dev --name <n>`

## Testing
- Every service: unit tests
- Every controller: integration tests
- Mock ALL external APIs in tests
- Run: `docker compose exec app npx jest`
