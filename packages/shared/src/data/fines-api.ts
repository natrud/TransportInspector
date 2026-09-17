import { getDb } from '../lib/db';
import { api, ApiError } from '../lib/api';
import {
  FINE_MULTIPLIER,
  calculateFineKopecks,
  fineFromTicketPriceKopecks,
  ticketPriceToKopecks,
} from '../lib/fine-math';

/**
 * Постанови про адміністративне правопорушення за ст. 135 КУпАП.
 * Зберігаються локально у SQLite; синхронізуються з бекендом окремим викликом
 * (mock submitFine). Розрахунок суми: 20 × base_fare_kopecks (винесено у
 * lib/fine-math для side-effect-free тестування).
 */

export { FINE_MULTIPLIER, calculateFineKopecks, fineFromTicketPriceKopecks, ticketPriceToKopecks };

export type FineReason =
  | 'no_ticket'           // безквитковий проїзд
  | 'expired'             // прострочений квиток
  | 'used'                // квиток вже використано
  | 'invalid_qr'          // QR не пройшов валідацію (підробка, hash mismatch)
  | 'no_concession_doc'   // нема документа на пільгу
  | 'unpaid_luggage';     // неоплачений багаж

export type FineDocType = 'passport' | 'id_card' | 'student' | 'pensioner' | 'driver_license' | 'other';

export type FineStatus = 'draft' | 'issued' | 'paid' | 'cancelled';

export interface Fine {
  id: string;
  created_at: number;
  controller_id: string | null;
  controller_serial: string;
  route_id: string | null;
  ticket_id: string | null;
  offender_name: string;
  offender_phone: string | null;
  offender_user_id: string | null;
  doc_type: FineDocType;
  doc_number: string;
  reason: FineReason;
  base_fare_kopecks: number;
  fine_amount_kopecks: number;
  location_note: string | null;
  status: FineStatus;
  synced_at: number | null;
  server_id: string | null;
  inspection_session_id: string | null;
}

export interface CreateFineInput {
  /** id залогіненого контролера — фільтр при читанні на спільному пристрої. */
  controller_id: string | null;
  controller_serial: string;
  route_id: string | null;
  ticket_id: string | null;
  offender_name: string;
  offender_phone: string | null;
  offender_user_id: string | null;
  doc_type: FineDocType;
  doc_number: string;
  reason: FineReason;
  base_fare_kopecks: number;
  location_note: string | null;
  inspection_session_id?: string | null;
}

export interface UserByPhoneResult {
  user_id: string;
  phone: string;
  display_name: string;
  email: string | null;
}

