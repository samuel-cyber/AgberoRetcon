import { pool, SETTLEMENT_TIME_ZONE } from './db.js';
import { cleanPhone, cleanPlate, isValidPlate, plateKey } from './validation.js';

const LEVY_AMOUNT = 500;
export const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

function end(message) {
  return `END ${message}`;
}

function continueWith(message) {
  return `CON ${message}`;
}

async function getSession(client, phone) {
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

async function saveSession(client, phone, state, plateNumber = null, amount = null) {
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

async function clearSession(client, phone) {
  await client.query('DELETE FROM sessions WHERE phone = $1', [phone]);
}

/**
 * A driver's wallet is keyed by phone number; the plate on the wallet is the
 * vehicle that wallet is registered to. Wallets are pre-funded for the demo,
 * so an unknown phone simply has no wallet and is told to see an administrator
 * rather than being given an empty one.
 */
async function getWalletByPhone(client, phone) {
  const result = await client.query(
    `SELECT id, phone, plate_number, balance
     FROM wallets
     WHERE phone = $1`,
    [phone],
  );
  return result.rows[0] || null;
}

const ALREADY_PAID_SQL = `
  SELECT 1 FROM transactions
  WHERE plate_number = $1
    AND status = 'PAID'
    AND (created_at AT TIME ZONE $2::text)::date
      = (NOW() AT TIME ZONE $2::text)::date
  LIMIT 1
`;

/** Has this plate already paid the levy today (in park-local time)? */
async function hasPaidToday(client, plateNumber) {
  const result = await client.query(ALREADY_PAID_SQL, [
    plateNumber,
    SETTLEMENT_TIME_ZONE,
  ]);
  return result.rowCount > 0;
}

/**
 * Debits the wallet and records the PAID transaction atomically.
 *
 * The wallet row is locked first, which also serialises two simultaneous
 * dials for the same vehicle, so the "already paid today?" check cannot be
 * beaten by a race. The unique index on transactions is the final backstop.
 */
async function payLevy(client, { phone, plateNumber, amount }) {
  await client.query('BEGIN');

  try {
    const walletResult = await client.query(
      `SELECT id, phone, plate_number, balance
       FROM wallets
       WHERE phone = $1
       FOR UPDATE`,
      [phone],
    );

    const wallet = walletResult.rows[0];
    if (!wallet) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'NO_WALLET' };
    }

    if (plateKey(wallet.plate_number) !== plateKey(plateNumber)) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'PLATE_MISMATCH', registeredPlate: wallet.plate_number };
    }

    // Always write the registered form of the plate, so a driver who typed the
    // plate without separators still produces a canonical ledger row.
    const canonicalPlate = wallet.plate_number;

    if (await hasPaidToday(client, canonicalPlate)) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'ALREADY_PAID' };
    }

    if (wallet.balance < amount) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'INSUFFICIENT_BALANCE', balance: wallet.balance };
    }

    const newBalance = wallet.balance - amount;

    await client.query(
      `UPDATE wallets
       SET balance = $1, updated_at = NOW()
       WHERE id = $2`,
      [newBalance, wallet.id],
    );

    let txResult;
    try {
      txResult = await client.query(
        `INSERT INTO transactions (phone, plate_number, amount, status)
         VALUES ($1, $2, $3, 'PAID')
         RETURNING id, created_at`,
        [phone, canonicalPlate, amount],
      );
    } catch (error) {
      // 23505 = unique_violation, i.e. the one-levy-per-day index fired
      // because a concurrent dial paid for the same plate first.
      if (error.code === '23505') {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'ALREADY_PAID' };
      }
      throw error;
    }

    await client.query('COMMIT');

    return {
      ok: true,
      balance: newBalance,
      transactionId: txResult.rows[0].id,
      createdAt: txResult.rows[0].created_at,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
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

const MAIN_MENU =
  "Welcome to AgberoRecon\n1. Pay today's levy\n2. Check my balance";

/**
 * Handles Africa's Talking's USSD callback.
 *
 * Driver menu:
 *   ""                  -> menu
 *   "1"                 -> ask for plate
 *   "1*LND-234-XY"      -> validate plate against the wallet, ask to confirm
 *   "1*LND-234-XY*1"    -> debit wallet + record PAID transaction
 *   "2"                 -> ask for plate and show balance
 */
export async function handleUSSD({ phoneNumber, text = '' }) {
  const phone = cleanPhone(phoneNumber);
  const client = await pool.connect();

  try {
    if (!phone) return end('Unable to identify your phone number.');

    const input = String(text).trim();
    const session = await getSession(client, phone);

    // First request starts a fresh session.
    if (!input) {
      await saveSession(client, phone, 'MAIN_MENU');
      return continueWith(MAIN_MENU);
    }

    // If a stale/nonexistent session receives input, restart cleanly.
    if (!session) {
      await saveSession(client, phone, 'MAIN_MENU');
      return continueWith(`Session restarted.\n${MAIN_MENU}`);
    }

    const parts = input.split('*');

    if (parts.length === 1 && parts[0] === '1') {
      await saveSession(client, phone, 'PAY_PLATE');
      return continueWith('Enter your vehicle plate number:');
    }

    if (parts.length === 1 && parts[0] === '2') {
      await saveSession(client, phone, 'BALANCE_PLATE');
      return continueWith('Enter your vehicle plate number:');
    }

    if (session.state === 'PAY_PLATE' && parts.length === 2) {
      const plate = cleanPlate(parts[1]);
      if (!isValidPlate(plate)) {
        return continueWith(
          'Invalid plate. Use letters, numbers and hyphens only.\nEnter plate number:',
        );
      }

      const wallet = await getWalletByPhone(client, phone);
      if (!wallet) {
        await clearSession(client, phone);
        return end(
          'No wallet registered for this number. Please contact an administrator.',
        );
      }

      if (plateKey(wallet.plate_number) !== plateKey(plate)) {
        await clearSession(client, phone);
        return end(
          `Plate ${plate} is not registered to this number.\nRegistered plate: ${wallet.plate_number}`,
        );
      }

      if (await hasPaidToday(client, wallet.plate_number)) {
        await clearSession(client, phone);
        return end(`Levy already paid today for ${wallet.plate_number}.`);
      }

      await saveSession(client, phone, 'PAY_CONFIRM', wallet.plate_number, LEVY_AMOUNT);

      return continueWith(
        `Plate: ${wallet.plate_number}\nLevy: N${LEVY_AMOUNT}\nBalance: N${wallet.balance}\n1. Confirm payment\n2. Cancel`,
      );
    }

    if (session.state === 'PAY_CONFIRM' && parts.length === 3) {
      const plate = cleanPlate(parts[1]);
      const choice = parts[2];

      if (choice === '2') {
        await clearSession(client, phone);
        return end('Payment cancelled.');
      }

      if (choice !== '1' || plateKey(plate) !== plateKey(session.plate_number)) {
        await clearSession(client, phone);
        return end('Invalid payment request. Please dial again.');
      }

      const result = await payLevy(client, {
        phone,
        plateNumber: session.plate_number,
        amount: session.amount || LEVY_AMOUNT,
      });

      await clearSession(client, phone);

      if (result.ok) {
        return end(
          `Levy paid. Balance: N${result.balance}. Ref: #${result.transactionId}`,
        );
      }

      if (result.reason === 'NO_WALLET') {
        return end(
          'No wallet registered for this number. Please contact an administrator.',
        );
      }

      if (result.reason === 'PLATE_MISMATCH') {
        return end(
          `Plate ${plate} is not registered to this number.\nRegistered plate: ${result.registeredPlate}`,
        );
      }

      if (result.reason === 'ALREADY_PAID') {
        return end(`Levy already paid today for ${session.plate_number}.`);
      }

      if (result.reason === 'INSUFFICIENT_BALANCE') {
        return end(`Insufficient balance. Balance: N${result.balance}.`);
      }

      return end('Payment could not be completed. Please try again.');
    }

    if (session.state === 'BALANCE_PLATE' && parts.length === 2) {
      const plate = cleanPlate(parts[1]);
      if (!isValidPlate(plate)) {
        return continueWith('Invalid plate. Enter your vehicle plate number:');
      }

      const wallet = await getWalletByPhone(client, phone);
      await clearSession(client, phone);

      if (!wallet) {
        return end(
          'No wallet registered for this number. Please contact an administrator.',
        );
      }

      if (plateKey(wallet.plate_number) !== plateKey(plate)) {
        return end(
          `Plate ${plate} is not registered to this number.\nRegistered plate: ${wallet.plate_number}`,
        );
      }

      return end(`Plate: ${wallet.plate_number}\nBalance: N${wallet.balance}`);
    }

    await clearSession(client, phone);
    return end('Invalid input. Please dial again.');
  } finally {
    client.release();
  }
}
