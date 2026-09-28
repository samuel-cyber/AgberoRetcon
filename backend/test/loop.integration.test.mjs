// The full loop, end to end: the driver dials and pays, the agent dials and sees
// PAID, and the dashboard shows the row. This is the path the demo video walks,
// so it runs over real HTTP against a real PostgreSQL — no mocks, because the
// wiring and the queries are what break on demo day.
//
// Every fixture is prefixed (plates "TST-…", phones "+23499…") and deleted again
// afterwards, so the test is safe to run against the database the demo uses.
//
// Skipped automatically when no database is reachable, or with SKIP_DB_TESTS=1.
import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { initDb, pool } from '../src/db.js';

const skip = await probeDatabase();

async function probeDatabase() {
  if (process.env.SKIP_DB_TESTS === '1') return 'SKIP_DB_TESTS=1';
  if (!process.env.DATABASE_URL) return 'DATABASE_URL is not set';

  try {
    await initDb(); // also proves db:init is safe to run a second time
    return false;
  } catch (error) {
    return `PostgreSQL is unreachable: ${error.message}`;
  }
}

// Fixtures, tagged per run so two runs (or the seed script) cannot collide.
const tag = Math.random().toString(36).slice(2, 5).toUpperCase();
const createdPhones = new Set();
const createdPlates = new Set();
let phoneSeq = 0;
let plateSeq = 0;

function nextPhone() {
  const phone = `+23499${String(Date.now()).slice(-7)}${String(phoneSeq++).padStart(2, '0')}`;
  createdPhones.add(phone);
  return phone;
}

function nextPlate() {
  const plate = `TST-${++plateSeq}-${tag}`;
  createdPlates.add(plate);
  return plate;
}

async function seedWallet({ phone, plate, balance = 5000 }) {
  await pool.query(
    `INSERT INTO wallets (phone, plate_number, balance)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone) DO UPDATE SET
       plate_number = EXCLUDED.plate_number,
       balance = EXCLUDED.balance,
       updated_at = NOW()`,
    [phone, plate, balance],
  );
}

async function ledgerRows(plate) {
  const result = await pool.query(
    `SELECT id, phone, amount, status, created_at
     FROM transactions
     WHERE plate_number = $1
     ORDER BY created_at, id`,
    [plate],
  );

  return result.rows;
}

async function balanceOf(phone) {
  const result = await pool.query('SELECT balance FROM wallets WHERE phone = $1', [phone]);
  return result.rows[0]?.balance;
}

// One app instance for the whole file, on an ephemeral port, so the tests drive
// exactly what the deploy serves.
let server = null;
let baseUrl = '';

before(() => {
  if (skip) return;

  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));

  if (!skip) {
    // Remove exactly what this run created. Nothing else is touched.
    const phones = [...createdPhones];
    const plates = [...createdPlates];

    await pool.query(
      'DELETE FROM transactions WHERE phone = ANY($1::text[]) OR plate_number = ANY($2::text[])',
      [phones, plates],
    );
    await pool.query('DELETE FROM sessions WHERE phone = ANY($1::text[])', [phones]);
    await pool.query('DELETE FROM wallets WHERE phone = ANY($1::text[])', [phones]);
  }

  await pool.end();
});

/** Exactly what Africa's Talking posts: form-encoded phoneNumber and text. */
async function dial(path, phone, text) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ phoneNumber: phone, text, serviceCode: '*384#' }),
  });

  assert.equal(response.status, 200);
  return response.text();
}

const driver = (phone, text) => dial('/ussd', phone, text);
const agent = (phone, text) => dial('/ussd/agent', phone, text);

/** A dial that lives through a whole drop: menu -> plate -> confirm -> paid. */
async function payLevy(phone, plate) {
  await driver(phone, '');
  await driver(phone, '1');
  await driver(phone, `1*${plate}`);
  return driver(phone, `1*${plate}*1`);
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.status, 200, `GET ${path} responded ${response.status}`);
  return response.json();
}

/** Runs a request against a second app instance configured with its own env. */
async function withApp(env, run) {
  const instance = createApp({ env }).listen(0);

  try {
    return await run(`http://127.0.0.1:${instance.address().port}`);
  } finally {
    await new Promise((resolve) => instance.close(resolve));
  }
}

