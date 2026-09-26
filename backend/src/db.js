import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

// The levy is a daily charge, so "has this plate paid today?" is decided in
// the park's local time rather than UTC. Shared by the schema constraint below
// and by the USSD flow, so the two can never disagree about what "today" means.
export const SETTLEMENT_TIME_ZONE = 'Africa/Lagos';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id BIGSERIAL PRIMARY KEY,
      phone VARCHAR(32) NOT NULL UNIQUE,
      plate_number VARCHAR(16) NOT NULL UNIQUE,
      balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id BIGSERIAL PRIMARY KEY,
      phone VARCHAR(32) NOT NULL,
      plate_number VARCHAR(16) NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      status VARCHAR(16) NOT NULL CHECK (status IN ('PAID', 'UNPAID')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_plate_created
      ON transactions (plate_number, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_transactions_phone_created
      ON transactions (phone, created_at DESC);

    CREATE TABLE IF NOT EXISTS sessions (
      phone VARCHAR(32) PRIMARY KEY,
      state VARCHAR(32) NOT NULL,
      plate_number VARCHAR(16),
      amount INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
      ON sessions (updated_at);
  `);

  // A driver pays the daily levy once. Enforced in the database as well as in
  // the USSD flow, so no future code path can double-charge a plate.
  await createDailyLevyConstraint();
}

async function createDailyLevyConstraint() {
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_one_paid_per_plate_per_day
        ON transactions (
          plate_number,
          ((created_at AT TIME ZONE '${SETTLEMENT_TIME_ZONE}')::date)
        )
        WHERE status = 'PAID';
    `);
  } catch (error) {
    // Most likely pre-existing duplicate rows for the same plate and day.
    // Warn loudly rather than refusing to boot, so a demo deploy survives.
    console.warn(
      'Could not create the one-levy-per-plate-per-day constraint:',
      error.message,
    );
    console.warn(
      'Duplicate same-day PAID rows exist. The USSD flow still blocks a second payment,',
      'but the database is no longer enforcing it.',
    );
  }
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  initDb()
    .then(async () => {
      console.log('Database initialized.');
      await pool.end();
    })
    .catch(async (error) => {
      console.error('Database initialization failed:', error);
      await pool.end();
      process.exit(1);
    });
}
