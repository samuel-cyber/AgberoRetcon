// The rules of the levy that hold anywhere in the system, with no database and
// no network access, so they can be unit tested directly.
import { SETTLEMENT_TIME_ZONE } from './db.js';

/**
 * The daily levy a driver pays, in naira.
 *
 * Fixed by the system rather than typed on the handset, so a levy can never be
 * underpaid or fat-fingered. The driver flow charges exactly this, and an
 * UNPAID ledger row carries it as the amount still owed that day.
 */
export const LEVY_AMOUNT = 500;

// The park's clock, never the server's: 11:30pm in Lagos is already tomorrow in
// UTC, and "has this bus paid today?" has to mean the day the agents working
// the park mean. An explicit locale keeps the label from drifting with the
// machine's regional settings.
const PARK_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: SETTLEMENT_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const PARK_DATE_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: SETTLEMENT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toDate(value) {
  if (value === null || value === undefined || value === '') return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * "7:42am" — the label the agent sees on the handset and the dashboard shows in
 * its ledger, in the park's local time.
 */
export function formatParkTime(value) {
  const date = toDate(value);
  if (!date) return '';

  const parts = PARK_CLOCK.formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value ?? '';
  const hour = read('hour').replace(/\D/g, '');
  const minute = read('minute').replace(/\D/g, '');
  const period = read('dayPeriod').toLowerCase().replace(/[^a-z]/g, '');

  if (!hour || !minute) return '';
  return `${Number(hour)}:${minute}${period}`;
}

/** "2026-09-28" — the park-local settlement day a timestamp belongs to. */
export function parkDate(value) {
  const date = toDate(value);
  if (!date) return '';

  const parts = PARK_DATE_PARTS.formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value ?? '';
  const year = read('year');
  const month = read('month');
  const day = read('day');

  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
}
