# AgberoRecon

**An offline USSD settlement & reconciliation system for informal transport levies in Lagos.**

Built for the StacStart Borderless Bytes Hackathon 2026 — Civic Tech & Public Good / FinTech & Commerce track.

---

## 1. The Problem

Lagos has an estimated 75,000+ commercial minibuses ("Danfos") that pay daily cash levies to transport union agents ("Agberos") at motor parks and bus stops. This system:

- Moves an estimated ₦45 billion a year in **untracked cash**, with zero digital record.
- Has no standard receipt or verification — payment is proven only by a physical ticket or the agent's word.
- Directly inflates commuter fares, since drivers pass on levy costs (and any dispute/delay costs) to passengers.
- Has resisted past digitization attempts (e.g. Gona) because those tried to **replace** the union's role in fare collection entirely — union resistance killed adoption.

**The insight:** don't try to remove the union from the loop. Give the *existing* driver–agent interaction a digital settlement and verification layer that works exactly like the cash version does today — instant, at the roadside, no smartphone or internet required — but leaves a permanent, auditable record behind it.

## 2. What We're Building

A **USSD-based settlement app** with two user roles and one shared ledger:

1. **Driver flow** — driver dials a USSD code, funds/pays their daily levy from a wallet balance, gets confirmation.
2. **Agent flow** — union agent dials a USSD code, enters a vehicle plate number, instantly sees whether that vehicle has paid today (`PAID` / `UNPAID`).
3. **Ledger dashboard** — a simple web page (for hackathon judges, and in a real deployment for union/LGA admins) showing every transaction as it happens: plate number, amount, timestamp, status.

No internet or smartphone is required for the driver or agent — it all runs over USSD, which works on basic feature phones over the regular cellular network. The dashboard is the only web-based piece, and it's for oversight, not for the core transaction.

## 3. How It Works, End to End

```
[Driver's phone]                [Agent's phone]
      |                               |
      | dials *384*XXX#               | dials *384*XXX#
      v                               v
  USSD Gateway (Africa's Talking) <-- shared telecom entry point
      |                               |
      v                               v
   Backend API  <---------------------+
      |
      | reads/writes
      v
   Database (transactions table + short-lived session table)
      |
      v
  Dashboard (polls DB every few seconds, renders ledger)
```

**Step by step:**

1. Driver dials the shortcode → USSD menu: "1. Pay today's levy". Enters plate number + amount → confirms.
2. Africa's Talking sends this as an HTTP POST to our backend. Backend looks up (or creates) a session for that phone number, walks the menu state, and on confirmation writes a new row to the `transactions` table: `plate, amount, phone, status=PAID, timestamp`.
3. Agent dials the shortcode → USSD menu: "1. Check vehicle status". Enters plate number.
4. Backend queries `transactions` for the most recent row matching that plate **today**, and returns `PAID ✅` or `UNPAID ❌` as the USSD response text — shown instantly on the agent's screen.
5. Dashboard polls the backend every few seconds and re-renders the transaction table, so anyone watching sees the ledger update live as payments happen.

That's the entire MVP loop. Everything else (SMS receipts, analytics, multi-city support) is a stretch goal, not part of what we need working for submission.

## 4. Stakeholder Walkthrough

### Driver
1. Has a wallet tied to their phone number and plate number (real world: topped up via mobile money; demo: pre-funded in the DB).
2. Dials the USSD shortcode → sees:
   ```
   Welcome to AgberoRecon
   1. Pay today's levy
   2. Check my balance
   ```
3. Selects "1", enters plate number, confirms amount.
4. Wallet is debited, a `PAID` transaction is written, and they get a one-line confirmation: `"Levy paid. Balance: ₦X,XXX. Ref: #1234"`.
5. Total interaction: ~15 seconds, same as handing over cash — except now there's a digital record.

### Union Agent ("Agbero")
1. Stands at the park/bus stop as usual, stopping buses.
2. Instead of collecting cash and issuing a paper ticket, dials their own USSD shortcode:
   ```
   AgberoRecon - Agent
   1. Check vehicle status
   ```
3. Enters the plate number of the bus in front of them.
4. Gets an instant result:
   - `PAID ✅ - 7:42am` → waves the bus through, no dispute, no cash handled.
   - `UNPAID ❌` → tells the driver to pay now (driver runs the flow above on the spot), then re-checks.
5. Every check and payment is timestamped and logged, creating a real record of who paid, when, and where.

