import * as SecureStore from 'expo-secure-store';
import { api } from './api';

const LOCAL_KEY = 'transport-inspector.settings';

export interface AppSettings {
  pollIntervalMs: number;
  hapticsEnabled: boolean;
  lastSelectedRouteId: string | null;
  baseFareKopecks: number;
  passengerCounterEnabled: boolean;
  comparisonWindowMs: number;
  rapidScanEnabled: boolean;
}

/**
 * Нижня межа опитування — 1 с.
 *
 * Стільки можна тримати лише тому, що GET /api/v1/inspector/route-activity
 * спершу рахує дешевий маркер стану (COUNT + MAX по індексу) і на незмінних
 * даних повертає 304 без тіла. Автобус валідує квиток раз на кілька секунд,
 * тож на секундному опитуванні майже всі відповіді — 304.
 *
 * Інші опитувачі на 1 с не переходять: статус контролера має власну нижню
 * межу 5 с (useRouteInspection), виклики контролера — фіксовані 8 с.
 */
export const MIN_POLL_INTERVAL_MS = 1_000;
export const MAX_POLL_INTERVAL_MS = 5 * 60_000;
export const MIN_BASE_FARE_KOPECKS = 100;
export const MAX_BASE_FARE_KOPECKS = 10_000;
export const COMPARISON_WINDOW_OPTIONS_MS = [30 * 60_000, 45 * 60_000, 60 * 60_000] as const;
export const MIN_COMPARISON_WINDOW_MS = 30 * 60_000;
export const MAX_COMPARISON_WINDOW_MS = 60 * 60_000;
export const defaultSettings: AppSettings = {
  pollIntervalMs: 15_000,
  hapticsEnabled: true,
  lastSelectedRouteId: null,
  baseFareKopecks: 1500,
  passengerCounterEnabled: true,
  comparisonWindowMs: 30 * 60_000,
  rapidScanEnabled: false,
};

function clampPollInterval(ms: number): number {
  if (!Number.isFinite(ms)) return defaultSettings.pollIntervalMs;
  return Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, Math.round(ms)));
}

function clampBaseFare(kopecks: number): number {
  if (!Number.isFinite(kopecks)) return defaultSettings.baseFareKopecks;
  return Math.min(MAX_BASE_FARE_KOPECKS, Math.max(MIN_BASE_FARE_KOPECKS, Math.round(kopecks)));
}

function clampComparisonWindow(ms: number): number {
  if (!Number.isFinite(ms)) return defaultSettings.comparisonWindowMs;
  return Math.min(MAX_COMPARISON_WINDOW_MS, Math.max(MIN_COMPARISON_WINDOW_MS, Math.round(ms)));
}

interface BackendSettings {
  poll_interval_ms: number;
  comparison_window_ms: number;
  haptics_enabled: boolean;
  passenger_counter_enabled: boolean;
  rapid_scan_enabled: boolean;
  base_fare_kopecks: number;
}

function fromBackend(b: BackendSettings): AppSettings {
  return {
    pollIntervalMs: clampPollInterval(b.poll_interval_ms),
    hapticsEnabled: b.haptics_enabled,
    lastSelectedRouteId: null,
    baseFareKopecks: clampBaseFare(b.base_fare_kopecks),
    passengerCounterEnabled: b.passenger_counter_enabled,
    comparisonWindowMs: clampComparisonWindow(b.comparison_window_ms),
    rapidScanEnabled: b.rapid_scan_enabled,
  };
}

function toBackend(s: Partial<AppSettings>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.pollIntervalMs !== undefined) out.poll_interval_ms = s.pollIntervalMs;
  if (s.hapticsEnabled !== undefined) out.haptics_enabled = s.hapticsEnabled;
  if (s.baseFareKopecks !== undefined) out.base_fare_kopecks = s.baseFareKopecks;
  if (s.passengerCounterEnabled !== undefined) out.passenger_counter_enabled = s.passengerCounterEnabled;
  if (s.comparisonWindowMs !== undefined) out.comparison_window_ms = s.comparisonWindowMs;
  if (s.rapidScanEnabled !== undefined) out.rapid_scan_enabled = s.rapidScanEnabled;
  return out;
}

/**
 * Завантажує налаштування з бекенду (GET /api/v1/settings/me).
 * Якщо токен відсутній або мережа недоступна — повертає local fallback.
 */
export async function loadSettings(): Promise<AppSettings> {
  try {
    const data = await api<BackendSettings>('/api/v1/settings/me');
    const settings = fromBackend(data);
    // Кешуємо локально для офлайн-режиму
    await SecureStore.setItemAsync(LOCAL_KEY, JSON.stringify(settings)).catch(() => {});
    return settings;
  } catch {
    // Fallback — локальний кеш
    try {
      const raw = await SecureStore.getItemAsync(LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        return { ...defaultSettings, ...parsed };
      }
    } catch {}
    return defaultSettings;
  }
}

/**
 * Зберігає налаштування в бекенді (PUT /api/v1/settings/me) і локально.
 */
export async function persistSettings(next: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const merged: AppSettings = {
    ...current,
    ...next,
    pollIntervalMs: clampPollInterval(next.pollIntervalMs ?? current.pollIntervalMs),
    baseFareKopecks: clampBaseFare(next.baseFareKopecks ?? current.baseFareKopecks),
    comparisonWindowMs: clampComparisonWindow(next.comparisonWindowMs ?? current.comparisonWindowMs),
  };

  // Зберігаємо в БД
  try {
    await api('/api/v1/settings/me', {
      method: 'PUT',
      body: JSON.stringify(toBackend(next)),
    });
  } catch {
    // non-critical — офлайн
  }

  // Локальний кеш
  await SecureStore.setItemAsync(LOCAL_KEY, JSON.stringify(merged)).catch(() => {});
  return merged;
}
