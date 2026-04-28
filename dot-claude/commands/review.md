---
description: Review code for security, tenant isolation, and quality
---

# /project:review

Review the specified files or module. Check:

1. **Tenant Isolation (CRITICAL)**: Every Prisma query has merchantId filter
2. **Auth**: Every controller has @UseGuards(JwtAuthGuard) except webhooks
3. **Validation**: Every DTO uses class-validator decorators
4. **Types**: No `any` types, all functions have return types
5. **Encryption**: ENCRYPTED fields use EncryptionService
6. **Error Handling**: All external API calls wrapped in try/catch
7. **Tests**: Service has unit tests, controller has integration tests

Output format for each issue:
- **Severity**: CRITICAL / HIGH / MEDIUM / LOW
- **File**: path to file
- **Line**: approximate location
- **Issue**: what's wrong
- **Fix**: how to fix it
