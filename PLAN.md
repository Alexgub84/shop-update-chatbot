# Shop Update Chatbot - Development Plan

## Goal (Step 1)
A working production-ready app that:
1. Receives inbound messages from Green API webhook
2. If message equals "test-shop" (case-insensitive, trimmed), responds with welcome message
3. Otherwise, ignores the message (returns 200 OK, no response sent)

---

## Progress

### Completed
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
(none)

---

## Step 1 Complete

All tasks for Step 1 are done:
- Server with health check and webhook endpoint
- Trigger detection ("test-shop" → welcome message)
- Mock mode for local testing
- Full test coverage (34 tests)

---

## Architecture

```
src/
├── index.ts          # Entry point, loads dotenv, starts server
├── app.ts            # Wires all dependencies, creates server
├── config.ts         # Loads and validates env vars
├── logger.ts         # Pino logger setup
├── messages.ts       # Loads messages from JSON file
├── errors.ts         # Custom error classes
├── server.ts         # Fastify server with routes
├── webhook/
│   ├── handler.ts    # Processes webhooks, trigger detection
│   └── types.ts      # Zod schemas for webhook payloads
└── greenapi/
    └── sender.ts     # Sends messages via Green API

messages/
└── en.json           # Bot messages (editable)

tests/
├── sender.test.ts    # Green API sender tests
├── webhook.test.ts   # Webhook handler tests
└── mocks/
    └── greenapi.ts   # Mock factories for testing
```

---

## Testing Strategy

All modules use dependency injection for testability:
- `sender.ts` - accepts `fetchFn` parameter (mock fetch in tests)
- `webhook/handler.ts` - accepts `{ sender, logger, messages, triggerCode }` (all mockable)

Run tests: `npm test`

---

## Next Steps After Step 1
- Session state management (in-memory first, Redis later)
- Intent prompt (list/add/cancel)
- WooCommerce integration
- Product listing with pagination
- Product adding with OpenAI parsing
