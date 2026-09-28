# AgberoRecon Backend

The USSD settlement backend: two USSD flows and one shared ledger.

| File | What it does |
|---|---|
| `src/ussd.js` | Driver-pay flow: menu, plate check, wallet debit, `PAID` row (Samuel) |
| `src/agent.js` | Agent-check flow: plate in, `PAID ✅` / `UNPAID ❌` out (Ayodeji) |
| `src/sessions.js` | Menu position per phone, shared by both flows — USSD is stateless, so this is what remembers where a caller is in a menu |
| `src/ledger.js` | Every query about a settlement: today's payment for a plate, the plate lookup, the UNPAID detection, the dashboard feed and totals (Ayodeji) |
| `src/dashboard.js` | The read-only endpoints the dashboard polls (Ayodeji) |
| `src/db.js` | PostgreSQL pool, schema and the two "once per plate per day" constraints (Samuel) |
| `src/validation.js` | Phone and plate normalisation, shared by every entry point (Samuel) |
| `src/auth.js` | Callback IP/secret guards, plus the optional dashboard key (Samuel) |
| `src/seed.js` | Pre-funds a driver wallet for the demo (Samuel) |
| `src/levy.js` | The fixed levy and the park-local clock, with no I/O (Ayodeji) |
| `src/dashboard-shape.js` | Query parsing and the JSON shape of a ledger row (Ayodeji) |
| `src/app.js`, `src/server.js` | The Express app and its bootstrap, split so tests drive the real app |

Nothing writes to the ledger except the two USSD flows.

## Run

```bash
npm install
cp .env.example .env
npm run db:init
npm run db:seed
npm run dev
```

Seed syntax:

```bash
npm run db:seed -- +2348000000000 LND-234-XY 5000
```

`db:init` is idempotent — safe to run on every deploy.

The dashboard's dev server also defaults to port 3000, so run it on 3001
(`npm run dev -- -p 3001`) and point `NEXT_PUBLIC_API_URL` at this backend.

## Test

```bash
npm test                   # everything
npm run test:integration   # just the driver -> agent -> dashboard loop
```

`npm test` covers two layers:

- **Pure logic, no database** — input normalisation, the callback guards, the
  park-local clock and the dashboard's query parsing
  (`test/validation.test.mjs`, `test/agent-flow.test.mjs`,
  `test/dashboard-api.test.mjs`).
- **The whole loop over real HTTP against a real PostgreSQL**
  (`test/loop.integration.test.mjs`): the driver dials and pays, the agent dials
  the same plate and is told `PAID ✅`, an unpaid bus is logged once and clears
  after the driver pays on the spot, and `/transactions`,
  `/transactions/summary` and `/vehicles/:plate/status` report what just
  happened. It also covers the second-payment refusal, a plate that belongs to
  somebody else, an empty wallet, the unregistered-plate rule and the opt-in
  guards.

The loop test needs `DATABASE_URL` pointing at a reachable database, and runs
`db:init` itself. It only ever creates rows it has prefixed (plates `TST-…`,
phones `+23499…`) and deletes them again afterwards, so it is safe against the
demo database. With no database reachable the tests skip rather than fail, and
`SKIP_DB_TESTS=1` forces the skip.

## USSD menu tree (driver)

The levy is a **fixed ₦500**, set by the system rather than typed by the driver,
so a levy can never be underpaid. The amount is not part of the menu.

| Input | Response |
|---|---|
| `""` | `CON Welcome to AgberoRecon` / `1. Pay today's levy` / `2. Check my balance` |
| `1` | `CON Enter your vehicle plate number:` |
| `1*<plate>` | `CON Plate: …` / `Levy: N500` / `Balance: …` / `1. Confirm payment` / `2. Cancel` |
| `1*<plate>*1` | `END Levy paid. Balance: N…. Ref: #…` |
| `1*<plate>*2` | `END Payment cancelled.` |
| `2` | `CON Enter your vehicle plate number:` |
| `2*<plate>` | `END Plate: …` / `Balance: …` |

## USSD menu tree (agent)

The agent's shortcode is a separate dial-in, so it is a separate callback URL:
point the agent USSD code at `/ussd/agent`. The agent never types an amount and
never handles cash — the answer is about the vehicle in front of them.

