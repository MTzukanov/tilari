# Working modes

Tilari can run in five practical shapes. They differ by **where the UI lives**,
**where ledger math runs**, and **what the optional Node process stores**.

| Mode | UI | Ledger math | Persistence | Multi-user? |
|------|----|-------------|-------------|-------------|
| [1. Single HTML](#1-fully-independent-single-html) | One `.html` file | Browser wasm | File picker / download only | No (one person, offline) |
| [2. Static website](#2-static-html-website) | `frontend/dist/` | Browser wasm | OPFS + local save | No shared live book |
| [3. Website + locker](#3-website--backend-locker) | Static or Node-served | Browser wasm | Server opaque store + ETags | Multi-*book* store; concurrent edit via ETag 409 |
| [3b. Static UI + BYO Supabase locker](#3b-static-ui--byo-supabase-locker) | Static `frontend/dist` | Browser wasm **only** | User Supabase Storage | Same as mode 3 at GET/PUT boundaries; **no server-side processing** |
| [4. Website + Node processing](#4-website--backend-full-processing) | Same + `tilari.engine=http` | Node `Ledger` | In-memory session; optional export→locker | **Not** multi-user ledger — one open book per process |

Default product path for self-host / VPS is **mode 3** (browser processing +
opaque locker). When Node is connected, the open dialog also chooses
**client-side vs server-side math** — [two processing engines](#two-processing-engines-when-a-backend-is-connected).
See [DEPLOY.md](DEPLOY.md), ADR-014 / ADR-015 / ADR-016 in
[DECISIONS.md](DECISIONS.md).

End-user HTML (Finnish, English, Swedish, German; GitHub Pages): [`../site/`](../site/).
How that site is published: [PAGES.md](PAGES.md).

### How people actually run it

The table above is the architecture. Operators usually pick one of these
**deployments** (several map to the same mode):

| Operator goal | Architecture | Notes |
|---------------|--------------|-------|
| USB / email, zero install | Mode 1 | Double-click one HTML. Weakest persistence. |
| Daily work on one PC | Mode 2 + local locker (desktop pack) | [Why this beats single HTML](#local-node-vs-single-html) |
| Small office, no public URL | Mode 3 on a [VPN](#vpn) | Tailscale / WireGuard / company VPN is the gate (no app auth) |
| Public hostname | Mode 3 on a VPS | [DEPLOY.md](DEPLOY.md) + Cloudflare Access |
| Cloud shelf, no Tilari Node | Mode 3b | [BYO Supabase](#3b-static-ui--byo-supabase-locker) |
| Sync `.kitsas` via Dropbox/Drive | Mode 1 or 2 + OS folder | [Synced folders](#synced-folders-dropbox-google-drive) |
| Heavy book on a weak tablet | Mode 4 | On the server; **not** with Supabase |

## Two processing engines (when a backend is connected)

The UI always runs in the browser. Use Tilari as a **normal web app** (each action is a request to the server) or work **locally in the tab** and save when you choose. When a Tilari **Node** process is reachable (`/api`), opening a book asks:

| UI label | Engine | Where posting and reports run |
|----------|--------|-------------------------------|
| **In this browser** | `wasm` (default) | Client-side: sql.js in this tab |
| **On the server** | `http` | Server-side: the same TypeScript `Ledger` in the Node process |

Without a Node backend (single HTML, GitHub Pages, Supabase locker) only
The **In this browser** option exists. Server-side processing is hidden on a Supabase locker
(ADR-018): that backend stores encrypted blobs; it cannot run Ledger.

The active engine is a badge in the header. Last choice is stored in
`localStorage` key `tilari.engine`. Changing engine closes the open book.

The locker (where the file sits) is independent of the engine. You can keep
books on the Node locker and still process them **in the tab**. On the server
is not “use the locker”; it is “run the math on the server.”

### Client-side (`wasm`) — default

**Advantages**

- Book bytes are interpreted only in this tab. The Node locker, if used, stores
  opaque files and does not need to understand vouchers.
- Each tab is its own ledger session. Several people can open different books
  (or the same book, with ETag 409 on conflicting locker saves).
- Works after the file is in the tab even if the network drops (until you need
  to save to a remote locker).
- Survives a Node restart: the working copy is in OPFS, not in server RAM.

**Disadvantages**

- Heavy books on a weak phone or tablet can be slow (SQLite wasm in the tab).
- The whole lean book must be loaded into the browser.
- Unsaved edits live in this tab until you save to disk or the locker.

### Server-side (`http` / On the server)

**Advantages**

- Moves SQLite work off a weak device onto the machine that runs Node.
- Later reopen can skip shipping the whole file into wasm; the process already
  has a session (until restart).
- Same posting rules as the browser (one `Ledger` class, not a second engine).

**Disadvantages**

- **One open book per Node process.** A second On the server open replaces the
  first. Not multi-user editing.
- Every click needs the API. Reload, `tsx watch`, or container restart clears
  the in-memory session; the UI must pick a book again.
- The server **sees** the ledger (it is not an opaque locker on this path).
- Unavailable with a Supabase locker.

Use **In this browser** for daily work and shared lockers. Use
**On the server** for a heavy book on a weak client, one operator, private host.

---

## 1. Fully independent single HTML

One file you can double-click or open via `file://`. No server, no network.

```bash
cd frontend && npm run build:singlefile
# → frontend/dist-single/index.html  (~1.7MB; JS/CSS/WASM inlined)
```

**What works**

- Wasm ledger (sql.js) in the tab
- Open a local `.kitsas` via the file picker
- Save / download a modified file

**Limits** (vs a normal https/static host)

- No OPFS persistence (`file://` is not a secure context for that)
- Weaker crypto where `SubtleCrypto` is blocked
- No locker API and no `http` engine
- Not a multi-tab “always-on” working copy across refresh

Use this for a quick offline trial or emailing a self-contained demo. Details:
[PACKAGING.md](PACKAGING.md).

GitHub Pages publishes the **same build** as
[tilari.html](https://mtzukanov.github.io/tilari/tilari.html) over **https**
([PAGES.md](PAGES.md)). That host is a secure context, so it behaves like
[mode 2](#2-static-html-website) (OPFS, Chromium in-place save, Supabase
locker) while remaining one file. Still no Node locker and no server-side processing.

---

## 2. Static HTML website

Normal Vite production build: `index.html` + `assets/` + wasm chunk. Hosted on
any static file server (or opened from a tree with `base: './'`).

```bash
cd frontend && npm run build
# → frontend/dist/
```

**What works**

- Full browser engine (`wasm`): browse, post, reports
- OPFS working copy across refresh (https / localhost secure context)
- Local file open / save (or download when the browser cannot overwrite)
- UI engine radios appear; **`http` only works if `/api` reaches a Node process**

**Without a backend**

- Each tab is its own ledger session (“tab-local”)
- No shared locker list; no server-side copy of the book
- Two browsers editing the same downloaded file will diverge until someone
  manually merges / overwrites files on disk

**With a reverse proxy that adds `/api`**

- Becomes mode 3 or 4 depending on engine choice (below)

Desktop one-process pack (`./scripts/run-desktop.sh`) is mode 2 UI served by
Node plus full API on loopback — see [PACKAGING.md](PACKAGING.md).

---

## 3. Website + backend locker

Static (or Node-served) UI with the default **`wasm`** engine, plus the Node
locker at `/api/books*`. Ledger math still runs **in each browser tab**. The
server stores opaque bytes only — it does not interpret vouchers.

```
Browser tab (WasmBookService / Ledger)
  ├─ OPFS session folder (lean working.kitsas)
  ├─ OPFS tilari/blobs/{sha}           # shared attachment cache
  ├─ GET/PUT /api/books/{id}           # lean .kitsas (ETag = sha256)
  └─ GET/PUT /api/books/{id}/attachments  # TILARIAT pack (separate ETag)
Node locker (server/src/locker/)
  └─ {books_dir}/{id}.kitsas + .attachments/ + .meta.json
```

**How to run**

- Dev: `npm run dev` from repo root (API `:8000` + Vite `:5173`, proxies `/api`)
- Desktop: `./scripts/run-desktop.sh`
- VPS: [DEPLOY.md](DEPLOY.md) (Docker Compose; Cloudflare Access for who can reach the host)

In the UI: **Avaa palvelimelta…** / **Tallenna palvelimelle**. Opening from the
locker downloads the lean DB first; attachments sync in the background (progress
in the top bar) unless every `Liite.sha` is already in `tilari/blobs/`.

### Concurrent users and “out of sync”

Several people can use the same hosted UI and the same locker. There is **no**
live shared session: each tab has its own in-memory + OPFS copy after open.

| Situation | What happens |
|-----------|----------------|
| User A and User B both open book `id` | Each gets a snapshot (lean + later attachments). Edits stay local until save. |
| A saves first (valid `If-Match`) | Locker updates; A’s ETag advances. |
| B still has the old ETag and saves | `409 etag_mismatch` — UI tells B the server copy changed and suggests **Tallenna palvelimelle nimellä…**; local work is not force-overwritten onto the server. |
| A saves ledger; B only has stale attachment ETag | Same idea for the attachments PUT (separate ETag / kind). |
| Tab refresh mid-edit | OPFS restores that tab’s working copy; it may still be behind the locker until the user reopens or saves successfully. |
| Attachment sync still running | Reports/browse of lean data work; missing blobs catch up as the pack sync finishes. |

There is **no** real-time CRDT / presence. “Cached data in the UI” means the
tab’s Ledger + OPFS (+ in-progress attachment map). The locker is the shared
source of truth only at **successful** GET/PUT boundaries.

App auth is still out of scope (ADR-006); self-host relies on network gate
(e.g. Cloudflare Access), not per-user book ACLs.

---

## 3b. Static UI + BYO Supabase locker

Same as mode 3 (wasm in the tab, opaque shelf, OPFS working copy) except the
shelf is **the user’s** Supabase Storage project, not `server/src/locker/`.
No Tilari Node process is required. The user pastes Project URL, bucket, anon
key, and a locker-wide encryption secret (all four in `sessionStorage` as
`tilari.locker.supabase`).

**Mode 4 / On the server is not available.** There is no Node `Ledger` and no
`POST /api/open-locker`. The engine dialog only offers **In this browser**.
Do not mix `tilari.engine=http` with this backend (ADR-018).

```
Browser tab (WasmBookService / Ledger)
  ├─ OPFS session + tilari/blobs/{sha}  (plaintext working copy)
  ├─ Storage tilari/vault.json          (KDF salt + verifier, not secret)
  ├─ Storage tilari/{id}/book.kitsas + meta.json   (AES-GCM envelopes)
  └─ Storage tilari/{id}/attachments/{sha}         (AES-GCM envelopes)
User Supabase project (private bucket)
```

Layout, RLS, CORS, and encryption: [STORAGE.md](STORAGE.md). URL+anon opens
the bucket; the secret opens the files. Never paste `service_role`. Concurrent
saves compare `meta.json` sha values (check-then-put; not as strict as Node
`If-Match`).

---

## 4. Website + backend full processing

Same UI and server process, but the user picks **On the server**
(`tilari.engine=http`). `HttpBookService` sends every ledger operation to the
server. The process holds **one** in-memory `Ledger` (`server/src/session.ts`).

```
Browser tab (HttpBookService)
  └─ fetch /api/open, /api/…, /api/export, …
Node process
  └─ single Ledger instance for the whole process
```

**What this is good for**

- Moving heavy SQLite wasm off a weak device
- Same posting rules as the browser (one TypeScript `Ledger` class)
- Optional `saveToLocker` via export then locker PUT

**What this is not**

- Not multi-user concurrent editing of one book
- Not multi-book parallel sessions in one process
- Not SaaS / per-user auth (ADR-006)
- **Not available with a Supabase locker** (mode 3b / ADR-018)

### When two users go out of sync

| Situation | What happens |
|-----------|----------------|
| User A has the http engine book open | Server `Ledger` holds A’s book; `session_id` + `db_path` bind the UI. |
| User B opens another (or the same) book via http | **Replaces** the process ledger. A’s next API call no longer matches A’s book. |
| A’s UI still shows old balances / vouchers | Client cache of the last responses / React state. Health / `session_id` mismatch should drop the live book and ask again ([README](../README.md), ADR-012) — until that check runs, the screen can look “fine” while the server is already serving someone else. |
| Two tabs, both `http`, same user | Same singleton: second open wins; first tab can desync the same way. |
| Mix: A on `wasm`+locker, B on `http` | Different engines. A’s edits are local until locker save. B mutates the Node session only. They meet only if someone exports/saves through the locker — then ETag rules from mode 3 apply. |
| Server restart / `tsx watch` reload | In-memory session cleared. UI must pick a book again; do not trust a leftover path. |

Until a later ADR adds real sessions (and likely auth), treat mode 4 as
**single concurrent operator** on that Node process — useful on desktop or a
private host, not as a shared office ledger server.

---

## Local Node vs single HTML

Mode 1 (`file://` one-file build) and a local desktop pack (Node serving
`frontend/dist` on loopback, [PACKAGING.md](PACKAGING.md)) both run ledger
math in the tab by default. The desktop pack is still worth it.

| Capability | Single HTML (`file://`) | Local server + client (`http://127.0.0.1:8000`) |
|------------|-------------------------|--------------------------------------------------|
| Open / edit `.kitsas` | Yes (file picker) | Yes |
| OPFS working copy across refresh | No (`file://` is not a secure context) | Yes |
| In-place overwrite via File System Access | Unreliable / often blocked | Yes, in [supporting browsers](#in-place-save-which-browsers) |
| `SubtleCrypto` (needed for Supabase vault, ADR-019) | Often blocked | Yes (secure context) |
| Node locker (`/api/books`) | No | Yes (`KITSAS_BOOKS_DIR`) |
| On the server (`http` engine) | No | Yes |
| Phone / other device on LAN | No | `--lan` prints `TILARI_LAN_URL=` |
| Size / install | ~1.7 MB one file | Node payload (AppImage / zip / `run-desktop.sh`) |

Use single HTML for a demo stick or an air-gapped look. Use the local pack
for real books.

`https://` static hosting of `frontend/dist/` (mode 2) or Pages
`tilari.html` recovers OPFS and crypto **without** Node, but still has no
Node locker and no server-side processing until you add a backend or Supabase.

---

## VPN

Same process as mode 3 (UI + opaque locker; optional mode 4 for one operator).
The **network gate** is a VPN instead of Cloudflare Access. Tilari has no
per-user app login (ADR-006): whoever can reach the HTTP port can list and
overwrite locker books (ETag 409 is the only conflict brake).

**Good for:** a few trusted devices (office NAS, home server, Tailscale
subnet). **Not for:** binding `--lan` on a public café network.

### Desktop pack on a VPN host

```bash
./scripts/run-desktop.sh --lan --no-browser
# TILARI_URL=http://127.0.0.1:8000/
# TILARI_LAN_URL=http://100.x.y.z:8000/   # Tailscale / WireGuard / LAN IPv4
```

`--lan` binds `0.0.0.0`. Clients on the same VPN open the printed
`TILARI_LAN_URL`. Prefer the VPN IP (e.g. Tailscale `100.x`) over a
LAN address if you do not want Wi-Fi neighbours to connect.

`--lan` and `--host` are mutually exclusive. To bind only the VPN NIC:

```bash
./scripts/run-desktop.sh --host 100.x.y.z --no-browser
```

### Docker on a VPN-only machine

Compose in this repo **does not publish** `:8000` (Cloudflare tunnel reaches
the internal network). On a host that is reachable only via VPN, publish the
port with an override, still without a public A record:

```yaml
# docker-compose.override.yml  (not for a public VPS)
services:
  tilari:
    ports:
      - "8000:8000"
```

Then `docker compose up -d tilari` and open `http://<vpn-ip>:8000/`.
Books: `~/tilari/data/books` (see [DEPLOY.md](DEPLOY.md)). Leave the
`tunnel` profile off.

Public hostname + Access policy stays [DEPLOY.md](DEPLOY.md). Do not mix
“VPN-only publish” with a Cloudflare public hostname unless Access is on.

---

## In-place save (which browsers)

The wasm engine keeps a working copy in OPFS (https / localhost). **Writing
the same path on disk** uses the File System Access API:

- Open: `showOpenFilePicker({ mode: 'readwrite' })` → `FileSystemFileHandle`
- Save: `handle.createWritable()` (header **Tallenna**)
- Save as: `showSaveFilePicker` (`frontend/src/app/open/saveKitsasAs.ts`)

Fallback when the API is missing or permission is denied: `<input type="file">`
to open, then **Tallenna nimellä…** (`downloadBytes` / a download).

Secure context required. `file://` single HTML often cannot overwrite.

| Browser | Overwrite the opened file | OPFS working copy | Typical save UX |
|---------|---------------------------|-------------------|-----------------|
| Chrome, Edge, Opera, Brave, Chromium **desktop** | Yes (`showOpenFilePicker` / `createWritable`) | Yes on https/localhost | **Tallenna** updates the linked `.kitsas` |
| Firefox (desktop + Android) | No (Mozilla will not ship the pickers) | Yes (111+) on https/localhost | Download a copy |
| Safari (macOS / iOS / iPadOS) | No (WebKit opposes the pickers) | Yes (15.2+) on https/localhost | Download a copy |
| Chrome Android | Do not rely on it | Yes | System document picker to **open**; save is a download or Android “Save to” |
| iOS Chrome / Firefox | No (WebKit) | Limited | Share / Files |

Chromium desktop is the path that matches “save in place”. On Android, Tilari
uses the platform file picker (Storage Access Framework): the user can
**open** a `.kitsas` from Dropbox or Google Drive, but a later **Tallenna**
does not reliably replace that cloud object; they save a copy.

UI copy: `file.linkUnsupported` when pickers are absent;
`file.linkOriginal` when the tab has bytes but no writable handle.

---

## Synced folders (Dropbox, Google Drive)

Tilari has no Dropbox/Drive SDK. Sync is “the OS folder is a folder”.

### Desktop (Dropbox or Drive mounted)

1. Install the vendor client so `~/Dropbox/…` or `Google Drive/…` is a real
   directory (not a placeholder online-only stub if you can avoid it).
2. Use **Chromium desktop**, **Valitse uusi tiedosto**, pick the `.kitsas`
   inside that folder so the handle stays linked.
3. **Tallenna** overwrites the same path; the client uploads the new bytes.

Close **desktop Kitsas** first ([COMPATIBILITY.md](COMPATIBILITY.md)): WAL +
exclusive lock. Two people saving the same synced file still last-write-wins
at the vendor; the Node/Supabase locker ETag story does **not** apply here.

Firefox/Safari: each save is a new download; drag it back onto the synced
folder or you will fork copies.

### Android (open/save from Dropbox or Drive)

There is no in-place File System Access handle.

- **Open:** **Valitse uusi tiedosto…** → Android document UI → Dropbox,
  Drive, or Files. Tilari reads the bytes into OPFS (https host) or memory.
- **Save:** **Tallenna nimellä…** lands in Downloads (or the browser’s save
  sheet). From there: Drive/Dropbox “upload”, or the system **Save to** /
  share target if the browser offers it.

Prefer a locker (Node on VPN, or Supabase) if the same book must round-trip
between a phone and a PC without babysitting Downloads.

---

## Choosing quickly

| Goal | Use |
|------|-----|
| Email / USB demo, no install | Mode 1 single HTML |
| Local work, files only | Mode 2 static or `npm run dev` without saving to locker |
| Daily work with working copy + optional locker | Desktop pack ([PACKAGING.md](PACKAGING.md)) |
| Self-host shared file shelf | Mode 3 (wasm + locker); reopen after conflicts |
| Office / home, no public URL | Mode 3 on a [VPN](#vpn) |
| Static host, user’s own Supabase | Mode 3b (wasm only; no server-side processing) |
| One machine / one operator, server-side math | Mode 4 (`http` engine) — **not** with a Supabase locker |
| `.kitsas` in Dropbox/Drive | Chromium desktop + mounted folder; Android = open/save copy |
| Public hostname | [DEPLOY.md](DEPLOY.md) — prefer mode 3 |

Related: [ENGINE_OPTIONS.md](ENGINE_OPTIONS.md), [STORAGE.md](STORAGE.md),
[COMPATIBILITY.md](COMPATIBILITY.md) (close desktop Kitsas before sharing WAL files).
User-facing HTML: [`../site/index.html`](../site/index.html) (fi),
[`../site/en/`](../site/en/) (en),
[`../site/sv/`](../site/sv/) (sv),
[`../site/de/`](../site/de/) (de).
