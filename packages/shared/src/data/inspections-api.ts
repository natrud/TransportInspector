import * as SecureStore from 'expo-secure-store';
import { api } from '../lib/api';
import {
  type BackendReadersState,
  type ReadersState,
  mapReadersState,
} from './readers-api';

export interface InspectorQrCredential {
  qr_code: string;
  masked_code: string;
  issued_at: string;
}

export interface InspectionSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  last_activity_at: string;
  route_number: string;
  vehicle_number: string;
  transport_type: string | null;
  status: 'active' | 'closed' | 'auto_closed';
  close_reason: string | null;
  start_validator_serial: string;
  end_validator_serial: string | null;
  duration_seconds: number;
  checked_total: number;
  valid_count: number;
  invalid_count: number;
  fines_count: number;
  /** Коли перевірка завершиться сама, якщо контролер не закриє її раніше. */
  auto_close_at: string | null;
  /**
   * Стан зчитувачів ТЗ, де йде перевірка. Приходить snake_case'ом з бекенда,
   * але назовні віддаємо вже змаплений camelCase-обʼєкт (як у водія) — картку
   * блокування малюють обидва застосунки однаково.
   */
  readers: ReadersState | null;
}

interface BackendInspectionSession extends Omit<InspectionSession, 'readers'> {
  readers: BackendReadersState | null;
}

function mapInspection(row: BackendInspectionSession): InspectionSession {
  return { ...row, readers: mapReadersState(row.readers) };
}

function qrCacheKey(controllerId: string): string {
  return `transport-inspector.personal-qr.${controllerId}`;
}

export async function getInspectorQr(controllerId: string): Promise<InspectorQrCredential> {
  try {
    const value = await api<InspectorQrCredential>('/api/v1/inspector/qr');
    await SecureStore.setItemAsync(qrCacheKey(controllerId), JSON.stringify(value));
    return value;
  } catch (error) {
    const cached = await SecureStore.getItemAsync(qrCacheKey(controllerId));
    if (cached) {
      try {
        return JSON.parse(cached) as InspectorQrCredential;
      } catch {
        // Пошкоджений кеш не приховує справжню помилку API.
      }
    }
    throw error;
  }
}

export async function rotateInspectorQr(controllerId: string): Promise<InspectorQrCredential> {
  const value = await api<InspectorQrCredential>('/api/v1/inspector/qr/rotate', {
    method: 'POST',
  });
  await SecureStore.setItemAsync(qrCacheKey(controllerId), JSON.stringify(value));
  return value;
}

export async function getCurrentInspection(): Promise<InspectionSession | null> {
  const data = await api<BackendInspectionSession | null>('/api/v1/inspector/inspection/current');
  return data ? mapInspection(data) : null;
}

export async function listInspections(limit = 30): Promise<InspectionSession[]> {
  const rows = await api<BackendInspectionSession[]>(
    `/api/v1/inspector/inspections?limit=${limit}`,
  );
  return rows.map((row) => mapInspection(row));
}

export async function closeCurrentInspection(reason = 'manual'): Promise<InspectionSession> {
  const data = await api<BackendInspectionSession>('/api/v1/inspector/inspection/current/close', {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return mapInspection(data);
}
