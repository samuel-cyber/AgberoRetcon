// The dashboard-facing API: the ledger the web page polls, today's totals, and
// the same plate lookup the agent's USSD menu answers with.
//
// Everything here is read-only. The only writers in the system are the two USSD
// flows, which is what keeps the ledger an honest record of what happened on
// the street rather than something the dashboard could edit.
import express from 'express';
import { pool } from './db.js';
import { checkDashboardAccess } from './auth.js';
import { getTodaySummary, listTransactions, lookupVehicleStatus } from './ledger.js';
import { parseTransactionFilters } from './dashboard-shape.js';
import { cleanPlate, isValidPlate } from './validation.js';

const NO_STORE = { 'Cache-Control': 'no-store' };

export function createDashboardRouter({ apiKey = '' } = {}) {
  const router = express.Router();

  // Optional, opt-in API key: with DASHBOARD_API_KEY unset the ledger stays
  // public so judges can watch it live.
  router.use((req, res, next) => {
    const access = checkDashboardAccess(req, apiKey);

    if (!access.allowed) {
      console.warn(`Rejected dashboard request: ${access.reason}`);
      return res.status(access.status).json({ error: 'Unauthorized' });
    }

    next();
  });

  /**
   * GET /transactions
   *   ?limit=50           1..200, newest first
   *   &status=PAID|UNPAID
   *   &plate=LND-234-XY   separators optional, like the handset
   *   &date=today|all|YYYY-MM-DD   (default today, the park's day)
   */
  router.get('/transactions', async (req, res) => {
    const { filters, error } = parseTransactionFilters(req.query);
    if (error) return res.status(400).json({ error });

    const transactions = await listTransactions(filters);

    res.set(NO_STORE).status(200).json({
      count: transactions.length,
      transactions,
      serverTime: new Date().toISOString(),
    });
  });

  /** GET /transactions/summary — the numbers behind the dashboard cards. */
  router.get('/transactions/summary', async (_req, res) => {
    const summary = await getTodaySummary();

    res.set(NO_STORE).status(200).json({
      summary,
      serverTime: new Date().toISOString(),
    });
  });

  /**
   * GET /vehicles/:plate/status — the dashboard's view of the agent's check, so
   * the page can confirm what the agent's handset showed.
   */
  router.get('/vehicles/:plate/status', async (req, res) => {
    const plate = cleanPlate(req.params.plate);
    if (!isValidPlate(plate)) {
      return res.status(400).json({ error: 'plate is not a valid plate number.' });
    }

    const vehicle = await lookupVehicleStatus(pool, plate);

    res.set(NO_STORE).status(200).json({
      plateNumber: vehicle.plateNumber,
      status: vehicle.status,
      registered: vehicle.registered,
      paidAt: vehicle.paidAt ? new Date(vehicle.paidAt).toISOString() : null,
      amount: vehicle.amount,
      checkedAt: new Date().toISOString(),
    });
  });

  return router;
}
