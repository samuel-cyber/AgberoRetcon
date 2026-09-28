// The dashboard API's contract: how its query string is read and how a ledger
// row is presented as JSON. Pure functions with no database access, so both can
// be tested without one.
import { cleanPlate, isValidPlate, plateKey } from './validation.js';
import { formatParkTime, parkDate } from './levy.js';

export const DEFAULT_TRANSACTION_LIMIT = 50;
export const MAX_TRANSACTION_LIMIT = 200;

const STATUSES = ['PAID', 'UNPAID'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a real calendar date.
 *
 * JavaScript rolls "2026-02-31" over to the 3rd of March instead of rejecting
 * it, so a syntactically valid date still has to survive the round trip before
 * it is handed to PostgreSQL.
 */
function isCalendarDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Reads one optional query value, rejecting anything repeated or non-textual. */
function single(value, name) {
  if (value === undefined || value === null) return { value: null };
  if (typeof value !== 'string') return { error: `${name} must be given once.` };

  const trimmed = value.trim();
  return { value: trimmed === '' ? null : trimmed };
}

/**
 * Turns the query string of `GET /transactions` into the filters the ledger
 * query takes. Malformed input is reported rather than ignored, so a dashboard
 * bug surfaces as a 400 instead of a silently empty ledger.
 *
 * @returns {{filters: object, error: null} | {filters: null, error: string}}
 */
export function parseTransactionFilters(query = {}) {
  const limitField = single(query.limit, 'limit');
  if (limitField.error) return { filters: null, error: limitField.error };

  const limit = limitField.value === null ? DEFAULT_TRANSACTION_LIMIT : Number(limitField.value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TRANSACTION_LIMIT) {
    return {
      filters: null,
      error: `limit must be a whole number between 1 and ${MAX_TRANSACTION_LIMIT}.`,
    };
  }

  const statusField = single(query.status, 'status');
  if (statusField.error) return { filters: null, error: statusField.error };

  let status = null;
  if (statusField.value) {
    status = statusField.value.toUpperCase();
    if (!STATUSES.includes(status)) {
      return { filters: null, error: `status must be one of ${STATUSES.join(', ')}.` };
    }
  }

  const plateField = single(query.plate, 'plate');
  if (plateField.error) return { filters: null, error: plateField.error };

  let plate = null;
  if (plateField.value) {
    const cleaned = cleanPlate(plateField.value);
    if (!isValidPlate(cleaned)) {
      return { filters: null, error: 'plate is not a valid plate number.' };
    }
    // Separator-insensitive, so the dashboard can filter on the plate exactly as
    // an agent typed it on a feature-phone keypad.
    plate = plateKey(cleaned);
  }

  const dateField = single(query.date, 'date');
  if (dateField.error) return { filters: null, error: dateField.error };

  // Today is the default because the levy is a daily charge and that is the day
  // the dashboard's totals describe. `all` walks back through history.
  let date = 'today';
  if (dateField.value) {
    const raw = dateField.value.toLowerCase();
    if (raw === 'today' || raw === 'all') {
      date = raw;
    } else if (DATE_PATTERN.test(raw) && isCalendarDate(raw)) {
      date = raw;
    } else {
      return { filters: null, error: 'date must be today, all or YYYY-MM-DD.' };
    }
  }

  return { filters: { limit, status, plateKey: plate, date }, error: null };
}

/**
 * A ledger row as the dashboard consumes it.
 *
 * Timestamps arrive in three forms on purpose: an ISO instant to sort on, and
 * the park-local date and clock label so the UI never has to re-implement the
 * time zone. `phone` is the handset that produced the row — the driver for a
 * PAID row, the agent whose check found the vehicle UNPAID.
 */
export function toApiTransaction(row) {
  const createdAt = new Date(row.created_at);

  return {
    id: String(row.id),
    plateNumber: row.plate_number,
    phone: row.phone,
    amount: Number(row.amount),
    status: row.status,
    createdAt: createdAt.toISOString(),
    localDate: parkDate(createdAt),
    localTime: formatParkTime(createdAt),
  };
}
