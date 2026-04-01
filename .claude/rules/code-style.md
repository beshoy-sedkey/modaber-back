# Code Style Rules

These rules apply to ALL code written in this project.

## TypeScript
- strict mode is ON — no implicit any, no unused variables
- Every function must have explicit parameter types AND return type
- Use `readonly` for properties that should not change
- Use Prisma enums (OrderStatus, PlatformType, etc.) — never string literals like "pending"
- Prefer `const` over `let`. Never use `var`
- Use optional chaining: `customer?.email` not `customer && customer.email`

## NestJS
- Controllers are THIN — only: validate input, call service, return response
- Services contain ALL business logic
- One class per file. File name matches class name in kebab-case
- Module name matches folder name: `shipping/shipping.module.ts` exports `ShippingModule`

## DTOs
- Every request body must have a DTO class with class-validator decorators
- Use: @IsString(), @IsUUID(), @IsOptional(), @IsEnum(), @IsNumber(), @Min(), @Max()
- Response DTOs are optional but recommended for Swagger documentation

## File Names
- kebab-case: `order-confirmation.service.ts` not `orderConfirmation.service.ts`
- Test files: `<name>.spec.ts` in `__tests__/` folder next to the source file
- DTOs: `create-<entity>.dto.ts`, `update-<entity>.dto.ts`

## Imports
- Order: NestJS decorators → third-party → local modules → relative files
- Use path aliases: `import { PrismaService } from 'src/shared/prisma/prisma.service'`