### Union / LGA Admin (dashboard viewer)
1. Never touches USSD — just opens a browser and watches the live table: plate | amount | timestamp | status, updating every few seconds.
2. Sees, for the first time, real numbers: how many buses paid today, total collected, which stops are active.
3. In a real deployment, this is also where daily **batch settlement** happens — the system totals up everything collected for a park and pays it out in bulk to the union's account via a payment aggregator. Not built for the hackathon demo, just described.

### Passenger / Commuter (indirect)
Doesn't touch the app, but is the reason it matters for the pitch: with levies tracked and disputes reduced (no more roadside arguments over whether a driver paid), the fare inflation drivers use to cover levy uncertainty and delay has less justification. One line in the pitch, not a feature to build.

### Full Sequence
```
Driver dials USSD → pays levy → wallet debited, transaction logged as PAID
                                        |
                                        v
Agent dials USSD → checks plate → sees PAID/UNPAID → waves bus through or collects
                                        |
                                        v
Dashboard (Union/LGA admin) → watches ledger update live → sees daily totals
                                        |
                                        v
(Real deployment only) → daily batch payout to union's bank account
```

For the demo video, only the first two rows need to be shown live (driver pays → dashboard updates → agent checks). The admin/settlement layer can be one sentence over a screenshot rather than something fully built.

## 5. Payments & Settlement Model

**For the hackathon build, no real money moves.**

- Each driver has a **wallet balance** — a number in a `wallets` table.
- Wallets are **pre-funded manually** for the demo (e.g. seed ₦5,000 against a test plate), simulating "the driver topped up earlier."
- "Paying the levy" via USSD debits that number and writes a `PAID` row. No actual currency moves.
- State this scoping decision plainly in the pitch: *"wallet funding would use a mobile money API in production; for this demo, wallets are pre-funded to isolate and prove the settlement logic."* Judges respect an explicit scope cut far more than a shaky fake payment integration.

**How it would work in a real deployment** (worth being able to explain, not build):

