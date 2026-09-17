import { getDb } from '../lib/db';
import type { ValidationResult } from '../types/ticket';

/**
 * Локальний журнал сканів контролера. Записується після кожного validateTicket
 * (успішного чи ні) — щоб контролер бачив «що я перевірив за зміну» навіть
 * офлайн.
 *
 * Кожен рядок прив'язаний до controller_id (id залогіненого контролера) — на
 * спільному пристрої різні контролери бачать лише свої скани. synced_at != NULL
 * означає, що подія вже доїхала в controller_action_log на бекенді; такі рядки
 * періодично прибирає pruneLocalDb(). Рядки з synced_at IS NULL — черга на
 * відправку (offline-first), їх досилає syncPendingValidations().
 */

export interface ValidationLogEntry {
  id: string;
  ticket_id: string;
  route_id: string | null;
  result: 'valid' | 'invalid';
  reason: string | null;
  scanned_at: number;
  payload: string | null;
  inspection_session_id: string | null;
}

export interface PendingValidation extends ValidationLogEntry {
  client_action_id: string;
  controller_id: string | null;
}

function genId(): string {
  return `log-${Date.now()}-${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

function genClientActionId(): string {
  return `ca-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000).toString(36)}`;
}

export async function logValidation(params: {
  controllerId: string | null;
  ticketId: string;
  routeId: string | null;
  result: ValidationResult;
  rawQr?: string | null;
  inspectionSessionId?: string | null;
  /** true — бекенд уже зафіксував цей скан (онлайн-шлях), локально не в черзі. */
  syncedWithBackend: boolean;
}): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT INTO validation_log
       (id, ticket_id, route_id, result, reason, scanned_at, payload,
        controller_id, inspection_session_id, client_action_id, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      genId(),
      params.ticketId,
      params.routeId,
      params.result.kind,
      params.result.kind === 'invalid' ? params.result.reason : null,
      Date.now(),
      params.rawQr ?? null,
      params.controllerId,
      params.inspectionSessionId ?? null,
      genClientActionId(),
      params.syncedWithBackend ? Date.now() : null,
    ],
  );
}

function rowToEntry(r: Record<string, unknown>): ValidationLogEntry {
  return {
    id: String(r.id),
    ticket_id: String(r.ticket_id),
    route_id: r.route_id != null ? String(r.route_id) : null,
    result: r.result === 'valid' ? 'valid' : 'invalid',
    reason: r.reason != null ? String(r.reason) : null,
    scanned_at: Number(r.scanned_at),
    payload: r.payload != null ? String(r.payload) : null,
    inspection_session_id:
      r.inspection_session_id != null ? String(r.inspection_session_id) : null,
  };
}

export async function listRecentValidations(
  controllerId: string | null,
  limit = 50,
): Promise<ValidationLogEntry[]> {
  const db = getDb();
  const res = await db.execute(
    `SELECT id, ticket_id, route_id, result, reason, scanned_at, payload, inspection_session_id
     FROM validation_log
     WHERE controller_id IS ?
     ORDER BY scanned_at DESC
     LIMIT ?`,
    [controllerId, limit],
  );
  return (res.rows ?? []).map(rowToEntry);
}

export interface ShiftSummary {
  totalScans: number;
  validCount: number;
  invalidCount: number;
  sinceMs: number;
}

const SHIFT_WINDOW_MS = 12 * 60 * 60_000; // 12 годин — типова зміна

export async function getShiftSummary(controllerId: string | null): Promise<ShiftSummary> {
  const db = getDb();
  const since = Date.now() - SHIFT_WINDOW_MS;
  const res = await db.execute(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN result = 'valid' THEN 1 ELSE 0 END) as valid_count,
       SUM(CASE WHEN result = 'invalid' THEN 1 ELSE 0 END) as invalid_count
     FROM validation_log
     WHERE controller_id IS ? AND scanned_at >= ?`,
    [controllerId, since],
  );
  const row = res.rows?.[0] ?? {};
  return {
    totalScans: Number(row.total ?? 0),
    validCount: Number(row.valid_count ?? 0),
    invalidCount: Number(row.invalid_count ?? 0),
    sinceMs: since,
  };
}

/** Рядки, які ще не доїхали на бекенд (offline-черга). */
export async function listPendingValidations(limit = 200): Promise<PendingValidation[]> {
  const db = getDb();
  const res = await db.execute(
    `SELECT id, ticket_id, route_id, result, reason, scanned_at, payload, inspection_session_id,
            client_action_id, controller_id
     FROM validation_log
     WHERE synced_at IS NULL
     ORDER BY scanned_at ASC
     LIMIT ?`,
    [limit],
  );
  return (res.rows ?? []).map((r) => ({
    ...rowToEntry(r),
    client_action_id: String(r.client_action_id),
    controller_id: r.controller_id != null ? String(r.controller_id) : null,
  }));
}

export async function markValidationsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.execute(
    `UPDATE validation_log SET synced_at = ? WHERE id IN (${placeholders})`,
    [Date.now(), ...ids],
  );
}
