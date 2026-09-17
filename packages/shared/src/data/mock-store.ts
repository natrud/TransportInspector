import type { Route, Ticket } from '../types/ticket';
import { TicketFareType, TicketStatus } from '../types/ticket';

/**
 * In-memory mock store. Тримає квитки, маршрути, прогенеровані live-активності.
 * Підмінюється на реальний API без зміни UI-шару — усе ходить через api()
 * у data/*-api.ts.
 */

const NOW = Date.now();

export const MOCK_ROUTES: Route[] = [
  { id: 'route-5a', code: '5А', name: 'Вокзал — Гідропарк', transport: 'trolley' },
  { id: 'route-23', code: '23', name: 'Площа Незалежності — Троєщина', transport: 'minibus' },
  { id: 'route-m1', code: 'М1', name: 'Академмістечко — Лісова', transport: 'metro' },
  { id: 'route-12', code: '12', name: 'Контрактова площа — Пуща-Водиця', transport: 'tram' },
  { id: 'route-101', code: '101', name: 'Кільце-Південне', transport: 'bus' },
];

function isoFromNow(deltaMs: number): string {
  return new Date(NOW + deltaMs).toISOString();
}

const HOUR = 60 * 60_000;
const MIN = 60_000;

/**
 * Початковий набір квитків. Покриває всі статуси і випадки для ручного
 * тестування сканера:
 *   - active: щойно валідований, active_until у майбутньому
 *   - issued + valid hash: ще не сканований, готовий до першої валідації
 *   - issued + valid hash, free: пільговий квиток
 *   - issued + invalid hash: emulates пiдробка (hash mismatch)
 *   - used: active_until у минулому
 *   - expired: created_at + use_by_days у минулому
 */
export const MOCK_TICKETS: Ticket[] = [
  {
    id: 'tkt0001active',
    order_id: 'ord-0001',
    user_id: 'user-0001-aaaa-bbbb-cccc-000000000001',
    transport: 'bus',
    price: 1500,
    status: TicketStatus.active,
    fare_type: TicketFareType.paid,
    created_at: isoFromNow(-2 * HOUR),
    use_by_days: 30,
    validated_at: isoFromNow(-15 * MIN),
    active_until: isoFromNow(45 * MIN),
    validated_serial_number: 'VAL-001',
    validated_door_number: 1,
    validation_method: 'qr',
    validation_card_hash: 'hash-tkt0001-active',
    department_id: 'dept-kyiv-1',
  },
  {
    id: 'tkt0002issued',
    order_id: 'ord-0002',
    user_id: 'user-0002-aaaa-bbbb-cccc-000000000002',
    transport: 'trolley',
    price: 1500,
    status: TicketStatus.issued,
    fare_type: TicketFareType.paid,
    created_at: isoFromNow(-1 * HOUR),
    use_by_days: 30,
    validated_at: null,
    active_until: null,
    validated_serial_number: null,
    validated_door_number: null,
    validation_method: null,
    validation_card_hash: 'hash-tkt0002-paid',
    department_id: 'dept-kyiv-1',
  },
  {
    id: 'tkt0003free00',
    order_id: 'ord-0003',
    user_id: 'user-0003-aaaa-bbbb-cccc-000000000003',
    transport: 'tram',
    price: 0,
    status: TicketStatus.issued,
    fare_type: TicketFareType.free,
    created_at: isoFromNow(-3 * HOUR),
    use_by_days: 30,
    validated_at: null,
    active_until: null,
    validated_serial_number: null,
    validated_door_number: null,
    validation_method: null,
    validation_card_hash: 'hash-tkt0003-free',
    department_id: 'dept-kyiv-1',
  },
  {
    id: 'tkt0004fake00',
    order_id: 'ord-0004',
    user_id: 'user-0004-aaaa-bbbb-cccc-000000000004',
    transport: 'metro',
    price: 1500,
    status: TicketStatus.issued,
    fare_type: TicketFareType.paid,
    created_at: isoFromNow(-30 * MIN),
    use_by_days: 30,
    validated_at: null,
    active_until: null,
    validated_serial_number: null,
    validated_door_number: null,
    validation_method: null,
    validation_card_hash: 'hash-tkt0004-real',
    department_id: 'dept-kyiv-1',
  },
  {
    id: 'tkt0005used00',
    order_id: 'ord-0005',
    user_id: 'user-0005-aaaa-bbbb-cccc-000000000005',
    transport: 'bus',
    price: 1500,
    status: TicketStatus.used,
    fare_type: TicketFareType.paid,
    created_at: isoFromNow(-5 * HOUR),
    use_by_days: 30,
    validated_at: isoFromNow(-4 * HOUR),
    active_until: isoFromNow(-3 * HOUR),
    validated_serial_number: 'VAL-002',
    validated_door_number: 2,
    validation_method: 'qr',
    validation_card_hash: 'hash-tkt0005-used',
    department_id: 'dept-kyiv-1',
  },
  {
    id: 'tkt0006expir',
    order_id: 'ord-0006',
    user_id: 'user-0006-aaaa-bbbb-cccc-000000000006',
    transport: 'minibus',
    price: 1500,
    status: TicketStatus.expired,
    fare_type: TicketFareType.paid,
    created_at: isoFromNow(-45 * 24 * HOUR),
    use_by_days: 30,
    validated_at: null,
    active_until: null,
    validated_serial_number: null,
    validated_door_number: null,
    validation_method: null,
    validation_card_hash: 'hash-tkt0006-expired',
    department_id: 'dept-kyiv-1',
  },
];

/**
 * Внутрішнє сховище — копія MOCK_TICKETS, в яку валідації пишуть.
 * Reset на холодний старт застосунку (in-memory only).
 */
const ticketStore = new Map<string, Ticket>();

export function getTicketStore(): Map<string, Ticket> {
  if (ticketStore.size === 0) {
    for (const t of MOCK_TICKETS) ticketStore.set(t.id, { ...t });
  }
  return ticketStore;
}

export function findTicket(id: string): Ticket | null {
  return getTicketStore().get(id) ?? null;
}

export function saveTicket(ticket: Ticket): void {
  getTicketStore().set(ticket.id, { ...ticket });
}

/** Скинути store до початкового набору — для тестів. */
export function resetMockStore(): void {
  ticketStore.clear();
}
