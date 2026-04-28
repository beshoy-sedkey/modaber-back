---
description: Build a new NestJS module from scratch with controller, service, DTOs, and tests
---

# /project:build-module

Build a complete NestJS module. Follow these steps in order:

1. Read CLAUDE.md for coding standards
2. Read prisma/schema.prisma for the relevant models
3. Read .claude/rules/code-style.md for file patterns
4. Create the module folder in src/modules/$MODULE_NAME/
5. Create these files:
   - $MODULE_NAME.module.ts
   - $MODULE_NAME.controller.ts (thin, HTTP only)
   - $MODULE_NAME.service.ts (all business logic)
   - dto/create-$MODULE_NAME.dto.ts (class-validator)
   - dto/update-$MODULE_NAME.dto.ts (class-validator)
   - __tests__/$MODULE_NAME.service.spec.ts
   - __tests__/$MODULE_NAME.controller.spec.ts
6. Register module in app.module.ts
7. Run: docker compose exec app npx tsc --noEmit
8. Run: docker compose exec app npx jest --passWithNoTests
9. Report results

Every controller must use @UseGuards(JwtAuthGuard) and @CurrentMerchant().
Every service method must filter by merchantId.