test('driver pays, the agent sees PAID, and the dashboard shows the row', { skip }, async () => {
  const phone = nextPhone();
  const plate = nextPlate();
  const agentPhone = nextPhone();

  await seedWallet({ phone, plate, balance: 5000 });

  assert.equal(
    await driver(phone, ''),
    "CON Welcome to AgberoRecon\n1. Pay today's levy\n2. Check my balance",
  );
  assert.equal(await driver(phone, '1'), 'CON Enter your vehicle plate number:');

  const confirmation = await driver(phone, `1*${plate}`);
  assert.match(confirmation, new RegExp(`^CON Plate: ${plate}\\n`));
  assert.match(confirmation, /Levy: N500\nBalance: N5000\n1\. Confirm payment\n2\. Cancel$/);

  assert.match(await driver(phone, `1*${plate}*1`), /^END Levy paid\. Balance: N4500\. Ref: #\d+$/);

  // The wallet is debited once, and the ledger holds one PAID row.
  assert.equal(await balanceOf(phone), 4500);

  const rows = await ledgerRows(plate);
  const [payment] = rows;
  assert.equal(rows.length, 1);
  assert.equal(payment.status, 'PAID');
  assert.equal(payment.amount, 500);
  assert.equal(payment.phone, phone);

  // The agent, at the same park, dials the agent shortcode and types the plate
  // the way a feature-phone keypad makes you type it: no hyphens.
  assert.equal(await agent(agentPhone, ''), 'CON AgberoRecon - Agent\n1. Check vehicle status');
  assert.equal(await agent(agentPhone, '1'), 'CON Enter vehicle plate number:');
  assert.match(
    await agent(agentPhone, `1*${plate.replace(/-/g, '')}`),
    new RegExp(`^END Plate: ${plate}\\nPAID ✅ - \\d{1,2}:\\d{2}(am|pm)$`),
  );

  // A successful check writes nothing: the driver's PAID row is the record.
  assert.equal((await ledgerRows(plate)).length, 1);

  // The dashboard sees all of it: the feed, the totals, the same check again.
  const feed = await getJson(`/transactions?plate=${plate}`);
  assert.equal(feed.count, 1);

  const [row] = feed.transactions;
  assert.equal(row.id, String(payment.id));
  assert.equal(row.plateNumber, plate);
  assert.equal(row.phone, phone);
  assert.equal(row.amount, 500);
  assert.equal(row.status, 'PAID');
  assert.equal(row.createdAt, payment.created_at.toISOString());
  assert.match(row.localTime, /^\d{1,2}:\d{2}(am|pm)$/);

  const summary = await getJson('/transactions/summary');
  assert.equal(row.localDate, summary.summary.date);
  assert.ok(summary.summary.totalCollected >= 500);
  assert.ok(summary.summary.paidCount >= 1);

  const vehicle = await getJson(`/vehicles/${plate}/status`);
  assert.equal(vehicle.plateNumber, plate);
  assert.equal(vehicle.status, 'PAID');
  assert.equal(vehicle.registered, true);
  assert.equal(vehicle.amount, 500);
  assert.equal(vehicle.paidAt, payment.created_at.toISOString());

  // History filters: lower case and hyphen-free both reach the same vehicle.
  const history = await getJson(`/transactions?status=paid&date=all&plate=${plate.toLowerCase()}`);
  assert.equal(history.count, 1);

  // A day with nothing on it is an empty ledger, not an error.
  const otherDay = await getJson(`/transactions?date=2020-01-01&plate=${plate}`);
  assert.equal(otherDay.count, 0);
  assert.deepEqual(otherDay.transactions, []);
});

test('a double-tap and two agents at once cannot double-charge or double-log', { skip }, async () => {
  const phone = nextPhone();
  const plate = nextPlate();
  await seedWallet({ phone, plate, balance: 5000 });

  // One handset on the confirmation screen (what a re-sent keypress looks like).
  await driver(phone, '');
  await driver(phone, '1');
  await driver(phone, `1*${plate}`);

  const answers = await Promise.all([
    driver(phone, `1*${plate}*1`),
    driver(phone, `1*${plate}*1`),
  ]);

  // Exactly one of the two dials collects the levy; the ledger and the wallet
  // must agree with that, whichever order the database resolves them in.
  assert.equal(answers.filter((answer) => /^END Levy paid\./.test(answer)).length, 1);
  assert.equal(await balanceOf(phone), 4500);
  assert.equal((await ledgerRows(plate)).length, 1);

  // Two agents checking the same unpaid bus at the same moment.
  const unpaidPlate = nextPlate();
  const unpaidPhone = nextPhone();
  await seedWallet({ phone: unpaidPhone, plate: unpaidPlate, balance: 2000 });

  const [firstAgent, secondAgent] = [nextPhone(), nextPhone()];
  await agent(firstAgent, '');
  await agent(firstAgent, '1');
  await agent(secondAgent, '');
  await agent(secondAgent, '1');

  const checks = await Promise.all([
    agent(firstAgent, `1*${unpaidPlate}`),
    agent(secondAgent, `1*${unpaidPlate}`),
  ]);

  assert.ok(checks.every((answer) => /UNPAID ❌/.test(answer)));
  // One dispute row for the vehicle, not one per agent.
  assert.equal((await ledgerRows(unpaidPlate)).length, 1);
});

test('a second levy for the same plate is refused and writes nothing', { skip }, async () => {
  const phone = nextPhone();
  const plate = nextPlate();
  const agentPhone = nextPhone();

  await seedWallet({ phone, plate, balance: 5000 });
  await payLevy(phone, plate);

  // Dialling again the same day stops at the plate prompt.
  await driver(phone, '');
  await driver(phone, '1');
  assert.equal(await driver(phone, `1*${plate}`), `END Levy already paid today for ${plate}.`);

  assert.equal(await balanceOf(phone), 4500);
  assert.equal((await ledgerRows(plate)).length, 1);

  // And the agent is told the same thing.
  await agent(agentPhone, '');
  await agent(agentPhone, '1');
  assert.match(await agent(agentPhone, `1*${plate}`), /PAID ✅/);
  assert.equal((await ledgerRows(plate)).length, 1);
});

test('an agent check logs one UNPAID row, and the bus clears once it pays', { skip }, async () => {
  const phone = nextPhone();
  const plate = nextPlate();
  const agentPhone = nextPhone();

  await seedWallet({ phone, plate, balance: 2000 });

  await agent(agentPhone, '');
  await agent(agentPhone, '1');
  assert.match(
    await agent(agentPhone, `1*${plate}`),
    new RegExp(`^END Plate: ${plate}\\nUNPAID ❌\\n`),
  );

  const [detection] = await ledgerRows(plate);
  assert.equal((await ledgerRows(plate)).length, 1);
  assert.equal(detection.status, 'UNPAID');
  // The row carries the levy still owed, and the agent who found it.
  assert.equal(detection.amount, 500);
  assert.equal(detection.phone, agentPhone);

  // Re-checking the same unpaid bus does not add a second dispute row.
  await agent(agentPhone, '');
  await agent(agentPhone, '1');
  assert.match(await agent(agentPhone, `1*${plate}`), /UNPAID ❌/);
  assert.equal((await ledgerRows(plate)).length, 1);

  // The driver pays on the spot, the agent's next check waves the bus through,
  // and the UNPAID detection stays in the ledger as history.
  assert.match(await payLevy(phone, plate), /^END Levy paid\./);
  await agent(agentPhone, '');
  await agent(agentPhone, '1');
  assert.match(await agent(agentPhone, `1*${plate}`), /PAID ✅/);

  const rows = await ledgerRows(plate);
  assert.deepEqual(
    rows.map((row) => row.status),
    ['UNPAID', 'PAID'],
  );
});


test('an unregistered plate answers UNPAID but stays out of the ledger', { skip }, async () => {
  const agentPhone = nextPhone();
  const plate = nextPlate(); // never seeded: no wallet claims this vehicle

  await agent(agentPhone, '');
  await agent(agentPhone, '1');

  assert.match(
    await agent(agentPhone, `1*${plate}`),
    new RegExp(`^END Plate: ${plate}\\nUNPAID ❌\\nPlate not registered`),
  );
  assert.equal((await ledgerRows(plate)).length, 0);

  const vehicle = await getJson(`/vehicles/${plate}/status`);
  assert.equal(vehicle.status, 'UNPAID');
  assert.equal(vehicle.registered, false);
  assert.equal(vehicle.paidAt, null);
});

test('the agent menu refuses junk plates and unknown options', { skip }, async () => {
  const agentPhone = nextPhone();

  await agent(agentPhone, '');
  assert.equal(await agent(agentPhone, '9'), 'END Invalid input. Please dial again.');

  await agent(agentPhone, '');
  await agent(agentPhone, '1');
  assert.equal(
    await agent(agentPhone, '1*@@'),
    'CON Invalid plate. Use letters, numbers and hyphens only.\nEnter vehicle plate number:',
  );

  // Input for a session that no longer exists (the handset re-sent text after a
  // dropped call) restarts at the menu instead of guessing.
  const stalePhone = nextPhone();
  assert.equal(
    await agent(stalePhone, '1*TST-9-ZZ'),
    'CON Session restarted.\nAgberoRecon - Agent\n1. Check vehicle status',
  );
});

test('the driver flow keeps its rules on an unknown number and a wrong plate', { skip }, async () => {
  const unknownPhone = nextPhone();

  await driver(unknownPhone, '');
  await driver(unknownPhone, '1');
  assert.equal(
    await driver(unknownPhone, '1*TST-1-ZZ'),
    'END No wallet registered for this number. Please contact an administrator.',
  );

  const phone = nextPhone();
  const plate = nextPlate();
  const otherPlate = nextPlate();
  await seedWallet({ phone, plate, balance: 5000 });

  // A driver cannot pay for a vehicle registered to somebody else.
  await driver(phone, '');
  await driver(phone, '1');
  assert.equal(
    await driver(phone, `1*${otherPlate}`),
    `END Plate ${otherPlate} is not registered to this number.\nRegistered plate: ${plate}`,
  );
  assert.equal((await ledgerRows(otherPlate)).length, 0);
  assert.equal(await balanceOf(phone), 5000);
});

test('a wallet that cannot cover the levy is refused and writes nothing', { skip }, async () => {
  const phone = nextPhone();
  const plate = nextPlate();

  await seedWallet({ phone, plate, balance: 300 });

  await driver(phone, '');
  await driver(phone, '1');
  assert.match(await driver(phone, `1*${plate}`), /Balance: N300/);

  assert.equal(await driver(phone, `1*${plate}*1`), 'END Insufficient balance. Balance: N300.');
  assert.equal(await balanceOf(phone), 300);
  assert.equal((await ledgerRows(plate)).length, 0);
});

test('the opt-in guards reject callers once they are configured', { skip }, async () => {
  const phone = nextPhone();

  await withApp({ USSD_SHARED_SECRET: 's3cret', DASHBOARD_API_KEY: 'k3y' }, async (url) => {
    const callback = (path) =>
      fetch(`${url}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ phoneNumber: phone, text: '' }),
      });

    const rejected = await callback('/ussd');
    assert.equal(rejected.status, 401);
    // Still a USSD response the handset can render.
    assert.equal(await rejected.text(), 'END Service unavailable for this caller.');

    // The agent shortcode shares the driver secret unless it has its own.
    assert.equal((await callback('/ussd/agent')).status, 401);

    const accepted = await callback('/ussd?secret=s3cret');
    assert.equal(accepted.status, 200);
    assert.match(await accepted.text(), /^CON Welcome to AgberoRecon/);
    assert.equal((await callback('/ussd/agent?secret=s3cret')).status, 200);

    assert.equal((await fetch(`${url}/transactions`)).status, 401);
    assert.equal((await fetch(`${url}/transactions?key=wrong`)).status, 401);
    assert.equal(
      (await fetch(`${url}/transactions/summary`, { headers: { 'x-api-key': 'k3y' } })).status,
      200,
    );
    assert.equal((await fetch(`${url}/vehicles/${nextPlate()}/status?key=k3y`)).status, 200);
  });
});

test('one callback URL can serve both shortcodes, health, 404 and CORS behave', { skip }, async () => {
  const phone = nextPhone();

  await withApp({ AGENT_SERVICE_CODE: '*384*99#' }, async (url) => {
    const post = (serviceCode) =>
      fetch(`${url}/ussd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ phoneNumber: phone, text: '', serviceCode }),
      });

    assert.equal(
      await (await post('*384*99#')).text(),
      'CON AgberoRecon - Agent\n1. Check vehicle status',
    );
    assert.match(await (await post('*384#')).text(), /^CON Welcome to AgberoRecon/);
  });

  await withApp({}, async (url) => {
    assert.deepEqual(await (await fetch(`${url}/health`)).json(), { status: 'ok' });
    assert.equal((await fetch(`${url}/nope`)).status, 404);

    // The dashboard is deployed on another origin, so the browser needs CORS.
    const preflight = await fetch(`${url}/transactions`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://dashboard.example' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  });
});

