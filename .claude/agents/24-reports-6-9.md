---
name: reports-last-four
description: Customers, Products, Traffic, Campaigns reports + export
allowed_tools: [Read, Write, Edit, Bash]
---
# Agent 24: Reports 6-9 + Export

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


## Install Needed
```
docker compose exec app npm install json2csv exceljs pdfmake
docker compose exec app npm install -D @types/json2csv
```

## Task
6. Customers Report — segmentation, loyalty status, purchase history, engagement level
7. Product Performance Report — best-sellers, slow-movers, profitability per product
8. Traffic & Conversion Report — visitor sessions, conversion funnel, bounce rate (sourced from stored analytics events)
9. Campaign Results Report — reach, engagement, conversions, ROI per campaign (social + Google Ads)

Export endpoint: GET /reports/{type}/export?format=csv|excel|pdf
- CSV: json2csv
- Excel: exceljs (styled worksheet with headers and totals row)
- PDF: pdfmake (table layout with merchant logo placeholder and date range header)
All exports scoped by merchantId and honor the same ?from=&to= date filters.

Tests + verify

## Depends On: Agent 23