// USSD is stateless: every keypress arrives as a brand new HTTP request, so
// "where is this phone in the menu?" has to survive between requests. That
// position lives in the `sessions` table instead of Redis: at hackathon scale a
// row with an `updated_at` timestamp does the job, and it removes a moving part
// we would otherwise be debugging under time pressure.
//
// Both flows share this store. The driver flow (ussd.js) and the agent flow
// (agent.js) use distinct state names, so one table serves both.
import { pool } from './db.js';

// A session untouched for this long is abandoned: the driver walked away, the
// handset lost signal, or the network dropped the call.
export const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

/** Reads the caller's menu position, discarding it when it has expired. */
export async function getSession(client, phone) {
  const result = await client.query(
    `SELECT phone, state, plate_number, amount, updated_at
     FROM sessions
     WHERE phone = $1`,
    [phone],
  );

  const session = result.rows[0];
  if (!session) return null;

  if (Date.now() - new Date(session.updated_at).getTime() > SESSION_TIMEOUT_MS) {
    await client.query('DELETE FROM sessions WHERE phone = $1', [phone]);
    return null;
  }

  return session;
}

export async function saveSession(client, phone, state, plateNumber = null, amount = null) {
  await client.query(
    `INSERT INTO sessions (phone, state, plate_number, amount, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (phone) DO UPDATE SET
       state = EXCLUDED.state,
       plate_number = EXCLUDED.plate_number,
       amount = EXCLUDED.amount,
       updated_at = NOW()`,
    [phone, state, plateNumber, amount],
  );
}

export async function clearSession(client, phone) {
  await client.query('DELETE FROM sessions WHERE phone = $1', [phone]);
}

/**
 * Deletes sessions abandoned mid-menu. Without this, a row lingers for every
 * phone that ever dialled and was never seen again.
 */
export async function sweepExpiredSessions() {
  const result = await pool.query(
    `DELETE FROM sessions
     WHERE updated_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')`,
    [SESSION_TIMEOUT_MS],
  );
  return result.rowCount;
}
