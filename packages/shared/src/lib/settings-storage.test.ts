import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.fn();
const setItemAsync = vi.fn();
const getItemAsync = vi.fn();

vi.mock('./api', () => ({ api, ApiError: class ApiError extends Error {} }));
vi.mock('expo-secure-store', () => ({ setItemAsync, getItemAsync }));

const { MIN_POLL_INTERVAL_MS, defaultSettings, loadSettings, persistSettings } =
  await import('./settings-storage');

const backendRow = {
  poll_interval_ms: 30_000,
  comparison_window_ms: 1_800_000,
  haptics_enabled: false,
  passenger_counter_enabled: false,
  rapid_scan_enabled: true,
  base_fare_kopecks: 2_000,
};

beforeEach(() => {
  api.mockReset();
  setItemAsync.mockReset().mockResolvedValue(undefined);
  getItemAsync.mockReset().mockResolvedValue(null);
});

describe('loadSettings', () => {
  it('бере налаштування з акаунта, а не з дефолтів', async () => {
    api.mockResolvedValue(backendRow);
    const s = await loadSettings();
    expect(api).toHaveBeenCalledWith('/api/v1/settings/me');
    expect(s.pollIntervalMs).toBe(30_000);
    expect(s.hapticsEnabled).toBe(false);
    expect(s.passengerCounterEnabled).toBe(false);
    expect(s.rapidScanEnabled).toBe(true);
    expect(s.baseFareKopecks).toBe(2_000);
  });

  it('офлайн — повертає локальний кеш попереднього входу', async () => {
    api.mockRejectedValue(new Error('offline'));
    getItemAsync.mockResolvedValue(JSON.stringify({ pollIntervalMs: 60_000 }));
    const s = await loadSettings();
    expect(s.pollIntervalMs).toBe(60_000);
    // Решта полів — дефолтні, а не undefined.
    expect(s.hapticsEnabled).toBe(defaultSettings.hapticsEnabled);
  });

  it('офлайн і без кешу — дефолти', async () => {
    api.mockRejectedValue(new Error('offline'));
    await expect(loadSettings()).resolves.toEqual(defaultSettings);
  });
});

describe('persistSettings', () => {
  it('зберігає в акаунт (PUT) у snake_case', async () => {
    api.mockResolvedValue(backendRow);
    await persistSettings({ pollIntervalMs: 10_000 });
    const put = api.mock.calls.find((call) => call[1]?.method === 'PUT');
    expect(put?.[0]).toBe('/api/v1/settings/me');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ poll_interval_ms: 10_000 });
  });

  it('надто малий інтервал підтягується до нижньої межі', async () => {
    api.mockResolvedValue(backendRow);
    const s = await persistSettings({ pollIntervalMs: 50 });
    expect(s.pollIntervalMs).toBe(MIN_POLL_INTERVAL_MS);
  });

  it('вимикачі зберігаються навіть коли значення false', async () => {
    api.mockResolvedValue(backendRow);
    await persistSettings({ passengerCounterEnabled: false, hapticsEnabled: false });
    const put = api.mock.calls.find((call) => call[1]?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({
      passenger_counter_enabled: false,
      haptics_enabled: false,
    });
  });

  it('нижня межа опитування — 1 с', () => {
    expect(MIN_POLL_INTERVAL_MS).toBe(1_000);
  });
});
