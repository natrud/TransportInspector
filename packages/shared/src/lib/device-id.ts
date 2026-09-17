import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const DEVICE_ID_KEY = 'transport.deviceId';

export type DevicePlatform = 'ios' | 'android';

/**
 * Тег застосунку для бекенду (UserDevice.app) — визначається з app.json
 * slug, тож той самий спільний код коректно працює і в controller,
 * і в driver, без ручного налаштування per-app.
 */
export type DeviceApp = 'controller' | 'driver';

export interface DeviceContext {
  device_id: string;
  platform: DevicePlatform;
  app: DeviceApp;
}

function resolveApp(): DeviceApp {
  const slug = Constants.expoConfig?.slug ?? '';
  return slug === 'transport-driver' ? 'driver' : 'controller';
}

let deviceIdPromise: Promise<string> | null = null;

function createDeviceId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  const timestamp = Date.now().toString(36);
  const randomPart = [
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2),
  ].join('');
  return `${timestamp}-${randomPart}`;
}

async function loadOrCreateDeviceId(): Promise<string> {
  const stored = (await SecureStore.getItemAsync(DEVICE_ID_KEY)) ?? '';
  if (stored.trim()) return stored.trim();

  const created = createDeviceId();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  return created;
}

export function getDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = loadOrCreateDeviceId().catch((error) => {
      deviceIdPromise = null;
      throw error;
    });
  }
  return deviceIdPromise;
}

export async function getDeviceContext(): Promise<DeviceContext | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;

  try {
    return {
      device_id: await getDeviceId(),
      platform: Platform.OS,
      app: resolveApp(),
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[device-id] Не вдалось завантажити device_id (non-critical):', error);
    return null;
  }
}
