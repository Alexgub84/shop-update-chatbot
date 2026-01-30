# Shop Update Chatbot

WhatsApp chatbot for shop inventory management via Green API and WooCommerce.

## Features

- **Multi-turn conversations** with button-based navigation
- **List Products** - Fetch and display products from WooCommerce store
- **Add Products** - Guided product creation with field validation
  - Required fields: Name, Price, Stock
  - Optional: Description
  - Auto-generated SKU (UUID)
  - Input validation (price must be number, stock must be integer)
  - Memory persistence for partial inputs across messages
  - "stop" command to cancel and return to menu

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
MOCK_MODE=true
TRIGGER_CODE=test-shop
GREEN_API_INSTANCE_ID=your_instance_id
GREEN_API_TOKEN=your_api_token
WOOCOMMERCE_STORE_URL=https://your-store.com
WOOCOMMERCE_CONSUMER_KEY=ck_your_key
WOOCOMMERCE_CONSUMER_SECRET=cs_your_secret
```

## Development

Start the dev server with hot reload:
```bash
npm run dev
```

Run tests:
```bash
npm test              # Unit, integration, e2e tests
npm run test:docker   # Docker container tests (requires Docker)
npm run test:prod     # Production API tests (requires real credentials)
```

## Conversation Flow

```
User: "test-shop"
Bot: [Welcome + Buttons: List Products | Add New Product]

User: [Click "List Products"]
Bot: [Product list from WooCommerce + Buttons]

User: [Click "Add New Product"]
Bot: "Please provide the product details:
     Name: Product Name
     Price: 29.99
     Stock: 10
     Description: (optional)
     
     Send "stop" to cancel."

User: "Name: Widget\nPrice: 19.99\nStock: 50"
Bot: "Product "Widget" added successfully!"
     [Buttons: List Products | Add New Product]
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 3000) |
| `LOG_LEVEL` | Pino log level | No (default: info) |
| `MOCK_MODE` | Log messages instead of sending | No (default: false) |
| `FAKE_GREENAPI_MODE` | Fake sender for testing | No (default: false) |
| `TRIGGER_CODE` | Message to start conversation | No (any message) |
| `GREEN_API_INSTANCE_ID` | Green API instance ID | Yes |
| `GREEN_API_TOKEN` | Green API token | Yes |
| `WOOCOMMERCE_STORE_URL` | WooCommerce store URL | Yes |
| `WOOCOMMERCE_CONSUMER_KEY` | WooCommerce API key | Yes |
| `WOOCOMMERCE_CONSUMER_SECRET` | WooCommerce API secret | Yes |

## Endpoints

- `GET /health` - Health check
- `POST /webhook` - Green API webhook receiver

## Project Structure

```
src/
├── index.ts              # Entry point
├── app.ts                # Dependency wiring
├── config.ts             # Environment config
├── logger.ts             # Pino logger
├── messages.ts           # Message loader
├── errors.ts             # Custom errors
├── server.ts             # Fastify server
├── messages/
│   └── en.json           # Bot messages
├── flows/
│   └── inventory.json    # Conversation flow definition
├── conversation/
│   ├── types.ts          # Session, Step, Flow types
│   ├── memory.ts         # In-memory session manager
│   └── flow-controller.ts # State machine processor
├── webhook/
│   ├── handler.ts        # Webhook processing
│   └── types.ts          # Payload schemas
├── greenapi/
│   └── sender.ts         # Green API client
└── woocommerce/
    ├── types.ts          # WooCommerce types
    └── client.ts         # WooCommerce API client

tests/
├── unit/                 # Unit tests (mocked dependencies)
├── integration/          # Integration tests (mock servers)
├── e2e/                  # End-to-end tests (Fastify inject)
├── docker/               # Docker container tests
├── prod/                 # Production API tests
└── mocks/                # Test mock factories
```

## Deployment (Railway via GitHub Actions)

### Prerequisites

1. Create a project on [Railway](https://railway.app)
2. Generate an API token: Railway Dashboard → Account Settings → Tokens

### GitHub Secrets

Add to your GitHub repository (Settings → Secrets → Actions):

| Secret | Description |
|--------|-------------|
| `RAILWAY_TOKEN` | Project token from Railway |

### Railway Environment Variables

Configure in Railway Dashboard → Service → Variables (see Environment Variables table above).

### Deploy

Push to `main` branch triggers automatic deployment:
1. CI runs lint, tests, and build
2. On success, deploys to Railway
