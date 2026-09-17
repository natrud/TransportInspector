import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadTokens = vi.fn();
vi.mock('./auth', () => ({ loadTokens }));
vi.mock('./clock-drift', () => ({ recordServerTime: vi.fn() }));
vi.mock('./etag-cache', () => ({ getCachedEtag: vi.fn(), setCachedEtag: vi.fn() }));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { apiBaseUrl: 'https://api.test' } } },
}));

const { api, ApiError } = await import('./api');
const { consumeSessionExpired, onUnauthorized, resetSessionExpired } = await import('./auth-events');

function respond(status: number, body: unknown = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      statusText: status === 401 ? 'Unauthorized' : 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(body)),
    }),
  );
}

beforeEach(() => {
  loadTokens.mockReset().mockResolvedValue({ accessToken: 'dead-token' });
  resetSessionExpired();
});

describe('401 на робочому запиті', () => {
  it('піднімає сигнал протухлої сесії', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    respond(401, { detail: 'Invalid or expired token' });

    await expect(api('/api/v1/inspector/inspection/current')).rejects.toBeInstanceOf(ApiError);

    expect(listener).toHaveBeenCalledOnce();
    expect(consumeSessionExpired()).toBe(true);
    off();
  });

  it('прапорець одноразовий — повідомлення не висітиме назавжди', async () => {
    respond(401);
    await expect(api('/api/v1/driver/controller-calls')).rejects.toThrow();

    expect(consumeSessionExpired()).toBe(true);
    expect(consumeSessionExpired()).toBe(false);
  });
});

describe('401 на самому логіні', () => {
  it('це просто невірний пароль — сесію чіпати не можна', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    respond(401, { detail: 'bad credentials' });

    await expect(
      api('/api/v1/auth/login', { method: 'POST', body: '{}' }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(listener).not.toHaveBeenCalled();
    expect(consumeSessionExpired()).toBe(false);
    off();
  });
});

describe('запити самого входу', () => {
  it('skipAuthExpiry глушить сигнал — 401 від /profile/me посеред входу не зносить кеш', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    respond(401);

    await expect(
      api('/api/v1/profile/me', { skipAuthExpiry: true }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(listener).not.toHaveBeenCalled();
    expect(consumeSessionExpired()).toBe(false);
    off();
  });

  it('без прапорця той самий запит сигнал піднімає', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    respond(401);

    await expect(api('/api/v1/profile/me')).rejects.toThrow();

    expect(listener).toHaveBeenCalledOnce();
    off();
  });
});

describe('інші відповіді', () => {
  it('403 не розлогінює — це питання прав, а не токена', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    respond(403);

    await expect(api('/api/v1/inspector/fines')).rejects.toThrow();

    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it('успішна відповідь нічого не піднімає', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    respond(200, { ok: true });

    await expect(api('/api/v1/settings/me')).resolves.toEqual({ ok: true });

    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it('відписка працює', async () => {
    const listener = vi.fn();
    onUnauthorized(listener)();
    respond(401);

    await expect(api('/api/v1/inspector/inspection/current')).rejects.toThrow();

    expect(listener).not.toHaveBeenCalled();
  });
});