1. **Funding** — driver tops up their wallet via mobile money (MTN MoMo, Airtel Money) or USSD-linked bank debit, through a payment aggregator (Paystack, Flutterwave, or Africa's Talking Payments all support this across Nigeria/Kenya/Uganda/Ghana).
2. **Paying the levy** is an internal ledger debit only — no money moves at that instant, same as spending airtime credit.
3. **Settlement to the union happens in batches**, not per-transaction — once a day, the system sums all levies collected for a park/union and does one bulk payout via the aggregator's disbursement API. This mirrors how real agent networks settle; nobody wires ₦200 individually 75,000 times a day.
4. The union never needs their own smartphone or banking integration for the day-to-day interaction — they see "PAID" on a feature phone, and money arrives later, in bulk.

## 6. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| USSD Gateway | **Africa's Talking (sandbox)** | Free sandbox, no telco approval needed, has a browser-based USSD simulator for both development and the demo video — no real phones required. |
| Backend | **Node.js + Express** | Keeps the whole stack in one language across all three of us, since two of us are comfortable in JS. |
| Session state | **A single `sessions` table in the database** (not Redis) | USSD is stateless — every keypress is a new request — so we need to remember "where" a phone number is in the menu. A DB table with a `last_updated` timestamp does this fine at hackathon scale. Skipping Redis removes a moving part we don't need to debug under time pressure. |
| Database | **PostgreSQL** (or SQLite if we want zero setup) | Three tables: `transactions`, `sessions`, `wallets`. Nothing more. |
| Dashboard | **Next.js + Tailwind**, polling the API every 3–5 seconds | Simple, fast to build, no WebSocket complexity. Judges see it update live either way. |
| Hosting | **Railway or Render** (backend + DB), **Vercel** (dashboard) | Both have same-day free deploys, no infra setup needed. |

## 7. Team & Task Split

Backend work is split evenly between Samuel and Ayodeji rather than loading it onto one person — Ridwan owns frontend end to end.

| Person | Role | Owns |
|---|---|---|
| **Samuel** | Backend | Africa's Talking integration + USSD menu/session logic (driver-pay flow), `transactions`/`wallets` tables, deployment of backend + DB |
| **Ayodeji** | Backend | Agent-check flow (plate lookup, PAID/UNPAID logic), API endpoints for the dashboard to consume, integration testing of the full driver→agent→dashboard loop |
| **Ridwan** | Frontend | Dashboard UI (Next.js), polling/data-fetching from the API, README polish, video pitch editing |

**Suggested day-by-day (4-day build window):**

- **Day 1**
  - Everyone: confirm track submission (Civic Tech & Public Good or FinTech & Commerce), set up shared GitHub repo, agree on the exact USSD menu tree (every prompt, input, response) so backend and frontend agree on data shape early.
  - Samuel: create Africa's Talking sandbox account, get a "Hello World" USSD menu responding to the simulator.
  - Ayodeji: scaffold the API endpoints the dashboard will need (e.g. `GET /transactions`) against mock data.
  - Ridwan: scaffold the Next.js dashboard against that mock data so it's ready to plug in.

- **Day 2**
  - Samuel: wire the real driver-pay flow — session table, wallet debit, transaction write, confirmation message.
  - Ayodeji: wire the agent-check flow — plate lookup, PAID/UNPAID response, and connect the dashboard-facing API endpoints to the real `transactions` table.
  - Ridwan: connect dashboard to the real API, confirm it updates when a test transaction is written.

- **Day 3**
  - All: integration pass — run the full loop end to end (driver pays → agent checks → dashboard shows it) multiple times, fix breakage.
  - Samuel + Ayodeji: deploy backend + DB to production.
  - Ridwan: deploy dashboard, do a final visual pass.
  - Do NOT add new features today — only stabilize the one path we're going to demo.

- **Day 4**
  - Record the video pitch (script below).
  - Write/finalize this README and the GitHub repo.
  - Submit early — don't wait for the 11:59 PM deadline.

## 8. Demo Script (for the video pitch)

Since the summit is virtual, the demo is a recorded video, not a live stage — that removes network/venue risk, but the recording still needs to be clean.

1. **(15 sec) The problem** — state it with the one number that matters: ~₦45bn/year in untracked cash levies, and why an "just replace the union" approach already failed (Gona).
2. **(45 sec) The demo** — split screen: Africa's Talking USSD simulator on one side, dashboard on the other.
   - Dial as driver → pay levy for plate `LND-234-XY` → confirmation.
   - Dashboard updates live with the new row.
   - Dial as agent → check `LND-234-XY` → see `PAID ✅` instantly.
3. **(20 sec) Why it's different** — this doesn't try to remove the union or force a smartphone; it digitizes the exact interaction that already happens, on the phones people already have.
4. **(10 sec) Close** — what this unlocks (fiscal transparency, less arbitrary fare inflation) and how the same protocol generalizes to other informal levy/toll systems across African cities.

## 9. Judging Criteria Alignment

- **Technical execution (35%)** — real USSD session-state handling over a stateless protocol, a working deployed backend + dashboard, no unnecessary tech bolted on for show.
- **Problem fit (25%)** — a documented, quantifiable, painful local problem with a specific documented prior failure (Gona) to explain why the obvious approach doesn't work.
- **Demo/communication (20%)** — a tight, visual, before/after demo that needs almost no explanation.
- **Originality & innovation (20%)** — targets the driver–union settlement layer rather than the (already-tried, already-failed) commuter payment layer.

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| USSD session drops/times out during the recorded demo | Keep every menu to 2 steps max; record multiple takes; keep a pre-recorded backup clip of a successful run. |
| Africa's Talking sandbox has rate limits or downtime | Test early (Day 1), not Day 4. Have a local mock of the USSD callback ready as a fallback for dashboard testing. |
| Scope creep (SMS receipts, analytics, multi-city) | Explicitly listed as "do not build" below — resist adding these until the core loop is rock solid and deployed. |
| Team members blocked on different pieces at different times | Backend is split by flow (driver-pay vs. agent-check) so Samuel and Ayodeji can work in parallel without blocking each other; either can help Ridwan on frontend if the dashboard stalls. |

## 11. What We're NOT Building (this round)

- SMS receipt confirmations
- Multi-city/multi-union support
- Union/LGA analytics or reporting views beyond the raw ledger
- Any real payment processor integration (mobile money, etc.) — wallet balances are simulated/pre-funded for the demo
- Redis or any additional infra beyond the database we're already using

## 12. Submission Checklist (per StacStart rules)

- [ ] Working prototype — live, deployed URL
- [ ] Public GitHub repository (this repo)
- [ ] Video pitch (demo script above)
- [ ] Project details: title, target audience, tech stack — in submission portal
- [ ] Submitted before Sept 28, 11:59 PM WAT — aim to submit early, not at the deadline
