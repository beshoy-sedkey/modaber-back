# Chat Widget Installation Guide

The embeddable chat widget is a lightweight JavaScript snippet that adds a floating chat bubble to your storefront. When a visitor clicks the bubble, a chat window opens and they can send messages that are handled by the AI-powered backend.

## How it Works

1. You embed a single `<script>` tag that loads `chat.js` from the API server.
2. The script injects the chat bubble and window into your page.
3. Each visitor gets a persistent session (stored in `localStorage`) so conversation history is maintained across page refreshes.
4. The widget connects to the backend via **Socket.IO** (`/chat` namespace) for real-time streaming responses. If Socket.IO is unavailable (WebSocket blocked by network/firewall), it automatically falls back to `POST /widget/{apiKey}/message`.

The `apiKey` is your merchant UUID, visible in your account settings.

---

## Shopify Installation

### Option A — Theme Customizer (recommended)

1. In your Shopify admin, go to **Online Store > Themes**.
2. Click **Customize** next to your active theme.
3. In the left panel, click **Theme settings > Custom CSS / Additional scripts** (the exact label varies by theme).
4. Paste the snippet below into the **Additional scripts** field at the bottom of the page.

```html
<!-- Modaber AI Chat Widget -->
<script
  src="https://api.your-domain.com/widget/YOUR_MERCHANT_UUID/chat.js"
  async
  defer
></script>
```

Replace `api.your-domain.com` with your actual API host and `YOUR_MERCHANT_UUID` with the UUID shown in your dashboard.

### Option B — Theme Code Editor

1. In your Shopify admin, go to **Online Store > Themes > Edit code**.
2. Open `layout/theme.liquid`.
3. Paste the snippet just before the closing `</body>` tag:

```liquid
{%- comment -%} Modaber AI Chat Widget {%- endcomment -%}
<script
  src="https://api.your-domain.com/widget/{{ shop.metafields.modaber.merchant_uuid }}/chat.js"
  async
  defer
></script>
```

Or, if you prefer a hardcoded UUID:

```liquid
<script
  src="https://api.your-domain.com/widget/YOUR_MERCHANT_UUID/chat.js"
  async
  defer
></script>
```

4. Click **Save**.

### Option C — Shopify Script Tag API (programmatic)

If you manage theme changes via code or a Shopify app, use the Script Tag API:

```javascript
// POST to Shopify Admin API
const body = {
  script_tag: {
    event: 'onload',
    src: 'https://api.your-domain.com/widget/YOUR_MERCHANT_UUID/chat.js',
  },
};

await fetch('https://YOUR_STORE.myshopify.com/admin/api/2024-01/script_tags.json', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': YOUR_ACCESS_TOKEN,
  },
  body: JSON.stringify(body),
});
```

Shopify automatically injects this script on every storefront page.

---

## Salla Installation

### Option A — Theme Settings

1. Log in to your Salla Partner dashboard.
2. Go to **Design > Theme > Settings**.
3. Look for **Custom Scripts** or **Footer Code**.
4. Paste the following snippet:

```html
<!-- Modaber AI Chat Widget -->
<script
  src="https://api.your-domain.com/widget/YOUR_MERCHANT_UUID/chat.js"
  async
  defer
></script>
```

5. Save changes.

### Option B — Salla App (Twig template)

If you are developing a Salla app with theme access, add the snippet to your layout template (`layouts/master.twig` or equivalent) before the `</body>` tag:

```twig
{# Modaber AI Chat Widget #}
<script
  src="https://api.your-domain.com/widget/{{ store.id }}/chat.js"
  async
  defer
></script>
```

Replace `{{ store.id }}` with the actual merchant UUID from the Modaber dashboard, or use Twig variables if your app maps the Salla store ID to the Modaber merchant UUID.

### Option C — Salla Webhook / API

Use the Salla Admin API to inject a script tag globally:

```bash
curl -X POST https://api.salla.dev/admin/v2/script-tags \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "src": "https://api.your-domain.com/widget/YOUR_MERCHANT_UUID/chat.js",
    "event": "onload"
  }'
```

---

## Widget Customization

The widget appearance can be customized via your merchant settings in the Modaber dashboard. The following settings are supported:

| Setting key       | Type   | Description                        | Default         |
|-------------------|--------|------------------------------------|-----------------|
| `widgetColor`     | string | Primary color (hex)                | `#2563eb`       |
| `widgetGreeting`  | string | Opening message shown to visitors  | `Hello! How can I help you today?` |
| `widgetPosition`  | string | `bottom-right` or `bottom-left`    | `bottom-right`  |

These settings are embedded into the JavaScript at request time, so there is no need to change the embed snippet.

---

## API Reference

### Serve Widget Script

```
GET /widget/{apiKey}/chat.js
```

Returns a self-contained JavaScript bundle. No authentication required.

**Headers returned:**

| Header                      | Value                        |
|-----------------------------|------------------------------|
| `Content-Type`              | `application/javascript`     |
| `Cache-Control`             | `public, max-age=300`        |
| `Access-Control-Allow-Origin` | `*`                        |

---

### Send a Message

```
POST /widget/{apiKey}/message
Content-Type: application/json
```

**Request body:**

```json
{
  "sessionId": "unique-visitor-session-id",
  "message": "Hello, what are your shipping options?"
}
```

| Field       | Type   | Required | Description                              |
|-------------|--------|----------|------------------------------------------|
| `sessionId` | string | Yes      | Unique identifier for the visitor session (1–255 chars) |
| `message`   | string | Yes      | The visitor's message text (1–2000 chars) |

**Response:**

```json
{
  "success": true,
  "data": {
    "reply": "We offer fast shipping to your location...",
    "conversationId": "uuid",
    "sessionId": "unique-visitor-session-id"
  }
}
```

**Error responses:**

| Status | Reason                             |
|--------|------------------------------------|
| 400    | Missing or invalid `sessionId` / `message` |
| 404    | Unknown `apiKey` (merchant not found or inactive) |

---

## Deployment Configuration

The API server must have the following environment variable set so the widget script embeds the correct backend URL:

```
API_BASE_URL=https://api.your-domain.com
```

If this variable is not set, the widget defaults to `http://localhost:3000`, which only works in local development. Set it in your production `.env` or container environment before deploying.

---

## Security Notes

- The widget endpoints are public and do not require authentication.
- The `apiKey` (merchant UUID) is a public identifier — it is intentionally visible in the embed snippet.
- All conversation data is scoped to the merchant; visitors from Merchant A can never access data from Merchant B.
- The script tag is served with a 5-minute cache (`Cache-Control: public, max-age=300`) to reduce server load while keeping customization changes propagated quickly.
