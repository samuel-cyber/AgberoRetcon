// Shared input normalisation for phone numbers and plate numbers.
// Kept in one place so the USSD flow and the seed script agree on exactly
// how a value is cleaned and validated.

export const MAX_PHONE_LENGTH = 32;
export const MAX_PLATE_LENGTH = 16;

/**
 * Normalises a phone number coming from Africa's Talking.
 *
 * AT normally sends E.164 ("+2348000000000"), but numbers can arrive with
 * spacing or punctuation ("+234 800 000 0123"). Without normalising, those
 * two forms would look like two different drivers and the wallet lookup would
 * miss. A leading "00" international prefix is folded into "+".
 */
export function cleanPhone(phone) {
  const raw = String(phone ?? '').trim();
  if (!raw) return '';

  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  const hasInternationalPrefix = raw.startsWith('+') || raw.startsWith('00');
  const body = raw.startsWith('00') ? digits.slice(2) : digits;
  if (!body) return '';

  return `${hasInternationalPrefix ? '+' : ''}${body}`.slice(0, MAX_PHONE_LENGTH);
}

/** Uppercases a plate and strips the whitespace drivers naturally type. */
export function cleanPlate(plate) {
  return String(plate ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .slice(0, MAX_PLATE_LENGTH);
}

export function isValidPlate(plate) {
  return /^[A-Z0-9-]{3,16}$/.test(plate);
}

/**
 * Separator-insensitive form of a plate, used for matching only.
 *
 * On a feature-phone keypad the hyphen is awkward to type, so a driver who is
 * registered as "LND-234-XY" will often enter "LND 234 XY" or "LND234XY".
 * Those must all resolve to the same vehicle, while the plate stored in the
 * database stays in the familiar hyphenated form.
 */
export function plateKey(plate) {
  return String(plate ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
