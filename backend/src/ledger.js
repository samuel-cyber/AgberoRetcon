// Ledger access: everything the agent's handset and the dashboard read or write
// about a settlement.
//
// The driver flow (ussd.js) writes the PAID rows, the agent flow (agent.js)
// reads them and writes the UNPAID detections, and the dashboard API
// (dashboard.js) only reads. Keeping the queries here means all three agree on
// what "paid today" means and on how a plate is matched.
import { pool, SETTLEMENT_TIME_ZONE } from './db.js';
import { LEVY_AMOUNT } from './levy.js';
import { cleanPlate, plateKey } from './validation.js';
import { toApiTransaction } from './dashboard-shape.js';

// "Today" is the park's calendar day, expressed once in SQL and reused by every
// query below. This mirrors the expression the daily-levy unique index is built
// on, so the database and the flows can never disagree about what today means.
const PARK_TODAY_SQL = `(NOW() AT TIME ZONE '${SETTLEMENT_TIME_ZONE}')::date`;
const parkDateOf = (column) => `(${column} AT TIME ZONE '${SETTLEMENT_TIME_ZONE}')::date`;

// Plates are matched ignoring separators, because the hyphen is awkward to type
// on a feature-phone keypad: "LND234XY" and "LND 234 XY" are the same vehicle
// as the registered "LND-234-XY".
const PLATE_KEY_SQL = `regexp_replace(upper(plate_number), '[^A-Z0-9]', '', 'g')`;

/** The registered form of a plate, or null when no wallet claims that vehicle. */
export async function resolveRegisteredPlate(executor, typedPlate) {
  const result = await executor.query(
    `SELECT plate_number
     FROM wallets
     WHERE ${PLATE_KEY_SQL} = $1
     LIMIT 1`,
    [plateKey(typedPlate)],
  );

  return result.rows[0]?.plate_number ?? null;
}

/**
 * Today's PAID row for a plate, or null.
 *
 * One query answers "has this vehicle paid?" for the driver flow (which refuses
 * a second payment) and for the agent flow (which shows PAID or UNPAID), so the
 * two can never disagree. The plate must already be in its registered form.
 */
export async function findTodaysPayment(executor, plateNumber) {
  const result = await executor.query(
    `SELECT id, amount, created_at
     FROM transactions
     WHERE plate_number = $1
       AND status = 'PAID'
       AND ${parkDateOf('created_at')} = ${PARK_TODAY_SQL}
     ORDER BY created_at DESC
     LIMIT 1`,
    [plateNumber],
  );

  return result.rows[0] ?? null;
}

/**
 * What the agent's handset should say about a plate right now.
 *
 * Accepts the plate exactly as it was typed, so the answer is about the vehicle
 * the agent is standing in front of rather than about their typing.
 */
export async function lookupVehicleStatus(executor, typedPlate) {
  const registeredPlate = await resolveRegisteredPlate(executor, typedPlate);

  if (!registeredPlate) {
    return {
      plateNumber: cleanPlate(typedPlate),
      status: 'UNPAID',
      registered: false,
      paidAt: null,
      amount: null,
    };
  }

  const payment = await findTodaysPayment(executor, registeredPlate);

  return payment
    ? {
        plateNumber: registeredPlate,
        status: 'PAID',
        registered: true,
        paidAt: payment.created_at,
        amount: Number(payment.amount),
      }
    : {
        plateNumber: registeredPlate,
        status: 'UNPAID',
        registered: true,
        paidAt: null,
        amount: null,
      };
}

/**
 * Records an UNPAID detection and reports whether it actually wrote a row.
 *
 * Only the first detection per plate per day is stored: a second check of the
 * same unpaid bus is still answered UNPAID, but it must not add a second row to
 * the dashboard's dispute column. The partial unique index in db.js is what
 * makes a repeated check idempotent instead of noisy, and it is also what makes
 * two agents checking the same vehicle at the same moment safe.
 *
 * `amount` is the levy still owed rather than money collected: the schema
 * requires a positive amount, an outstanding levy reads naturally on the
 * dashboard, and every collected total filters on status = 'PAID' anyway.
 */
export async function recordUnpaidCheck(executor, { phone, plateNumber }) {
  try {
    await executor.query(
      `INSERT INTO transactions (phone, plate_number, amount, status)
       VALUES ($1, $2, $3, 'UNPAID')`,
      [phone, plateNumber, LEVY_AMOUNT],
    );
    return true;
  } catch (error) {
    // 23505 = unique_violation: today's detection for this plate already exists.
    if (error.code === '23505') return false;
    throw error;
  }
}

/**
 * The dashboard's ledger feed, newest first.
 *
 * `date` is either 'today', 'all' or a YYYY-MM-DD settlement day; the row limit
 * stops a polling dashboard from pulling the whole history.
 */
export async function listTransactions({
  limit = 50,
  status = null,
  plateKey: plate = null,
  date = 'today',
} = {}) {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  if (plate) {
    params.push(plate);
    conditions.push(`${PLATE_KEY_SQL} = $${params.length}`);
  }

  if (date && date !== 'all') {
    if (date === 'today') {
      // Resolved in SQL, so it means exactly what the daily-levy rule means.
      conditions.push(`${parkDateOf('created_at')} = ${PARK_TODAY_SQL}`);
    } else {
      params.push(date);
      conditions.push(`${parkDateOf('created_at')} = $${params.length}::date`);
    }
  }

  params.push(limit);

  const result = await pool.query(
    `SELECT id, phone, plate_number, amount, status, created_at
     FROM transactions
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params,
  );

  return result.rows.map(toApiTransaction);
}

/**
 * Today's totals for the dashboard's cards.
 *
 * totalCollected counts money actually collected, which is why it filters on
 * PAID: an UNPAID row is a levy still owed, not income.
 */
export async function getTodaySummary() {
  const result = await pool.query(
    `SELECT
       to_char(${PARK_TODAY_SQL}, 'YYYY-MM-DD') AS settlement_date,
       COALESCE(SUM(amount) FILTER (WHERE status = 'PAID'), 0)::int AS total_collected,
       COUNT(*) FILTER (WHERE status = 'PAID')::int AS paid_count,
       COUNT(*) FILTER (WHERE status = 'UNPAID')::int AS unpaid_count,
       COUNT(DISTINCT plate_number)::int AS plate_count
     FROM transactions
     WHERE ${parkDateOf('created_at')} = ${PARK_TODAY_SQL}`,
  );

  const row = result.rows[0];

  return {
    date: row.settlement_date,
    totalCollected: row.total_collected,
    paidCount: row.paid_count,
    unpaidCount: row.unpaid_count,
    plateCount: row.plate_count,
  };
}

