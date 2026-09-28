// Builds the Express app: the two USSD callbacks and the dashboard API.
//
// Split from server.js so the tests can start the real app on an ephemeral port
// and drive it over HTTP, exactly the way Africa's Talking and the dashboard do.
import express from 'express';
import { handleUSSD } from './ussd.js';
import { handleAgentUSSD } from './agent.js';
import { createDashboardRouter } from './dashboard.js';
import { checkUssdAccess, parseAllowedIps } from './auth.js';

function splitList(raw) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Cross-origin access for the dashboard, which is deployed separately from the
 * backend (Vercel and Railway are different origins, so the browser needs these
 * headers to read the ledger).
 *
 * An empty CORS_ALLOWED_ORIGINS allows any origin, which suits a read-only
 * public ledger; set it to the dashboard's URL to lock it down.
 */
function cors(allowedOrigins = []) {
  return (req, res, next) => {
    const origin = req.get?.('origin');
    const allowAny = allowedOrigins.length === 0;

    if (origin && (allowAny || allowedOrigins.includes(origin))) {
      res.set('Access-Control-Allow-Origin', allowAny ? '*' : origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    }

    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  };
}

/**
 * Africa's Talking calls one URL per USSD code and expects plain text back:
 * "CON ..." to keep the session open, "END ..." to close it.
 */
function createUssdHandler(handler, { allowedIps, sharedSecret }) {
  return async (req, res) => {
    const access = checkUssdAccess(req, { allowedIps, sharedSecret });

    if (!access.allowed) {
      console.warn(`Rejected USSD callback: ${access.reason}`);
      return res
        .type('text/plain')
        .status(access.status)
        .send('END Service unavailable for this caller.');
    }

    try {
      const response = await handler({
        phoneNumber: req.body?.phoneNumber,
        text: req.body?.text || '',
      });

      res.type('text/plain').send(response);
    } catch (error) {
      console.error('USSD error:', error);
      res
        .type('text/plain')
        .status(200)
        .send('END Service temporarily unavailable. Please try again.');
    }
  };
}

export function createApp({ env = process.env } = {}) {
  const app = express();

  if (env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  const allowedIps = parseAllowedIps(env.USSD_ALLOWED_IPS);
  const ussdSharedSecret = String(env.USSD_SHARED_SECRET || '').trim();
  // A second shortcode is a second Africa's Talking app, so it can carry its own
  // secret; when it does not, both callbacks share the one secret.
  const agentSharedSecret = String(env.AGENT_USSD_SHARED_SECRET || '').trim() || ussdSharedSecret;
  const agentServiceCode = String(env.AGENT_SERVICE_CODE || '').trim();
  const dashboardApiKey = String(env.DASHBOARD_API_KEY || '').trim();

  if (allowedIps.length > 0 && env.TRUST_PROXY !== 'true') {
    console.warn(
      'USSD_ALLOWED_IPS is set but TRUST_PROXY is not "true". Behind a proxy every',
      'request appears to come from the proxy address and all callbacks will be rejected.',
    );
  }

  if (allowedIps.length === 0 && !ussdSharedSecret) {
    console.warn(
      'USSD callback is unauthenticated. Set USSD_ALLOWED_IPS and/or',
      'USSD_SHARED_SECRET before deploying publicly.',
    );
  }

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(cors(splitList(env.CORS_ALLOWED_ORIGINS)));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  const driverUssd = createUssdHandler(handleUSSD, {
    allowedIps,
    sharedSecret: ussdSharedSecret,
  });
  const agentUssd = createUssdHandler(handleAgentUSSD, {
    allowedIps,
    sharedSecret: agentSharedSecret,
  });

  // Driver shortcode.
  //
  // When AGENT_SERVICE_CODE is set this same callback URL also serves the agent
  // shortcode: Africa's Talking sends `serviceCode` on every request, so two
  // codes can share one URL if that is all the sandbox allows.
  app.post('/ussd', (req, res) => {
    const serviceCode = String(req.body?.serviceCode || '');
    const handler = agentServiceCode && serviceCode === agentServiceCode ? agentUssd : driverUssd;

    return handler(req, res);
  });

  // Agent shortcode on its own callback URL, which is the cleaner setup: point
  // the agent USSD code at /ussd/agent.
  app.post('/ussd/agent', agentUssd);

  app.use(createDashboardRouter({ apiKey: dashboardApiKey }));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Express 5 forwards rejected promises from async handlers here, so a failed
  // query becomes a 500 instead of a hanging request.
  app.use((error, _req, res, _next) => {
    console.error('Request failed:', error);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
