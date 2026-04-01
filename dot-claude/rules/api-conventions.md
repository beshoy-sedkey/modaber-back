# API Conventions

## URL Patterns
- REST: `GET /products`, `POST /products`, `GET /products/:id`, `PUT /products/:id`, `DELETE /products/:id`
- Nested: `GET /orders/:orderId/items`
- Actions: `POST /orders/:id/confirm`, `POST /shipping/:id/assign`
- Reports: `GET /reports/sales?from=2024-01-01&to=2024-01-31`
- Webhooks: `POST /webhooks/shopify`, `POST /webhooks/salla`, `POST /webhooks/whatsapp`

## Response Format
All responses wrapped in:
```json
{
  "success": true,
  "data": { ... },
  "message": "Order created successfully",
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

Error responses:
```json
{
  "success": false,
  "message": "Order not found",
  "statusCode": 404
}
```

## Pagination
- Query params: `?page=1&limit=20`
- Default limit: 20, max limit: 100
- Response meta includes: page, limit, total

## Authentication
- Header: `Authorization: Bearer <jwt_token>`
- All endpoints require JWT except:
  - POST /webhooks/* (verified by HMAC or token)
  - GET /auth/shopify/* (OAuth flow)
  - GET /auth/salla/* (OAuth flow)
  - GET /widget/* (public widget serving)
  - GET /health (health check)

## Status Codes
- 200: Success (GET, PUT)
- 201: Created (POST)
- 400: Validation error
- 401: Not authenticated
- 403: Not authorized (wrong merchant)
- 404: Not found
- 429: Rate limited
- 500: Server error
