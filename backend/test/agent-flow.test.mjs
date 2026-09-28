// Unit tests for the pure agent-side rules: how a timestamp is labelled in the
// park's local time, and which settlement day it belongs to. No database, no
// network. The USSD menu itself is driven end to end in
// test/loop.integration.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LEVY_AMOUNT, formatParkTime, parkDate } from '../src/levy.js';

test('formatParkTime reads the park clock, not the server clock (Africa/Lagos)', () => {
  assert.equal(formatParkTime(new Date('2026-09-28T06:42:00Z')), '7:42am');
  assert.equal(formatParkTime(new Date('2026-09-28T11:59:00Z')), '12:59pm');
  assert.equal(formatParkTime(new Date('2026-09-28T12:00:00Z')), '1:00pm');
  assert.equal(formatParkTime(new Date('2026-09-28T23:05:00Z')), '12:05am');
  assert.equal(formatParkTime(new Date('2026-09-28T00:30:00Z')), '1:30am');
});

test('formatParkTime accepts the strings the dashboard JSON carries', () => {
  // node-postgres returns Date objects; the API hands out ISO strings.
  assert.equal(formatParkTime('2026-09-28T06:42:00.000Z'), '7:42am');
});

test('formatParkTime returns nothing for a missing or unusable value', () => {
  assert.equal(formatParkTime(null), '');
  assert.equal(formatParkTime(undefined), '');
  assert.equal(formatParkTime(''), '');
  assert.equal(formatParkTime('not a date'), '');
});

test('parkDate is the settlement day, which rolls over at Lagos midnight', () => {
  assert.equal(parkDate(new Date('2026-09-28T06:42:00Z')), '2026-09-28');
  assert.equal(parkDate(new Date('2026-09-28T22:59:00Z')), '2026-09-28');
  assert.equal(parkDate(new Date('2026-09-28T23:30:00Z')), '2026-09-29');
  assert.equal(parkDate('nonsense'), '');
});

test('the levy is fixed, so a driver can never underpay it', () => {
  assert.equal(LEVY_AMOUNT, 500);
});
