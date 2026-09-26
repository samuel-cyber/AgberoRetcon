// Zero-dependency tests for the pure logic: input normalisation and the
// USSD callback guard. Run with `npm test`.
// The full USSD flow is exercised separately against a real PostgreSQL.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanPhone, cleanPlate, isValidPlate, plateKey } from '../src/validation.js';
import { checkUssdAccess, matchesCidr, parseAllowedIps, clientIp } from '../src/auth.js';

test('cleanPhone normalises the formats Africa\'s Talking may send', () => {
  assert.equal(cleanPhone('+2348000000000'), '+2348000000000');
  assert.equal(cleanPhone('+234 800 000 0000'), '+2348000000000');
  assert.equal(cleanPhone(' +234-800-000-0000 '), '+2348000000000');
  assert.equal(cleanPhone('002348000000000'), '+2348000000000');
  assert.equal(cleanPhone('08000000000'), '08000000000');
});

test('cleanPhone rejects input with no digits', () => {
  assert.equal(cleanPhone(''), '');
  assert.equal(cleanPhone('   '), '');
  assert.equal(cleanPhone('abc'), '');
  assert.equal(cleanPhone(null), '');
  assert.equal(cleanPhone(undefined), '');
});

test('cleanPlate uppercases and strips whitespace', () => {
  assert.equal(cleanPlate('lnd-234-xy'), 'LND-234-XY');
  assert.equal(cleanPlate('  kja 111 aa  '), 'KJA111AA');
});

test('isValidPlate accepts realistic plates and rejects junk', () => {
  assert.equal(isValidPlate('LND-234-XY'), true);
  assert.equal(isValidPlate('KJA111AA'), true);
  assert.equal(isValidPlate('@@'), false);
  assert.equal(isValidPlate('AB'), false);
  assert.equal(isValidPlate('LND_234_XY'), false);
});

test('plateKey makes separators insignificant when matching', () => {
  const key = plateKey('LND-234-XY');
  assert.equal(key, 'LND234XY');
  assert.equal(plateKey('lnd234xy'), key);
  assert.equal(plateKey('LND 234 XY'), key);
  assert.equal(plateKey('LND-234-XY'), key);
  assert.notEqual(plateKey('LND-234-XZ'), key);
});

test('the guard is open when nothing is configured', () => {
  const req = { ip: '8.8.8.8', query: {}, get: () => '' };
  assert.deepEqual(checkUssdAccess(req, {}), { allowed: true });
});

test('an IP allowlist admits listed ranges and blocks outsiders', () => {
  const config = { allowedIps: parseAllowedIps('196.201.212.0/24, 41.1.2.3') };
  const req = (ip) => ({ ip, query: {}, get: () => '' });

  assert.equal(checkUssdAccess(req('196.201.212.55'), config).allowed, true);
  assert.equal(checkUssdAccess(req('41.1.2.3'), config).allowed, true);

  const blocked = checkUssdAccess(req('8.8.8.8'), config);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.status, 403);
});

test('a shared secret is required and compared exactly', () => {
  const config = { sharedSecret: 's3cret' };
  const withQuery = { ip: '1.1.1.1', query: { secret: 's3cret' }, get: () => '' };
  const withHeader = {
    ip: '1.1.1.1',
    query: {},
    get: (name) => (name === 'x-ussd-secret' ? 's3cret' : ''),
  };
  const wrong = { ip: '1.1.1.1', query: { secret: 'nope' }, get: () => '' };
  const missing = { ip: '1.1.1.1', query: {}, get: () => '' };

  assert.equal(checkUssdAccess(withQuery, config).allowed, true);
  assert.equal(checkUssdAccess(withHeader, config).allowed, true);
  assert.equal(checkUssdAccess(wrong, config).status, 401);
  assert.equal(checkUssdAccess(missing, config).status, 401);
});

test('a prefix of the secret is not accepted', () => {
  const config = { sharedSecret: 's3cret' };
  const partial = { ip: '1.1.1.1', query: { secret: 's3cre' }, get: () => '' };
  assert.equal(checkUssdAccess(partial, config).status, 401);
});

test('matchesCidr handles boundaries and malformed input', () => {
  assert.equal(matchesCidr('10.0.0.1', '10.0.0.0/8'), true);
  assert.equal(matchesCidr('11.0.0.1', '10.0.0.0/8'), false);
  assert.equal(matchesCidr('10.0.0.1', '0.0.0.0/0'), true);
  assert.equal(matchesCidr('10.0.0.1', '10.0.0.1/32'), true);
  assert.equal(matchesCidr('10.0.0.2', '10.0.0.1/32'), false);
  assert.equal(matchesCidr('10.0.0.1', '10.0.0.1'), true);
  assert.equal(matchesCidr('not-an-ip', '10.0.0.0/8'), false);
  assert.equal(matchesCidr('10.0.0.1', 'garbage'), false);
  assert.equal(matchesCidr('10.0.0.1', '10.0.0.0/33'), false);
});

test('clientIp unwraps IPv4-mapped IPv6 addresses', () => {
  assert.equal(clientIp({ ip: '::ffff:127.0.0.1' }), '127.0.0.1');
  assert.equal(clientIp({ ip: '41.1.2.3' }), '41.1.2.3');
  assert.equal(clientIp({ socket: { remoteAddress: '::ffff:10.0.0.5' } }), '10.0.0.5');
  assert.equal(clientIp({}), '');
});
