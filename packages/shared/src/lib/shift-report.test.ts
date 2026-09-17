import { describe, expect, it, vi } from 'vitest';
import type { ControllerCall } from '../data/support-api';

// buildShiftReport тягне FINE_REASON_LABELS з data/fines-api, а той — lib/api
// (expo-constants) і lib/db (expo-sqlite). У node-середовищі vitest вони не
// парсяться, тож ізолюємо так само, як у tickets-api.test.ts.
vi.mock('../lib/api', () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {},
}));
vi.mock('../lib/db', () => ({ getDb: vi.fn() }));

const { buildShiftReport } = await import('./shift-report');

function call(over: Partial<ControllerCall> = {}): ControllerCall {
  return {
    id: 'c1',
    driverSerial: 'DRV-77',
    routeId: '5А',
    transport: 'bus',
    reason: 'driver_request',
    status: 'pending',
    createdAt: '2026-09-15T08:30:00.000Z',
    etaMinutes: null,
    acceptedAt: null,
    driverDisplayName: 'Петренко Іван',
    driverPhone: '+380501112233',
    acceptedByDisplayName: null,
    acceptedByPhone: null,
    acceptedBySerial: null,
    ...over,
  };
}

const base = {
  controllerSerial: 'INS-001',
  controllerName: 'Марія',
  windowStartMs: Date.parse('2026-09-15T00:00:00.000Z'),
  windowEndMs: Date.parse('2026-09-15T12:00:00.000Z'),
  scans: [],
  fines: [],
};

describe('buildShiftReport — активні виклики', () => {
  it('без викликів секції немає, а лічильник нульовий', () => {
    const text = buildShiftReport(base);
    expect(text).not.toContain('АКТИВНІ ВИКЛИКИ');
    expect(text).toContain('Активних викликів:   0');
  });

  it('виклик у черзі потрапляє у звіт з водієм і статусом', () => {
    const text = buildShiftReport({ ...base, activeCalls: [call()] });
    expect(text).toContain('АКТИВНІ ВИКЛИКИ ВОДІЇВ');
    expect(text).toContain('маршрут 5А — очікує прийняття');
    expect(text).toContain('Петренко Іван');
    expect(text).toContain('+380501112233');
  });

  it('прийнятий виклик показує час прийняття', () => {
    const text = buildShiftReport({
      ...base,
      activeCalls: [call({ status: 'accepted', acceptedAt: '2026-09-15T08:40:00.000Z' })],
    });
    expect(text).toContain('прийнято, в роботі');
    expect(text).toContain('прийнято:');
  });

  it('виклик без маршруту і телефону не ламає звіт', () => {
    const text = buildShiftReport({
      ...base,
      activeCalls: [call({ routeId: null, driverPhone: null, driverDisplayName: null })],
    });
    expect(text).toContain('маршрут не вказано');
    expect(text).toContain("ім'я не вказано");
  });
});
