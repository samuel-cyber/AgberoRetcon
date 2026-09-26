# AgberoRecon Backend

Samuel's backend scope only:

- Africa's Talking USSD callback
- Driver payment USSD flow
- USSD session state
- Pre-funded driver wallets
- Atomic wallet debit + `PAID` transaction creation
- PostgreSQL schema for `wallets`, `transactions`, and `sessions`

The agent-check flow and dashboard-facing transaction API are intentionally not implemented here because they belong to Ayodeji's task.

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

## Test

```bash
npm test
```

Covers input normalisation and the callback guard. No database or network
needed. The full USSD flow is verified separately against a real PostgreSQL.

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

## Business rules the flow enforces

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

## Africa's Talking

Set the Africa's Talking USSD callback URL to:

```text
https://YOUR-BACKEND-DOMAIN/ussd
```

The callback accepts the normal Africa's Talking fields, especially `phoneNumber` and `text`, and returns `CON ...` or `END ...` responses.

### Securing the callback

Africa's Talking does not sign USSD callbacks, so by default anyone who learns
the URL can POST arbitrary phone numbers and text. Both checks below are
**opt-in** — with neither set the endpoint stays open, which is fine locally but
not for a public deployment. Set both before you deploy:

| Variable | Purpose |
|---|---|
| `USSD_ALLOWED_IPS` | Comma-separated IPs or IPv4 CIDR blocks allowed to call `/ussd`. Use Africa's Talking's published ranges. |
| `USSD_SHARED_SECRET` | Requires `?secret=…` on the callback URL or an `x-ussd-secret` header. |
| `TRUST_PROXY` | Must be `true` when `USSD_ALLOWED_IPS` is set behind a proxy or load balancer, otherwise every request appears to come from the proxy and is rejected. The server logs a warning if this combination looks wrong. |

Rejected callbacks get `403`, or `401` for a bad secret, and are logged.
