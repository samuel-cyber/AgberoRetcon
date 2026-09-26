import 'dotenv/config';
import { pool, initDb } from './db.js';
import { cleanPhone, cleanPlate, isValidPlate } from './validation.js';

const phone = cleanPhone(process.argv[2] || '+2348000000000');
const plate = cleanPlate(process.argv[3] || 'LND-234-XY');
const balance = Number(process.argv[4] ?? 5000);

if (!phone) {
  throw new Error('A phone number is required, e.g. +2348000000000');
}

if (!isValidPlate(plate)) {
  throw new Error(
    `"${plate}" is not a valid plate number. Use 3-16 letters, numbers and hyphens.`,
  );
}

if (!Number.isInteger(balance) || balance < 0) {
  throw new Error('Balance must be a non-negative integer in naira.');
}

await initDb();

// A plate belongs to exactly one driver, so seeding it onto a second phone
// would fail on a raw constraint violation. Check first and say why.
const plateOwner = await pool.query(
  'SELECT phone FROM wallets WHERE plate_number = $1',
  [plate],
);

if (plateOwner.rows[0] && plateOwner.rows[0].phone !== phone) {
  throw new Error(
    `Plate ${plate} is already registered to ${plateOwner.rows[0].phone}. ` +
      'Re-seed that phone, or pick a different plate.',
  );
}

await pool.query(
  `INSERT INTO wallets (phone, plate_number, balance)
   VALUES ($1, $2, $3)
   ON CONFLICT (phone) DO UPDATE SET
     plate_number = EXCLUDED.plate_number,
     balance = EXCLUDED.balance,
     updated_at = NOW()`,
  [phone, plate, balance],
);

console.log(`Seeded wallet: ${phone} / ${plate} / N${balance}`);
await pool.end();
