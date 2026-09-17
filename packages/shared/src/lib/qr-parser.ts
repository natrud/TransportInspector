import type { QrPayload } from '../types/ticket';

/**
 * Толерантний парсер QR-коду квитка. Підтримує три формати, у порядку
 * пріоритету:
 *   1. JSON: {"ticket_id": "...", "hash": "..."} (також ключі "id" і "h")
 *   2. id:hash рядок (двокрапка-роздільник)
 *   3. Голий ticket.id (legacy / fallback)
 *
 * Якщо payload не виглядає як валідний ticket_id (порожній або забагато
 * довгий) — повертає null. Подальшу перевірку (404, hash mismatch) робить
 * бекенд.
 */

const MAX_TICKET_ID_LEN = 16;
const MAX_HASH_LEN = 64;
// ticket_id у бекенді — UUID hex[:16] → допускаємо hex + dash для legacy UUID.
const TICKET_ID_PATTERN = /^[a-zA-Z0-9-]{6,16}$/;

export function parseQrPayload(raw: string | null | undefined): QrPayload | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. JSON
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const ticketIdRaw = obj.ticket_id ?? obj.id ?? obj.ticketId;
      const hashRaw = obj.hash ?? obj.h ?? obj.validation_card_hash ?? null;
      const ticketId = typeof ticketIdRaw === 'string' ? ticketIdRaw.trim() : null;
      const hash = typeof hashRaw === 'string' ? hashRaw.trim() : null;
      if (!ticketId || !TICKET_ID_PATTERN.test(ticketId)) return null;
      if (hash && hash.length > MAX_HASH_LEN) return null;
      return { ticket_id: ticketId, hash: hash && hash.length > 0 ? hash : null };
    } catch {
      return null;
    }
  }

  // 2. id:hash
  if (trimmed.includes(':')) {
    const [idPart, hashPart, ...rest] = trimmed.split(':');
    if (rest.length > 0) return null;
    const ticketId = idPart?.trim() ?? '';
    const hash = hashPart?.trim() ?? '';
    if (!TICKET_ID_PATTERN.test(ticketId)) return null;
    if (hash.length > MAX_HASH_LEN) return null;
    return { ticket_id: ticketId, hash: hash.length > 0 ? hash : null };
  }

  // 3. Голий ticket_id
  if (trimmed.length > MAX_TICKET_ID_LEN) return null;
  if (!TICKET_ID_PATTERN.test(trimmed)) return null;
  return { ticket_id: trimmed, hash: null };
}
