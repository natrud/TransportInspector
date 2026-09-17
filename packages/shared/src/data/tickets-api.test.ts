import { beforeEach, describe, expect, it, vi } from 'vitest';

// Ізолюємо тест від реального lib/api (а разом з ним — від expo-constants,
// який тягне Flow-синтаксис і не парситься у node-середовищі vitest).
vi.mock('../lib/api', () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }
  return { api: vi.fn(), ApiError };
});

import { api, ApiError } from '../lib/api';
import { validateTicket, type ValidateTicketRequest } from './tickets-api';

const apiMock = vi.mocked(api);

const baseReq: Omit<ValidateTicketRequest, 'qr'> = {
  serialNumber: 'INS-test',
  routeId: 'route-5a',
  doorNumber: 0,
};

function req(ticketId: string, extra: Partial<ValidateTicketRequest> = {}): ValidateTicketRequest {
  return { ...baseReq, qr: { ticket_id: ticketId, hash: null }, ...extra };
}

function backendTicket(over: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Date.now();
  return {
    id: 'tkt0000000000001',
    transport: 'bus',
    price: 800,
    status: 'active',
    purchased_at: new Date(now - 3_600_000).toISOString(),
    valid_window_minutes: 60,
    use_by_days: 15,
    validated_at: new Date(now - 600_000).toISOString(),
    active_until: new Date(now + 1_800_000).toISOString(),
    fare_type: 'paid',
    validated_serial_number: 'GID-1',
    validated_door_number: 0,
    validation_method: 'qr',
    ...over,
  };
}

beforeEach(() => {
  apiMock.mockReset();
});

describe('validateTicket', () => {
  it('not-found коли бекенд віддає 404', async () => {
    apiMock.mockRejectedValueOnce(new ApiError(404, null, '404 Not Found'));
    const res = await validateTicket(req('nonexistent'));
    expect(res.kind).toBe('invalid');
    if (res.kind === 'invalid') {
      expect(res.reason).toBe('not-found');
      expect(res.ticket).toBeNull();
    }
  });

  it('прокидає не-404 помилки далі (напр. 500)', async () => {
    apiMock.mockRejectedValueOnce(new ApiError(500, null, '500'));
    await expect(validateTicket(req('boom'))).rejects.toBeInstanceOf(ApiError);
  });

  it('valid для active квитка у валідному вікні', async () => {
    apiMock.mockResolvedValueOnce(backendTicket({ status: 'active' }));
    const res = await validateTicket(req('tkt0000000000001'));
    expect(res.kind).toBe('valid');
  });

  it('used коли active_until у минулому', async () => {
    apiMock.mockResolvedValueOnce(
      backendTicket({ status: 'active', active_until: new Date(Date.now() - 1000).toISOString() }),
    );
    const res = await validateTicket(req('tkt0000000000001'));
    expect(res.kind).toBe('invalid');
    if (res.kind === 'invalid') expect(res.reason).toBe('used');
  });

  it('expired для квитка зі статусом expired', async () => {
    apiMock.mockResolvedValueOnce(backendTicket({ status: 'expired', active_until: null }));
    const res = await validateTicket(req('tkt0000000000001'));
    expect(res.kind).toBe('invalid');
    if (res.kind === 'invalid') expect(res.reason).toBe('expired');
  });

  it('used для квитка зі статусом used', async () => {
    apiMock.mockResolvedValueOnce(backendTicket({ status: 'used' }));
    const res = await validateTicket(req('tkt0000000000001'));
    expect(res.kind).toBe('invalid');
    if (res.kind === 'invalid') expect(res.reason).toBe('used');
  });

  it('not-active для issued (пасажир не активував)', async () => {
    apiMock.mockResolvedValueOnce(
      backendTicket({ status: 'issued', validated_at: null, active_until: null }),
    );
    const res = await validateTicket(req('tkt0000000000001'));
    expect(res.kind).toBe('invalid');
    if (res.kind === 'invalid') expect(res.reason).toBe('not-active');
  });
});

describe('журнал дій контролера — query-параметри', () => {
  it('передає serial / route_id / manual / scanned_value у бекенд', async () => {
    apiMock.mockResolvedValueOnce(backendTicket());
    await validateTicket(req('tkt0000000000001', { manual: true, rawQr: 'RAW-QR-VALUE' }));

    expect(apiMock).toHaveBeenCalledTimes(1);
    const url = String(apiMock.mock.calls[0]?.[0]);
    expect(url).toContain('/api/v1/tickets/inspector/tkt0000000000001?');
    expect(url).toContain('serial=INS-test');
    expect(url).toContain('route_id=route-5a');
    expect(url).toContain('manual=true');
    expect(url).toContain('scanned_value=RAW-QR-VALUE');
  });

  it('не шле serial=UNKNOWN і не шле manual для звичайного скану', async () => {
    apiMock.mockResolvedValueOnce(backendTicket());
    await validateTicket(req('tkt0000000000001', { serialNumber: 'UNKNOWN', routeId: null }));

    const url = String(apiMock.mock.calls[0]?.[0]);
    expect(url).not.toContain('serial=');
    expect(url).not.toContain('manual=');
    expect(url).not.toContain('route_id=');
  });
});
