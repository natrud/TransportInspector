import type {
  QrPayload,
  RouteActivityEntry,
  Ticket,
  ValidationResult,
} from '../types/ticket';
import { TicketFareType, TicketStatus } from '../types/ticket';
import type { ValidationMethod } from '../types/ticket';
import { api, ApiError } from '../lib/api';

export interface ValidateTicketRequest {
  qr: QrPayload;
  /** GID контролера, що сканує. */
  serialNumber: string;
  /** Маршрут інспектора (для аудиту). */
  routeId: string | null;
  /** Номер дверей валідатора. Інспектор зазвичай 0. */
  doorNumber: number | null;
  /** true — ID введено вручну, false/undefined — скановано QR камерою. */
  manual?: boolean;
  /** Сире відскановане/введене значення — для журналу дій контролера. */
  rawQr?: string | null;
  /** Session snapshot keeps delayed offline audit attached to the correct inspection. */
  inspectionSessionId?: string | null;
}

interface BackendTicketOut {
  id: string;
  transport: string;
  price: number;
  status: string;
  purchased_at: string;
  valid_window_minutes: number;
  use_by_days: number;
  validated_at: string | null;
  active_until: string | null;
  fare_type: string | null;
  validated_serial_number: string | null;
  validated_door_number: number | null;
  validation_method: string | null;
}

function mapBackendTicket(b: BackendTicketOut): Ticket {
  return {
    id: b.id,
    order_id: '',
    user_id: '',
    transport: b.transport,
    price: b.price,
    status: b.status as TicketStatus,
    fare_type: (b.fare_type as TicketFareType) ?? TicketFareType.paid,
    created_at: b.purchased_at,
    use_by_days: b.use_by_days,
    validated_at: b.validated_at,
    active_until: b.active_until,
    validated_serial_number: b.validated_serial_number,
    validated_door_number: b.validated_door_number,
    validation_method: (b.validation_method as ValidationMethod) ?? null,
    validation_card_hash: null,
    department_id: null,
  };
}

/**
 * Перевірка квитка інспектором через GET /api/v1/tickets/inspector/{ticket_id}.
 * Бекенд не перевіряє user_id — повертає статус квитка будь-якого пасажира.
 */
export async function validateTicket(req: ValidateTicketRequest): Promise<ValidationResult> {
  // Query-параметри йдуть у журнал дій контролера на бекенді (controller_action_log):
  // фіксується КОЖНА спроба, у т.ч. коли квитка немає в системі (404).
  const params = new URLSearchParams();
  if (req.serialNumber && req.serialNumber !== 'UNKNOWN') params.set('serial', req.serialNumber);
  if (req.routeId) params.set('route_id', req.routeId);
  if (req.doorNumber != null) params.set('door', String(req.doorNumber));
  if (req.manual) params.set('manual', 'true');
  const scanned = req.rawQr ?? req.qr.ticket_id;
  if (scanned) params.set('scanned_value', scanned);
  const qs = params.toString();

  const suffix = qs ? '?' + qs : '';
  let backendTicket: BackendTicketOut;
  try {
    backendTicket = await api<BackendTicketOut>(
      `/api/v1/tickets/inspector/${req.qr.ticket_id}${suffix}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return { kind: 'invalid', reason: 'not-found', ticket: null, message: 'Квиток не знайдено в системі' };
    }
    throw err;
  }

  const ticket = mapBackendTicket(backendTicket);
  const now = Date.now();
  const activeUntilMs = ticket.active_until ? Date.parse(ticket.active_until) : null;

  if (ticket.status === TicketStatus.expired) {
    return { kind: 'invalid', reason: 'expired', ticket, message: `Квиток прострочено (термін придатності ${ticket.use_by_days} днів)` };
  }

  if (ticket.status === TicketStatus.used) {
    return { kind: 'invalid', reason: 'used', ticket, message: 'Квиток вже використаний (активне вікно вийшло)' };
  }

  if (ticket.status === TicketStatus.issued) {
    return { kind: 'invalid', reason: 'not-active', ticket, message: 'Квиток не активований пасажиром (не відсканований у валідаторі)' };
  }

  if (ticket.status === TicketStatus.active) {
    if (activeUntilMs !== null && activeUntilMs <= now) {
      return { kind: 'invalid', reason: 'used', ticket, message: 'Активне вікно квитка вичерпано' };
    }
    return { kind: 'valid', ticket };
  }

  return { kind: 'invalid', reason: 'unknown', ticket, message: 'Невідомий статус квитка' };
}


export interface RouteActivityResponse {
  entries: RouteActivityEntry[];
  totalToday: number;
  paidToday: number;
  freeToday: number;
  totalSince: number;
}

interface BackendRouteActivity {
  entries: Array<{
    id: string;
    validated_at: string;
    transport: string;
    fare_type: string;
    price: number;
    validated_door_number: number | null;
    validation_method: string | null;
  }>;
  total_today: number;
  paid_today: number;
  free_today: number;
  total_since: number;
}

/**
 * Реальна стрічка валідованих квитків на маршруті водія.
 * Фільтрує за validator_controllers.route_number (не за TransportRoute) —
 * GET /api/v1/inspector/route-activity.
 *
 * sinceMs, якщо передано (напр. час старту рейсу) — і жива стрічка, і
 * totalSince рахуються від цього моменту; без sinceMs бекенд бере останню годину.
 * vehicleNumber — уточнюючий фільтр у межах route_number (конкретне ТЗ).
 */
export async function getRouteActivity(
  routeId: string,
  sinceMs?: number | null,
  vehicleNumber?: string | null,
): Promise<RouteActivityResponse> {
  // Без transport — route_number(+vehicle_number) вже однозначно визначає
  // валідатор через serial_number, тож зайвий фільтр по типу транспорту
  // раніше відсікав усі квитки на тролейбусах/маршрутках (бекенд завжди
  // порівнював з хардкодженим 'bus').
  const params = new URLSearchParams({
    route_number: routeId,
    limit: '200',
  });
  if (sinceMs) params.set('since_ms', String(sinceMs));
  if (vehicleNumber) params.set('vehicle_number', vehicleNumber);

  const data = await api<BackendRouteActivity>(
    `/api/v1/inspector/route-activity?${params.toString()}`,
  );

  const entries: RouteActivityEntry[] = data.entries.map((e) => ({
    id: e.id,
    validated_at: e.validated_at,
    transport: e.transport,
    fare_type: e.fare_type as TicketFareType,
    price: e.price,
    validated_door_number: e.validated_door_number,
    validation_method: e.validation_method as ValidationMethod | null,
  }));

  return {
    entries,
    totalToday: data.total_today,
    paidToday: data.paid_today,
    freeToday: data.free_today,
    totalSince: data.total_since,
  };
}

/** @deprecated — більше не використовується, залишено для сумісності */
export function resetActivityLog(): void {}
