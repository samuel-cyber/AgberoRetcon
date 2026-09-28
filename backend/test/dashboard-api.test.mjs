// Unit tests for the dashboard API's contract: how its query string is read,
// the JSON shape of a ledger row, and the opt-in API key. No database and no
// server needed; the endpoints themselves are tested in
// test/loop.integration.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_TRANSACTION_LIMIT,
  parseTransactionFilters,
  toApiTransaction,
} from '../src/dashboard-shape.js';
import { checkDashboardAccess } from '../src/auth.js';

test('filters default to today, newest first, fifty rows', () => {
  const { filters, error } = parseTransactionFilters({});

  assert.equal(error, null);
  assert.deepEqual(filters, { limit: 50, status: null, plateKey: null, date: 'today' });
});

test('filters accept exactly what the dashboard sends', () => {
  const { filters, error } = parseTransactionFilters({
    limit: '25',
    status: 'paid',
    plate: 'lnd 234 xy',
    date: '2026-09-27',
  });

  assert.equal(error, null);
  assert.deepEqual(filters, {
    limit: 25,
    status: 'PAID',
    // Separators are optional, exactly as on a feature-phone keypad.
    plateKey: 'LND234XY',
    date: '2026-09-27',
  });
});

test('blank query values fall back to the defaults instead of erroring', () => {
  const { filters, error } = parseTransactionFilters({
    limit: '',
    status: '',
    plate: '   ',
    date: '',
  });

  assert.equal(error, null);
  assert.deepEqual(filters, { limit: 50, status: null, plateKey: null, date: 'today' });
});

test('a bad limit is reported rather than silently clamped', () => {
  for (const limit of ['0', '-5', '2.5', 'abc', String(MAX_TRANSACTION_LIMIT + 1)]) {
    const { filters, error } = parseTransactionFilters({ limit });

    assert.equal(filters, null);
    assert.match(error, /limit must be a whole number/);
  }
});

test('a repeated query parameter is rejected', () => {
  const { error } = parseTransactionFilters({ status: ['PAID', 'UNPAID'] });
  assert.match(error, /status must be given once/);
});

test('only real statuses, plates and dates are accepted', () => {
  assert.match(parseTransactionFilters({ status: 'MAYBE' }).error, /status must be one of/);
  assert.match(parseTransactionFilters({ plate: '@@' }).error, /not a valid plate/);
  assert.match(parseTransactionFilters({ date: 'yesterday' }).error, /date must be today/);
  assert.match(parseTransactionFilters({ date: '2026-02-31' }).error, /date must be today/);

  assert.equal(parseTransactionFilters({ date: 'all' }).filters.date, 'all');
});

test('toApiTransaction carries park-local date and clock alongside the ISO instant', () => {
  const row = {
    id: '42',
    phone: '+2348000000000',
    plate_number: 'LND-234-XY',
    amount: '500',
    status: 'PAID',
    created_at: new Date('2026-09-28T06:42:11.000Z'),
  };

  assert.deepEqual(toApiTransaction(row), {
    id: '42',
    plateNumber: 'LND-234-XY',
    phone: '+2348000000000',
    amount: 500,
    status: 'PAID',
    createdAt: '2026-09-28T06:42:11.000Z',
    localDate: '2026-09-28',
    localTime: '7:42am',
  });
});

test('the dashboard key is optional, and compared exactly when set', () => {
  const req = (query, header) => ({
    query,
    get: (name) => (name === 'x-api-key' ? header : ''),
  });

  assert.deepEqual(checkDashboardAccess(req({}, ''), ''), { allowed: true });
  assert.deepEqual(checkDashboardAccess(req({ key: 'k3y' }, ''), 'k3y'), { allowed: true });
  assert.deepEqual(checkDashboardAccess(req({}, 'k3y'), 'k3y'), { allowed: true });

  const missing = checkDashboardAccess(req({}, ''), 'k3y');
  assert.equal(missing.allowed, false);
  assert.equal(missing.status, 401);

  // A prefix of the key is not the key.
  assert.equal(checkDashboardAccess(req({ key: 'k3' }, ''), 'k3y').status, 401);
});
