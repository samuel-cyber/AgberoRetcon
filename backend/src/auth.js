// Access control for the Africa's Talking USSD callback.
//
// AT does not sign USSD callbacks, so without a guard anyone who learns the
// URL can POST arbitrary phone numbers and text: reading balances, moving
// money, or probing plates. Both checks are opt-in via environment variables
// so the demo keeps working out of the box; set them for any real deployment.
import { timingSafeEqual } from 'node:crypto';

/** Pulls the caller's IP, unwrapping IPv4-mapped IPv6 ("::ffff:1.2.3.4"). */
export function clientIp(req) {
  const raw = req.ip || req.socket?.remoteAddress || '';
  return String(raw).replace(/^::ffff:/, '');
}

function ipv4ToInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** Matches an IPv4 address against a bare address or CIDR block. */
export function matchesCidr(ip, entry) {
  const [range, bitsRaw] = String(entry).split('/');
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);

  if (ipInt === null || rangeInt === null) return false;
  if (bitsRaw === undefined) return ipInt === rangeInt;

  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;

  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return ((ipInt & mask) >>> 0) === ((rangeInt & mask) >>> 0);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function parseAllowedIps(raw) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * @returns {{allowed: true} | {allowed: false, status: number, reason: string}}
 */
export function checkUssdAccess(req, { allowedIps = [], sharedSecret = '' } = {}) {
  if (allowedIps.length > 0) {
    const ip = clientIp(req);
    if (!allowedIps.some((entry) => matchesCidr(ip, entry))) {
      return { allowed: false, status: 403, reason: `ip ${ip} is not allowlisted` };
    }
  }

  if (sharedSecret) {
    const provided = req.query?.secret || req.get?.('x-ussd-secret') || '';
    if (!safeEqual(provided, sharedSecret)) {
      return { allowed: false, status: 401, reason: 'bad shared secret' };
    }
  }

  return { allowed: true };
}
