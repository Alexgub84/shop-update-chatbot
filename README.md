# Shop Update Chatbot

WhatsApp chatbot for shop inventory management via Green API.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

3. Edit `.env` with your settings:
```
PORT=3000
LOG_LEVEL=info
MOCK_MODE=true          # Set to false for production
TRIGGER_CODE=test-shop  # Optional - if not set, responds to any message
GREEN_API_INSTANCE_ID=your_instance_id
GREEN_API_TOKEN=your_api_token
```

## Development

Start the dev server with hot reload:
```bash
npm run dev
```

Run tests:
```bash
npm test
```

## Mock Mode

When `MOCK_MODE=true`, the bot logs messages instead of sending them to Green API. Use this for local development and testing.

## Endpoints

- `GET /health` - Health check
- `POST /webhook` - Green API webhook receiver

## How It Works

1. Green API sends incoming WhatsApp messages to `/webhook`
2. If `TRIGGER_CODE` is set and message equals it, bot responds with welcome message
3. If `TRIGGER_CODE` is not set, bot responds to any text message
4. Non-matching messages are ignored (returns 200 OK but no response sent)

## Testing the Webhook

```bash
# Trigger message (should respond)
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "typeWebhook": "incomingMessageReceived",
    "instanceData": { "idInstance": 123, "wid": "bot@c.us" },
    "senderData": { "chatId": "user@c.us", "sender": "user@c.us" },
    "messageData": {
      "typeMessage": "textMessage",
      "textMessageData": { "textMessage": "test-shop" }
    },
    "idMessage": "MSG001"
  }'

# Non-trigger message (should be ignored)
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "typeWebhook": "incomingMessageReceived",
    "instanceData": { "idInstance": 123, "wid": "bot@c.us" },
    "senderData": { "chatId": "user@c.us", "sender": "user@c.us" },
    "messageData": {
      "typeMessage": "textMessage",
      "textMessageData": { "textMessage": "hello" }
    },
    "idMessage": "MSG002"
  }'
```

## Deployment (Railway via GitHub Actions)

### Prerequisites

1. Create a project on [Railway](https://railway.app)
2. Generate an API token: Railway Dashboard → Account Settings → Tokens

### GitHub Secrets

Add this secret to your GitHub repository (Settings → Secrets → Actions):

| Secret | Description |
|--------|-------------|
| `RAILWAY_TOKEN` | Project token from Railway (Project → Settings → Tokens) |

### Railway Environment Variables

Configure these in Railway Dashboard → Service → Variables:

```
PORT=3000
LOG_LEVEL=info
MOCK_MODE=false
TRIGGER_CODE=test-shop  # Optional
GREEN_API_INSTANCE_ID=your_instance_id
GREEN_API_TOKEN=your_api_token
```

### Deploy

Push to `main` or `master` branch triggers automatic deployment:

1. CI runs lint, tests, and build
2. On success, deploys to Railway

## Project Structure

```
src/
├── index.ts          # Entry point
├── app.ts            # Dependency wiring
├── config.ts         # Environment config
├── logger.ts         # Pino logger
├── messages.ts       # Message loader
├── errors.ts         # Custom errors
├── server.ts         # Fastify server
├── messages/
│   └── en.json       # Bot messages (editable text)
├── webhook/
│   ├── handler.ts    # Webhook processing
│   └── types.ts      # Payload schemas
└── greenapi/
    └── sender.ts     # Green API client

tests/
├── unit/
│   ├── sender.test.ts   # Sender unit tests
│   └── webhook.test.ts  # Handler unit tests
├── e2e/
│   └── e2e.test.ts      # End-to-end tests
└── mocks/
    └── greenapi.ts      # Test mocks
```
