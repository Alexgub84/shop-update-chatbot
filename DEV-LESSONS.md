# Development Lessons Learned

A log of mistakes, bugs, and issues we've encountered with their solutions.

---

## Entries

<!-- Add new entries at the top -->

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