/** Пошук пасажира за номером телефону через бекенд. */
export async function lookupUserByPhone(phone: string): Promise<UserByPhoneResult | null> {
  try {
    return await api<UserByPhoneResult>(
      `/api/v1/inspector/user-by-phone?phone=${encodeURIComponent(phone)}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

function genId(): string {
  // 10-значний alphanum — короткий унікальний код, який можна друкувати на квитанції
  // (типу «F-7K3M9P2Q1»).
  const ts = Date.now().toString(36).toUpperCase().slice(-5);
  const rnd = Math.floor(Math.random() * 36 ** 5)
    .toString(36)
    .toUpperCase()
    .padStart(5, '0');
  return `F-${ts}${rnd}`;
}

export async function saveFine(input: CreateFineInput): Promise<Fine> {
  const fine: Fine = {
    id: genId(),
    created_at: Date.now(),
    controller_id: input.controller_id,
    controller_serial: input.controller_serial,
    route_id: input.route_id,
    ticket_id: input.ticket_id,
    offender_name: input.offender_name,
    offender_phone: input.offender_phone,
    offender_user_id: input.offender_user_id,
    doc_type: input.doc_type,
    doc_number: input.doc_number,
    reason: input.reason,
    base_fare_kopecks: input.base_fare_kopecks,
    fine_amount_kopecks: calculateFineKopecks(input.base_fare_kopecks),
    location_note: input.location_note,
    status: 'issued',
    synced_at: null,
    server_id: null,
    inspection_session_id: input.inspection_session_id ?? null,
  };

  const db = getDb();
  await db.execute(
    `INSERT INTO fines
     (id, created_at, controller_id, controller_serial, route_id, ticket_id, offender_name,
      offender_phone, offender_user_id, doc_type, doc_number, reason,
      base_fare_kopecks, fine_amount_kopecks, location_note, status, synced_at, server_id,
      inspection_session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fine.id, fine.created_at, fine.controller_id, fine.controller_serial, fine.route_id, fine.ticket_id,
      fine.offender_name, fine.offender_phone, fine.offender_user_id,
      fine.doc_type, fine.doc_number, fine.reason,
      fine.base_fare_kopecks, fine.fine_amount_kopecks,
      fine.location_note, fine.status, fine.synced_at, fine.server_id,
      fine.inspection_session_id,
    ],
  );

  void submitFineToBackend(fine).catch(() => undefined);

  return fine;
}

const FINE_SELECT = `id, created_at, controller_id, controller_serial, route_id, ticket_id,
        offender_name, offender_phone, offender_user_id, doc_type, doc_number, reason,
        base_fare_kopecks, fine_amount_kopecks, location_note, status, synced_at, server_id,
        inspection_session_id`;

export async function listFines(controllerId: string | null, limit = 50): Promise<Fine[]> {
  const db = getDb();
  const res = await db.execute(
    `SELECT ${FINE_SELECT}
     FROM fines
     WHERE controller_id IS ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [controllerId, limit],
  );
  return (res.rows ?? []).map(rowToFine);
}

export async function getFine(id: string): Promise<Fine | null> {
  const db = getDb();
  const res = await db.execute(
    `SELECT ${FINE_SELECT} FROM fines WHERE id = ?`,
    [id],
  );
  const row = res.rows?.[0];
  return row ? rowToFine(row) : null;
}

/**
 * Досилає на бекенд усі постанови, які ще не синхронізовані (offline-черга).
 * Ідемпотентно: бекенд повертає ту саму постанову за id без помилки.
 * Викликається із offline-sync при відновленні звʼязку і на старті застосунку.
 */
export async function syncPendingFines(): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `SELECT ${FINE_SELECT} FROM fines WHERE synced_at IS NULL ORDER BY created_at ASC LIMIT 200`,
  );
  const pending = (res.rows ?? []).map(rowToFine);
  let ok = 0;
  for (const fine of pending) {
    try {
      await submitFineToBackend(fine);
      ok += 1;
    } catch {
      // немає звʼязку / бекенд недоступний — спробуємо наступного разу
      break;
    }
  }
  return ok;
}

function rowToFine(r: Record<string, unknown>): Fine {
  return {
    id: String(r.id),
    created_at: Number(r.created_at),
    controller_id: r.controller_id != null ? String(r.controller_id) : null,
    controller_serial: String(r.controller_serial),
    route_id: r.route_id != null ? String(r.route_id) : null,
    ticket_id: r.ticket_id != null ? String(r.ticket_id) : null,
    offender_name: String(r.offender_name),
    offender_phone: r.offender_phone != null ? String(r.offender_phone) : null,
    offender_user_id: r.offender_user_id != null ? String(r.offender_user_id) : null,
    doc_type: r.doc_type as FineDocType,
    doc_number: String(r.doc_number),
    reason: r.reason as FineReason,
    base_fare_kopecks: Number(r.base_fare_kopecks),
    fine_amount_kopecks: Number(r.fine_amount_kopecks),
    location_note: r.location_note != null ? String(r.location_note) : null,
    status: r.status as FineStatus,
    synced_at: r.synced_at != null ? Number(r.synced_at) : null,
    server_id: r.server_id != null ? String(r.server_id) : null,
    inspection_session_id:
      r.inspection_session_id != null ? String(r.inspection_session_id) : null,
  };
}

/** Відправляє постанову на бекенд і оновлює synced_at в SQLite. */
async function submitFineToBackend(fine: Fine): Promise<void> {
  await api('/api/v1/inspector/fines', {
    method: 'POST',
    body: JSON.stringify({
      id: fine.id,
      controller_serial: fine.controller_serial,
      route_id: fine.route_id,
      ticket_id: fine.ticket_id,
      offender_name: fine.offender_name,
      offender_phone: fine.offender_phone,
      offender_user_id: fine.offender_user_id,
      doc_type: fine.doc_type,
      doc_number: fine.doc_number,
      reason: fine.reason,
      base_fare_kopecks: fine.base_fare_kopecks,
      fine_amount_kopecks: fine.fine_amount_kopecks,
      location_note: fine.location_note,
      inspection_session_id: fine.inspection_session_id,
    }),
  });
  const db = getDb();
  await db.execute(
    `UPDATE fines SET synced_at = ?, server_id = ? WHERE id = ?`,
    [Date.now(), fine.id, fine.id],
  );
}

export const FINE_REASON_LABELS: Record<FineReason, string> = {
  no_ticket: 'Безквитковий проїзд',
  expired: 'Прострочений квиток',
  used: 'Квиток уже використано',
  invalid_qr: 'Невалідний QR (підробка)',
  no_concession_doc: 'Не предʼявлено документ на пільгу',
  unpaid_luggage: 'Неоплачений багаж',
};

export const FINE_DOC_LABELS: Record<FineDocType, string> = {
  passport: 'Паспорт',
  id_card: 'ID-картка',
  student: 'Студентський квиток',
  pensioner: 'Пенсійне посвідчення',
  driver_license: 'Водійське посвідчення',
  other: 'Інше',
};
