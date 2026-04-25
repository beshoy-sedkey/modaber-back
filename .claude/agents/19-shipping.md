---
name: shipping
description: Carrier adapters and auto-assignment
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 19: Shipping

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
1. CarrierAdapter interface: getRates, createShipment, getTracking, generateLabel
2. AramexAdapter, BostaAdapter
3. ShippingService.autoAssignCarrier — select best carrier by: (1) coverage of customer's city/zone, (2) shortest estimated delivery time, (3) lowest cost as tiebreaker. Priority order matches MVP: closest/fastest first, cheapest only as fallback when delivery times are equal.
4. Endpoints: POST /shipping/assign, GET /shipping/rates/:orderId, GET /shipping/track/:trackingNumber
5. Tests + verify

## Depends On: Agent 18