# Shop Update Chatbot - Development Plan

## Goal (Step 2 - Current)
Multi-turn conversation with button-based intent selection:
1. User sends trigger code → Session created, welcome + button options sent
2. User clicks button (List Products / Add New Product) → Action triggered
3. Session persists for conversation flow until timeout/cancel

## Goal (Step 1 - Completed)
A working production-ready app that:
1. Receives inbound messages from Green API webhook
2. If message equals "test-shop" (case-insensitive, trimmed), responds with welcome message
3. Otherwise, ignores the message (returns 200 OK, no response sent)

---

## Progress

### Completed (Step 2)
- [x] Conversation types (Session, Step, FlowDefinition, FlowResult)
- [x] MemoryManager interface + createInMemoryManager implementation
- [x] Flow JSON definition (src/flows/inventory.json)
- [x] FlowController with state machine processing
- [x] sendButtons() method for Green API interactive buttons
- [x] Refactored webhook handler to delegate to FlowController
- [x] Updated app.ts wiring with all new modules
- [x] E2E tests for multi-turn conversations
- [x] WooCommerceClient service with getProducts() method (injectable, tested)
- [x] Wire WooCommerceClient.getProducts() into listProducts action
- [x] Docker integration test for WooCommerce (mock server on host)

### Completed (Step 1)
- [x] Initialize project: package.json, tsconfig.json, vitest.config.ts
- [x] Create custom error classes (ConfigError, MessagesError, GreenApiError, WebhookError)
- [x] Create logger with pino (info, warn, error levels)
- [x] Create config loader with Zod validation
- [x] Create messages folder and loader (messages/en.json)
- [x] Create app.ts with dependency wiring
- [x] Create server.ts with Fastify setup and health endpoint
- [x] Verify server runs and health check works
- [x] Create Green API sender with injectable fetch for testing
- [x] Create mock sender for local testing (MOCK_MODE=true)
- [x] Create webhook handler with trigger detection logic
- [x] Wire webhook handler to server POST /webhook route
- [x] Tests for sender (success, network error, API error)
- [x] Tests for webhook handler (trigger match, non-match, invalid payload)
- [x] E2E tests for full webhook flow (trigger match, non-match, non-text)

### In Progress
(none)

### Pending
- [ ] Investigate better validation approach for product fields (consider Zod schemas, reusable validators, better error messages)

### Completed (Step 2 - WooCommerce Product Creation)
- [x] Implement actual addProduct action (WooCommerce API call to create product)
- [x] Add createProduct method to WooCommerceClient interface and implementation
- [x] Add user-friendly error messages for WooCommerce API errors (network, auth, duplicate SKU, etc.)

### Completed (Step 2 - Add Product Input Flow)
- [x] Input step type with field collection (name, price, stock, description)
- [x] Field validation (price must be number, stock must be integer)
- [x] Memory persistence for partial inputs across conversation turns
- [x] Validation error messages for invalid field types
- [x] Auto-generated SKU (UUID) on product completion

### Deployment
- [x] GitHub Actions workflow for Railway deployment
- [x] Railway configuration (railway.json)
- [x] Dockerfile for production builds
- [x] Docker integration tests (tests/docker/docker.test.ts)
  - `docker-test:production-health` - Build image with fake env vars, verify /health
  - `docker-test:fake-greenapi-whatsapp-flow-list-click` - FAKE GreenAPI flow test with button interaction
  - `docker-test:woocommerce-integration` - WooCommerce API integration via mock server on host
  - `docker-test:prod-env-health` - Build image with real .env vars, verify /health (local only)

---

## Step 1 Complete

All tasks for Step 1 are done:
- Server with health check and webhook endpoint
- Trigger detection ("test-shop" → welcome message)
- Mock mode for local testing
- Full test coverage (34 unit/e2e tests + 4 Docker tests)

---

## Architecture

