import type { TicketFareType, ValidationFailureReason } from '../types/ticket';

/** Двозначне форматування. */
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** ISO → HH:MM:SS у локальному часі пристрою. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** ISO → DD.MM.YYYY HH:MM. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO → "щойно", "5 хв тому", "2 год тому", ISO повний для старішого. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '—';
  const diff = Date.now() - ts;
  if (diff < 0) return formatTime(iso);
  if (diff < 15_000) return 'щойно';
  if (diff < 60_000) return `${Math.floor(diff / 1000)} с тому`;
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} хв тому`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / 60 / 60_000)} год тому`;
  return formatDateTime(iso);
}

/** Ціна у копійках (наприклад 1500) → "15.00 грн". Використовується для штрафів (fine_amount_kopecks, base_fare_kopecks). */
/**
 * Скільки хвилин лишилось до моменту `iso` (0, якщо він уже минув).
 * Використовується для відліку автозавершення перевірки — водій і контролер
 * бачать однакове число.
 */
export function minutesUntil(iso: string | null | undefined, nowMs?: number): number | null {
  if (!iso) return null;
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.ceil((target - (nowMs ?? Date.now())) / 60_000));
}

export function formatPrice(priceMinor: number): string {
  if (!Number.isFinite(priceMinor)) return '—';
  const major = Math.floor(priceMinor / 100);
  const minor = Math.abs(priceMinor % 100);
  return `${major}.${pad(minor)} грн`;
}

/** Ціна квитка вже у гривнях, як зберігає Ticket.price (наприклад 15) → "15 грн". */
export function formatTicketPrice(price: number): string {
  if (!Number.isFinite(price)) return '—';
  return `${price} грн`;
}

const TRANSPORT_LABEL: Record<string, string> = {
  bus: 'Автобус',
  trolley: 'Тролейбус',
  tram: 'Трамвай',
  metro: 'Метро',
  minibus: 'Маршрутка',
};

export function formatTransport(transport: string): string {
  return TRANSPORT_LABEL[transport] ?? transport;
}

const FARE_LABEL: Record<TicketFareType, string> = {
  paid: 'Платний',
  free: 'Безкоштовний',
} as unknown as Record<TicketFareType, string>;

export function formatFareType(fare: TicketFareType): string {
  return FARE_LABEL[fare] ?? String(fare);
}

const REASON_LABEL: Record<ValidationFailureReason, string> = {
  'not-found': 'Не знайдено',
  expired: 'Прострочено',
  used: 'Вже використано',
  'not-active': 'Не активний',
  'hash-mismatch': 'Підроблений QR',
  'route-mismatch': 'Інший маршрут',
  'malformed-qr': 'Не QR квитка',
  offline: 'Немає звʼязку',
  unknown: 'Невідома причина',
};

export function formatReason(reason: ValidationFailureReason): string {
  return REASON_LABEL[reason];
}
