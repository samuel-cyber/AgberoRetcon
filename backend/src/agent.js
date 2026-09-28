// The agent's shortcode: the "agbero" standing at the park stops a bus, types
// its plate number, and is told whether that vehicle has paid today. Same
// interaction as the paper ticket, minus the cash and the argument.
import { pool } from './db.js';
import { cleanPhone, cleanPlate, isValidPlate } from './validation.js';
import { clearSession, getSession, saveSession } from './sessions.js';
import { lookupVehicleStatus, recordUnpaidCheck } from './ledger.js';
import { formatParkTime } from './levy.js';

function end(message) {
  return `END ${message}`;
}

function continueWith(message) {
  return `CON ${message}`;
}

const AGENT_MENU = 'AgberoRecon - Agent\n1. Check vehicle status';
const PLATE_PROMPT = 'Enter vehicle plate number:';

/**
 * Handles Africa's Talking's agent callback.
 *
 * Agent menu:
 *   ""                  -> menu
 *   "1"                 -> ask for the plate
 *   "1*LND-234-XY"      -> PAID (with the time it was paid) or UNPAID
 *
 * The check is read-only apart from the *first* UNPAID detection of the day,
 * which becomes a ledger row so the dashboard can show who was stopped for not
 * paying. A plate that has paid already has its own PAID row from the driver's
 * dial, so a successful check writes nothing at all.
 */
export async function handleAgentUSSD({ phoneNumber, text = '' }) {
  const phone = cleanPhone(phoneNumber);
  const client = await pool.connect();

  try {
    if (!phone) return end('Unable to identify your phone number.');

    const input = String(text).trim();
    const session = await getSession(client, phone);

    // First request of a session starts at the menu.
    if (!input) {
      await saveSession(client, phone, 'AGENT_MENU');
      return continueWith(AGENT_MENU);
    }

    // If a stale/nonexistent session receives input, restart cleanly.
    if (!session) {
      await saveSession(client, phone, 'AGENT_MENU');
      return continueWith(`Session restarted.\n${AGENT_MENU}`);
    }

    const parts = input.split('*');

    if (parts.length === 1 && parts[0] === '1') {
      await saveSession(client, phone, 'AGENT_PLATE');
      return continueWith(PLATE_PROMPT);
    }

    if (session.state === 'AGENT_PLATE' && parts.length === 2) {
      const plate = cleanPlate(parts[1]);

      if (!isValidPlate(plate)) {
        return continueWith(
          `Invalid plate. Use letters, numbers and hyphens only.\n${PLATE_PROMPT}`,
        );
      }

      const vehicle = await lookupVehicleStatus(client, plate);

      if (vehicle.status === 'PAID') {
        await clearSession(client, phone);
        return end(
          `Plate: ${vehicle.plateNumber}\nPAID ✅ - ${formatParkTime(vehicle.paidAt)}`,
        );
      }

      // A plate no wallet is registered to is almost always a typo on a
      // keypad, so it is answered but deliberately kept out of the ledger.
      if (vehicle.registered) {
        await recordUnpaidCheck(client, { phone, plateNumber: vehicle.plateNumber });
      }

      await clearSession(client, phone);

      return end(
        vehicle.registered
          ? `Plate: ${vehicle.plateNumber}\nUNPAID ❌\nTell the driver to pay today's levy.`
          : `Plate: ${vehicle.plateNumber}\nUNPAID ❌\nPlate not registered - see an administrator.`,
      );
    }

    await clearSession(client, phone);
    return end('Invalid input. Please dial again.');
  } finally {
    client.release();
  }
}
