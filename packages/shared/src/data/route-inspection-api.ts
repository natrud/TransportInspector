import { api } from '../lib/api';
import {
  type BackendReadersState,
  type ReadersState,
  mapReadersState,
} from './readers-api';

export type RouteInspectionState = 'active' | 'recently_ended' | 'none';

export interface RouteInspection {
  state: RouteInspectionState;
  source: 'inspection_session' | 'action_log' | null;
  inspectionSessionId: string | null;
  inspectorName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  lastActivityAt: string | null;
  durationSeconds: number;
  checkedTotal: number;
  validCount: number;
  invalidCount: number;
  finesCount: number;
  /** Коли перевірка завершиться сама, якщо її не закриють раніше. */
  autoCloseAt: string | null;
  /** Стан зчитувачів того самого маршруту/ТЗ — приходить тим самим polling'ом. */
  readers: ReadersState | null;
}

interface BackendRouteInspection {
  state: RouteInspectionState;
  source: 'inspection_session' | 'action_log' | null;
  inspection_session_id: string | null;
  inspector_name: string | null;
  started_at: string | null;
  ended_at: string | null;
  last_activity_at: string | null;
  duration_seconds: number;
  checked_total: number;
  valid_count: number;
  invalid_count: number;
  fines_count: number;
  auto_close_at: string | null;
  readers: BackendReadersState | null;
}

function mapBackend(b: BackendRouteInspection): RouteInspection {
  return {
    state: b.state,
    source: b.source,
    inspectionSessionId: b.inspection_session_id,
    inspectorName: b.inspector_name,
    startedAt: b.started_at,
    endedAt: b.ended_at,
    lastActivityAt: b.last_activity_at,
    durationSeconds: b.duration_seconds ?? 0,
    checkedTotal: b.checked_total ?? 0,
    validCount: b.valid_count ?? 0,
    invalidCount: b.invalid_count ?? 0,
    finesCount: b.fines_count ?? 0,
    autoCloseAt: b.auto_close_at ?? null,
    readers: mapReadersState(b.readers),
  };
}

/**
 * GET /api/v1/driver/route-inspection — чи працює контролер на маршруті водія
 * (inspection_sessions, з фолбеком на свіжі дії з controller_action_log) +
 * статистика його дій за перевірку.
 */
export async function getRouteInspection(
  routeNumber: string,
  vehicleNumber?: string | null,
): Promise<RouteInspection> {
  const params = new URLSearchParams({ route_number: routeNumber });
  if (vehicleNumber) params.set('vehicle_number', vehicleNumber);
  const data = await api<BackendRouteInspection>(
    `/api/v1/driver/route-inspection?${params.toString()}`,
  );
  return mapBackend(data);
}

/**
 * POST /api/v1/driver/route-inspection/close — водій вручну завершує перевірку
 * контролера на своєму маршруті (якщо контролер забув завершити).
 */
export async function closeRouteInspection(
  routeNumber: string,
  vehicleNumber?: string | null,
): Promise<RouteInspection> {
  const data = await api<BackendRouteInspection>('/api/v1/driver/route-inspection/close', {
    method: 'POST',
    body: JSON.stringify({
      route_number: routeNumber,
      vehicle_number: vehicleNumber ?? null,
    }),
  });
  return mapBackend(data);
}