```
src/
├── index.ts              # Entry point, loads dotenv, starts server
├── app.ts                # Wires all dependencies, creates server
├── config.ts             # Loads and validates env vars
├── logger.ts             # Pino logger setup
├── messages.ts           # Loads messages from JSON file
├── errors.ts             # Custom error classes
├── server.ts             # Fastify server with routes
├── webhook/
│   ├── handler.ts        # Processes webhooks, delegates to FlowController
│   └── types.ts          # Zod schemas for webhook payloads
├── greenapi/
│   └── sender.ts         # Sends messages + buttons via Green API
├── woocommerce/
│   ├── types.ts          # WooCommerceConfig, WooProduct, WooCommerceClient interface
│   └── client.ts         # createWooCommerceClient factory function
├── conversation/
│   ├── types.ts          # Session, Step, FlowDefinition types + MemoryManager interface
│   ├── memory.ts         # createInMemoryManager implementation
│   └── flow-controller.ts # State machine processor
└── flows/
    └── inventory.json    # Flow definition (trigger → intent → actions)

src/messages/
└── en.json               # Bot messages (welcome, intent_prompt, etc.)

tests/
├── unit/                 # Unit tests (mocked dependencies) - runs on CI
│   ├── memory.test.ts    # MemoryManager tests
│   ├── flow-controller.test.ts # FlowController tests
│   ├── sender.test.ts    # Green API sender tests
│   ├── woocommerce.test.ts # WooCommerce client tests
│   └── webhook.test.ts   # Webhook handler tests
├── integration/          # Integration tests (mock HTTP servers) - runs on CI
│   ├── woocommerce.test.ts # WooCommerce client integration
│   └── woocommerce-server.ts # Mock WooCommerce server
├── e2e/                  # E2E tests (full app with Fastify inject) - runs on CI
│   └── e2e.test.ts       # Full webhook flow tests
├── docker/               # Docker tests (requires Docker daemon) - local only
│   └── docker.test.ts    # Container build & health tests
├── prod/                 # Production tests (requires real APIs) - local only
│   └── prod.test.ts      # Real Green API tests
└── mocks/
    ├── greenapi.ts       # Mock factories for Green API
    └── woocommerce.ts    # Mock factories for WooCommerce

Dockerfile                # Production multi-stage build
```

---

## Testing Strategy

All modules use dependency injection for testability:
- `sender.ts` - accepts `fetchFn` parameter (mock fetch in tests)
- `webhook/handler.ts` - accepts `{ flowController, sender, logger }` (all mockable)
- `flow-controller.ts` - accepts `{ memory, flow, messages, triggerCode?, logger }` (all mockable)
- `memory.ts` - implements `MemoryManager` interface (swappable with DB or mock)
- `woocommerce/client.ts` - accepts `fetchFn` parameter (mock fetch in tests)

### Test Commands

| Command | Scope | Runs on CI |
|---------|-------|------------|
| `npm test` | unit + integration + e2e | ✅ Yes |
| `npm run test:docker` | docker tests (requires Docker daemon) | ❌ No |
| `npm run test:prod` | production tests (requires real APIs) | ❌ No |

Run tests: `npm test` (70 tests)

## Configuration

| Env Variable | Description | Default |
|--------------|-------------|---------|
| `TRIGGER_CODE` | Message to start conversation flow | (any message) |
| `SESSION_TIMEOUT_MS` | Session inactivity timeout | 300000 (5 min) |
| `MOCK_MODE` | Use mock sender (no API calls) | false |
| `WOOCOMMERCE_STORE_URL` | WooCommerce store URL (e.g., https://alexgub.com) | required |
| `WOOCOMMERCE_CONSUMER_KEY` | WooCommerce REST API consumer key | required |
| `WOOCOMMERCE_CONSUMER_SECRET` | WooCommerce REST API consumer secret | required |

---

## Deployment Checklist

When adding new features, verify these items before deploying:

### Adding New Asset Directories (JSON, templates, static files)
TypeScript compiler (`tsc`) only outputs `.ts` files. Non-TS assets must be copied manually in the Dockerfile.

**Current asset directories copied in Dockerfile:**
- `src/messages/` → `dist/messages/`
- `src/flows/` → `dist/flows/`

**When adding a new asset directory:**
1. Create the directory under `src/` (e.g., `src/templates/`)
2. Add COPY instruction to Dockerfile production stage:
   ```dockerfile
   COPY src/templates/ ./dist/templates/
   ```
3. Run `npm run docker:build && npm run test:prod` to verify

---

## Next Steps
- Implement listProducts action (WooCommerce integration)
- Implement addProduct action (with OpenAI parsing for product details)
- Add more conversation steps (product details input, confirmation)
- Consider switching to actual WhatsApp buttons when Green API stabilizes
