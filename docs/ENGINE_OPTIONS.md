# Engine wiring (chosen: option 1)

**Decision:** keep **option 1** — shared `Ledger`, browser calls it directly,
Node exposes a thin stdlib `node:http` shell. No router framework in the frontend.

```
BookService
  ├─ WasmBookService extends Ledger   // in-tab method calls + OPFS/file/locker
  └─ HttpBookService                  // fetch → Node :8000
Ledger                                // one domain session
server/                               // locker/ (opaque store) + Ledger HTTP + static UI
```

Locker code stays under `server/src/locker/` and must not import `Ledger`.
Browser locker I/O is `LockerBackend` (`frontend/src/book/persist/locker/`):
Node `/api/books` or BYO Supabase. Supabase is wasm-only (ADR-018) and
encrypts objects in the tab (ADR-019).

Option 2 (UI always speaks HTTP / in-process Hono) was prototyped and **rejected**:
extra frontend dependency, more shell lines, no maintainability win for a
local-first app. See conversation history / ADR-016.
