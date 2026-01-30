# Development Lessons Learned

A log of mistakes, bugs, and issues we've encountered with their solutions.

---

## Entries

<!-- Add new entries at the top -->

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
