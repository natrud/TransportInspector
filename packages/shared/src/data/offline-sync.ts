import { api } from '../lib/api';
import { pruneLocalDb } from '../lib/db';
import {
  listPendingValidations,
  markValidationsSynced,
} from './validation-log';
import { syncPendingFines } from './fines-api';

/**
 * Offline-first синхронізація дій контролера.
 *
 * Локальна база (SQLite) — це кеш + черга, а не архів. Архів живе на бекенді
 * (`controller_action_log`, `inspector_fines`). Ця функція:
 *   1) досилає постанови, які не пішли одразу (немає звʼязку);
 *   2) досилає скани, зроблені офлайн, у `POST /api/v1/inspector/actions`;
 *   3) чистить локально вже синхронізовані старі записи.
 *
 * Викликається на старті застосунку і при відновленні мережі (див.
 * hooks/useOfflineSync).
 */

interface QueuedActionPayload {
  client_action_id: string;
  action_type: string;
  occurred_at: string;
  result: string;
  reason: string | null;
  route_id: string | null;
  ticket_id: string | null;
  scanned_value: string | null;
  inspection_session_id: string | null;
}

async function syncPendingValidations(): Promise<number> {
  const pending = await listPendingValidations();
  if (pending.length === 0) return 0;

  const actions: QueuedActionPayload[] = pending.map((p) => {
    const offline = p.reason === 'offline';
    return {
      client_action_id: p.client_action_id,
      action_type: 'ticket_scan',
      occurred_at: new Date(p.scanned_at).toISOString(),
      result: offline ? 'error' : p.result,
      reason: p.reason,
      route_id: p.route_id,
      ticket_id: p.ticket_id,
      scanned_value: p.payload ?? p.ticket_id,
      inspection_session_id: p.inspection_session_id,
    };
  });

  const res = await api<{ accepted: string[] }>('/api/v1/inspector/actions', {
    method: 'POST',
    body: JSON.stringify({ actions }),
  });

  const acceptedSet = new Set(res.accepted ?? []);
  const syncedIds = pending
    .filter((p) => acceptedSet.has(p.client_action_id))
    .map((p) => p.id);
  await markValidationsSynced(syncedIds);
  return syncedIds.length;
}

let inFlight: Promise<void> | null = null;

/** Прогнати повну синхронізацію. Повторні паралельні виклики схлопуються. */
export function syncControllerData(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      await syncPendingFines();
    } catch {
      /* спробуємо наступного разу */
    }
    try {
      await syncPendingValidations();
    } catch {
      /* спробуємо наступного разу */
    }
    try {
      await pruneLocalDb();
    } catch {
      /* прибирання не критичне */
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
