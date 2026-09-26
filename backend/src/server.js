import 'dotenv/config';
import express from 'express';
import { initDb } from './db.js';
import { handleUSSD, sweepExpiredSessions } from './ussd.js';
import { checkUssdAccess, parseAllowedIps } from './auth.js';

const app = express();
const port = Number(process.env.PORT || 3000);

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

const allowedIps = parseAllowedIps(process.env.USSD_ALLOWED_IPS);
const sharedSecret = String(process.env.USSD_SHARED_SECRET || '').trim();

if (allowedIps.length > 0 && process.env.TRUST_PROXY !== 'true') {
  console.warn(
    'USSD_ALLOWED_IPS is set but TRUST_PROXY is not "true". Behind a proxy every',
    'request appears to come from the proxy address and all callbacks will be rejected.',
  );
}

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Africa's Talking USSD callback for Samuel's driver-pay flow.
app.post('/ussd', async (req, res) => {
  const access = checkUssdAccess(req, { allowedIps, sharedSecret });

  if (!access.allowed) {
    console.warn(`Rejected USSD callback: ${access.reason}`);
    return res
      .type('text/plain')
      .status(access.status)
      .send('END Service unavailable for this caller.');
  }

  try {
    const response = await handleUSSD({
      phoneNumber: req.body.phoneNumber,
      text: req.body.text || '',
    });

    res.type('text/plain').send(response);
  } catch (error) {
    console.error('USSD error:', error);
    res.type('text/plain').status(200).send('END Service temporarily unavailable. Please try again.');
  }
});

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

  app.listen(port, () => {
    console.log(`AgberoRecon backend listening on port ${port}`);
    if (allowedIps.length === 0 && !sharedSecret) {
      console.warn(
        'USSD callback is unauthenticated. Set USSD_ALLOWED_IPS and/or',
        'USSD_SHARED_SECRET before deploying publicly.',
      );
    }
  });
}

start().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
