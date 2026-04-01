# Security Review Skill

This skill auto-triggers when reviewing code for security issues.

## Checklist

### 1. Tenant Isolation (CRITICAL — stop everything if broken)
- Every `prisma.*.findMany()` has `where: { merchantId }`
- Every `prisma.*.findFirst()` has `where: { merchantId }`
- Every `prisma.*.update()` has `where: { id, merchantId }`
- Every `prisma.*.delete()` has `where: { id, merchantId }`
- No endpoint returns data without verifying merchant ownership

### 2. Authentication
- Every controller class or route has `@UseGuards(JwtAuthGuard)`
- Exceptions: webhook controllers, OAuth controllers, health check, widget serving
- JWT payload is validated (not just decoded)

### 3. Webhook Security
- Shopify: HMAC-SHA256 verified using RAW body (Buffer, not parsed JSON)
- Salla: Authorization header token compared with env variable
- WhatsApp: X-Hub-Signature-256 verified
- All verification happens BEFORE any processing
- Invalid signature → 401 immediately

### 4. Data Encryption
- Fields: platform_access_token, platform_refresh_token, address_encrypted, api_key_encrypted
- Must use EncryptionService.encrypt() before prisma.create/update
- Must use EncryptionService.decrypt() after prisma.findFirst/findMany

### 5. Input Validation
- Every DTO has class-validator decorators
- No raw user input passed to database queries
- No raw user input in SQL strings (use Prisma parameterized queries)

### 6. Secrets
- No API keys, tokens, or passwords in console.log or error messages
- No secrets in Git (check .gitignore includes .env)
