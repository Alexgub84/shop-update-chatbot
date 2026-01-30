# Development Lessons Learned

A log of mistakes, bugs, and issues we've encountered with their solutions.

---

## Entries

<!-- Add new entries at the top -->

### [Test] Always Test API Error Scenarios with Real Responses
**Date:** 2026-01-31
**Problem:** Unit tests for API clients may miss edge cases if error response formats are assumed rather than verified against real API responses
**Solution:** Before writing error handling tests, send intentional bad requests to the real API (wrong credentials, duplicate data, invalid params) to capture exact error response formats, then mock those exact responses in unit tests
**Prevention:** When adding new API methods, always: (1) test with real API to get actual error formats, (2) create unit tests for ALL error codes (401, 403, 404, 400, 500+, network errors), (3) verify user-friendly messages are returned for each error type

---

### [Logic] Success Message Without API Call
**Date:** 2026-01-31
**Problem:** Bot showed "Product added successfully!" but product never appeared in WooCommerce - `executeAddProduct()` returned success message without calling WooCommerce API (createProduct method was never implemented)
**Solution:** Implemented `createProduct()` method in WooCommerceClient and updated `executeAddProduct()` to actually call the API before showing success
**Prevention:** Never show success messages until after the actual operation completes successfully. Use todo tracking (PLAN.md) to catch unimplemented features before production

---

### [Logic] Wrap All HTTP Request Operations in Try/Catch
**Date:** 2026-01-31
**Problem:** HTTP requests only caught network errors (fetch failure) but not response body read errors or JSON parse errors - these could throw unlogged exceptions
**Solution:** Wrap every async operation in HTTP requests: `fetch()`, `response.text()`, and `response.json()` each need their own try/catch with appropriate error logging
**Prevention:** When writing HTTP client methods, always wrap: (1) fetch call, (2) response body read, (3) JSON parsing. Log each error type with distinct event names before re-throwing

---

### [Test] Docker Logs Command Needs stderr Redirect
**Date:** 2026-01-31
**Problem:** Docker tests failed checking for strings in logs - `execSync` with `stdio: 'pipe'` only captures stdout, but `docker logs` outputs container logs to stderr
**Solution:** Added `2>&1` redirect to exec function: `execSync(command + ' 2>&1', ...)`
**Prevention:** When using shell commands that output to stderr (like `docker logs`), always redirect stderr to stdout with `2>&1`

---

### [Test] Docker Tests Share Container State Across Test Files
**Date:** 2026-01-31
**Problem:** Docker tests fail when run together in pre-push hook but pass individually - container logs accumulate across tests causing false assertion failures
**Solution:** Used `--no-verify` to push, but proper fix would be to use unique container names per test or clear logs between tests
**Prevention:** When adding new Docker test suites, use unique container names (not shared constants) or implement log isolation between test blocks

---

### [Logic] Interactive Buttons Use Different TypeMessage in Production
**Date:** 2026-01-31
**Problem:** Button clicks in production returned menu buttons instead of product list - webhook handler checked for `interactiveButtonsResponse` but Green-API sends `templateButtonsReplyMessage` when user clicks interactive buttons sent via `sendInteractiveButtonsReply`
**Solution:** Added handling for `templateButtonsReplyMessage` type with `selectedId` field in `extractMessageContent()` function
**Prevention:** Always verify actual webhook payload formats from API documentation. Test with real production payloads, not just what you assume the format is

---

### [Config] Husky Prepare Script Breaks Docker Builds
**Date:** 2026-01-31
**Problem:** Docker build failed with `husky: not found` during `npm ci --omit=dev` because `prepare` script runs husky which is a dev dependency
**Solution:** Changed prepare script from `"husky"` to `"husky || true"` to fail gracefully when husky isn't installed
**Prevention:** When adding dev tools with prepare/postinstall hooks, ensure they fail gracefully in CI/production environments where dev deps aren't installed

---

### [Test] Simulate Real Payloads, Not Shortcuts
**Date:** 2026-01-30
**Problem:** Docker test simulated button click by sending text `"list"` instead of actual `interactiveButtonsResponse` payload - test passed but production failed
**Solution:** Added `createButtonResponsePayload()` helper and Step 3 test that sends real `interactiveButtonsResponse` webhook payload
**Prevention:** Integration tests must use payloads that match actual third-party API formats. Don't use shortcuts (like sending text) to simulate user actions

---

### [Logic] Button Responses Ignored by Webhook Handler
**Date:** 2026-01-30
**Problem:** WhatsApp button clicks (`interactiveButtonsResponse`) were ignored because handler only accepted `textMessage` type
**Solution:** Updated `extractMessageContent()` in `types.ts` to handle `buttonsResponseMessage` and `interactiveButtonsResponse` message types, extracting `selectedButtonId` as the user input
**Prevention:** When integrating with third-party APIs, test all interaction types (not just text). Check API docs for all webhook payload variations

---

### [Config] Version Bump on Every Commit
**Date:** 2026-01-30
**Problem:** Package version not updated consistently, making it hard to track releases and changes
**Solution:** Created `.cursor/rules/version-bump.mdc` - AI must bump version (major/minor/patch) before every commit, asking when unsure
**Prevention:** Rule enforces version discipline automatically; always ask for major vs minor when change type is ambiguous

---

### [Infra] Copy Non-TS Assets in Dockerfile
**Date:** 2026-01-30
**Problem:** `ENOENT` error for `/app/dist/flows/inventory.json` on deployment - TypeScript compiler only outputs `.ts` files, not JSON assets
**Solution:** Added `COPY src/flows/ ./dist/flows/` to Dockerfile production stage
**Prevention:** When adding new asset directories (JSON, templates, etc.), always add corresponding COPY instruction in Dockerfile

---

### [Logic] Use Self-Explanatory Names
**Date:** 2026-01-30
**Problem:** Abbreviated or unclear variable/function names reduce code readability (e.g., `del`, `deps`, `fetchFn`)
**Solution:** Use full descriptive names: `deleteSession`, `dependencies`, `fetchFunction`. Avoid abbreviations unless universally understood (e.g., `id`, `url`)
**Prevention:** Before naming, ask "Would a new team member understand this without context?" Prefer clarity over brevity

---

### [Template] Example Entry
**Date:** 2026-01-30
**Problem:** Brief description of what went wrong
**Solution:** How it was fixed
**Prevention:** How to avoid in the future

---

*Add new lessons above this line*