| Input | Response |
|---|---|
| `""` | `CON AgberoRecon - Agent` / `1. Check vehicle status` |
| `1` | `CON Enter vehicle plate number:` |
| `1*<plate>` (paid) | `END Plate: LND-234-XY` / `PAID ✅ - 7:42am` |
| `1*<plate>` (unpaid) | `END Plate: LND-234-XY` / `UNPAID ❌` / `Tell the driver to pay today's levy.` |
| `1*<plate>` (unknown plate) | `END Plate: …` / `UNPAID ❌` / `Plate not registered - see an administrator.` |

If the sandbox only gives you one shortcode, set `AGENT_SERVICE_CODE` to the
agent code (e.g. `*384*99#`) and the one `/ussd` URL serves both menus: Africa's
Talking sends `serviceCode` on every callback, so the request is routed on it.

## Business rules the flows enforce

- **One wallet per driver.** A wallet is keyed by the driver's phone number and
  is registered to a single plate. Wallets are pre-funded for the demo, so an
  unknown number is told to contact an administrator rather than being given an
  empty wallet.
- **The plate must match the one registered to the dialling phone.** A mistyped
  plate gets a clear message naming the registered plate, and writes nothing.
- **One levy per plate per day.** A second payment on the same day is refused
  with `Levy already paid today`. "Today" means the calendar day in
  `Africa/Lagos`, not UTC. This is enforced both in the flow and by a unique
  index on `transactions`, so a race between two simultaneous dials cannot
  double-charge.
- **Plates are matched ignoring separators.** `LND-234-XY`, `LND234XY` and
  `LND 234 XY` all resolve to the same vehicle, because the hyphen is awkward to
  type on a feature-phone keypad. Ledger rows always store the registered form
  (`LND-234-XY`).
- **Phone numbers are normalised**, so `+2348000000000`, `+234 800 000 0000` and
  `002348000000000` all address the same driver.
- **The agent's check only reads**, with one exception: the first `UNPAID`
  detection of the day for a registered vehicle is written to the ledger as an
  `UNPAID` row. That row is the dashboard's "Disputes / Unpaid" count. A plate
  that has paid already has its own `PAID` row, so a successful check writes
  nothing at all.
- **A second check of the same unpaid bus writes nothing either.** A vehicle
  contributes at most one `PAID` and one `UNPAID` row per day, so the ledger
  records state changes rather than agents pressing keys.
- **An UNPAID row carries the levy still owed** (₦500), not money collected: the
  schema requires a positive amount, and every collected total filters on
  `status = 'PAID'`, so an outstanding levy can never be counted as income.
- **An unregistered plate is answered but not logged.** On a feature-phone
  keypad a mistyped plate is far more likely than a ghost bus, and a typo should
  not show up on the dashboard as a dispute.

## Dashboard API

Read-only JSON, sent with `Cache-Control: no-store` so a polling dashboard never
reads a stale ledger. Only the two USSD flows above write to the database.

| Endpoint | Returns |
|---|---|
| `GET /health` | `{ "status": "ok" }` |
| `GET /transactions` | The ledger feed, newest first |
| `GET /transactions/summary` | Today's totals for the dashboard cards |
| `GET /vehicles/:plate/status` | The same answer the agent's handset gets |

Filters on the feed:

