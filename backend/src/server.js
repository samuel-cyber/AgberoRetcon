// Boots the backend: brings the schema up to date, then serves traffic.
//
// The Express app itself lives in app.js so the tests can start the same app on
// an ephemeral port and drive it over HTTP.
import 'dotenv/config';
import { createApp } from './app.js';
import { initDb } from './db.js';
import { sweepExpiredSessions } from './sessions.js';

const port = Number(process.env.PORT || 3000);

const SESSION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function startSessionSweeper() {
  const timer = setInterval(() => {
    sweepExpiredSessions().catch((error) => {
      console.error('Session sweep failed:', error);
    });
  }, SESSION_SWEEP_INTERVAL_MS);

  // Don't hold the process open just for the sweep timer.
  timer.unref();
  return timer;
}

async function start() {
  await initDb();

  // Clear anything left behind by a previous run before taking traffic.
  await sweepExpiredSessions().catch((error) => {
    console.error('Initial session sweep failed:', error);
  });
  startSessionSweeper();

  const app = createApp();

  app.listen(port, () => {
    console.log(`AgberoRecon backend listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