| Query | Notes |
|---|---|
| `limit` | 1–200, default 50 |
| `status` | `PAID` or `UNPAID` |
| `plate` | separators optional, matched the same way as on the handset |
| `date` | `today` (default, the park's day), `all`, or `YYYY-MM-DD` |

Malformed input is a `400` with an `error` message rather than a silently empty
ledger, so a dashboard bug is visible instead of looking like a quiet day.

```jsonc
// GET /transactions?plate=LND-234-XY
{
  "count": 1,
  "transactions": [
    {
      "id": "12",
      "plateNumber": "LND-234-XY",
      "phone": "+2348000000000",  // the driver on a PAID row, the agent on an UNPAID one
      "amount": 500,
      "status": "PAID",
      "createdAt": "2026-09-28T06:42:11.000Z",
      "localDate": "2026-09-28",  // the park's calendar day
      "localTime": "7:42am"       // the same clock label the handset shows
    }
  ],
  "serverTime": "2026-09-28T06:42:12.000Z"
}
```

```jsonc
// GET /transactions/summary
{
  "summary": {
    "date": "2026-09-28",
    "totalCollected": 4500,  // PAID rows only
    "paidCount": 9,          // buses cleared
    "unpaidCount": 1,        // disputes / unpaid
    "plateCount": 10         // distinct vehicles seen today
  },
  "serverTime": "2026-09-28T06:42:12.000Z"
}
```

The dashboard is deployed on another origin (Vercel) than the API (Railway), so
CORS is handled: an empty `CORS_ALLOWED_ORIGINS` allows any origin, which suits a
read-only public ledger. Set `DASHBOARD_API_KEY` to require `?key=…` or an
`x-api-key` header before the ledger is exposed anywhere real — rows carry the
phone numbers of the drivers and agents using the system.

## Africa's Talking

Set the Africa's Talking USSD callback URLs to:

```text
driver shortcode -> https://YOUR-BACKEND-DOMAIN/ussd
agent shortcode  -> https://YOUR-BACKEND-DOMAIN/ussd/agent
```

Both callbacks take the normal Africa's Talking fields, especially `phoneNumber`,
`text` and `serviceCode`, and answer with `CON ...` or `END ...`. The `text`
field accumulates across keypresses within a session (`1`, then `1*LND-234-XY`),
which is exactly what the menu walk in `ussd.js` and `agent.js` parses.

### Securing the callbacks

Africa's Talking does not sign USSD callbacks, so by default anyone who learns
the URL can POST arbitrary phone numbers and text. Every check below is
**opt-in** — with none set the endpoints stay open, which is fine locally but not
for a public deployment. Set them before you deploy:

| Variable | Purpose |
|---|---|
| `USSD_ALLOWED_IPS` | Comma-separated IPs or IPv4 CIDR blocks allowed to call the USSD endpoints. Use Africa's Talking's published ranges. |
| `USSD_SHARED_SECRET` | Requires `?secret=…` on the callback URL or an `x-ussd-secret` header. |
| `AGENT_USSD_SHARED_SECRET` | The same for the agent callback. Falls back to `USSD_SHARED_SECRET`, which is right when both shortcodes live in one Africa's Talking app. |
| `AGENT_SERVICE_CODE` | The agent shortcode's `serviceCode`. Set it to serve both menus from the single `/ussd` URL. |
| `TRUST_PROXY` | Must be `true` when `USSD_ALLOWED_IPS` is set behind a proxy or load balancer, otherwise every request appears to come from the proxy and is rejected. The server logs a warning if this combination looks wrong. |
| `DASHBOARD_API_KEY` | Optional key for the dashboard endpoints (`?key=…` or `x-api-key`). |
| `CORS_ALLOWED_ORIGINS` | Optional allowlist of browser origins for the dashboard API. Empty allows any origin. |

Rejected callbacks get `403`, or `401` for a bad secret, and are logged.

## Database

Three tables, as agreed on day one: `wallets`, `transactions`, `sessions`.

Two partial unique indexes carry the rules that must not be breakable by a race.
Both are keyed on the park's calendar day (`Africa/Lagos`, never UTC), so they
agree with the flows about what "today" means:

- `idx_transactions_one_paid_per_plate_per_day` — one levy per plate per day, so
  two simultaneous dials cannot double-charge a driver.
- `idx_transactions_one_unpaid_per_plate_per_day` — one UNPAID row per plate per
  day, so an agent re-checking a bus is idempotent rather than noisy.

`db:init` creates both and warns (instead of refusing to boot) if pre-existing
duplicate rows prevent one of them, so a demo deploy always comes up.

## Deploy

Backend and database go to Railway or Render, the dashboard to Vercel.

1. Create the service from this repo with root directory `backend`. Start command
   is `npm start`; `npm install` is the build step.
2. Add the PostgreSQL plugin. It injects `DATABASE_URL`, which is the only
   variable the app cannot boot without.
3. The schema is created on boot (`initDb()` runs before the server takes
   traffic), so no release command is strictly needed. Pre-fund the demo wallets
   once from a shell on the service:

   ```bash
   npm run db:seed -- +2348000000000 LND-234-XY 5000
   ```

4. Set `TRUST_PROXY=true` (Railway and Render both sit behind a proxy) and
   `USSD_SHARED_SECRET`, then fill in `USSD_ALLOWED_IPS` with Africa's Talking's
   published ranges. Add `CORS_ALLOWED_ORIGINS=https://your-dashboard.vercel.app`
   once the dashboard URL exists.
5. Point the Africa's Talking USSD callbacks at the deployed URLs
   (`/ussd` and `/ussd/agent`) and run through the demo dial sequence once on the
   sandbox before recording.
