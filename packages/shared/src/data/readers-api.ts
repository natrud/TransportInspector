import { api } from '../lib/api';

/**
 * Блокування зчитувачів (валідаторів) у транспорті на час перевірки.
 *
 * Основний шлях — автоматичний: старт перевірки по особистому QR контролера
 * блокує зчитувачі того ТЗ на боці бекенда (він же їх і розблоковує, коли
 * перевірка завершилась, і страхує watchdog'ом). Застосунки цей стан лише
 * ПОКАЗУЮТЬ — і водію, і контролеру.
 *
 * Ручні команди тут — резервний шлях:
 *   • водій  → POST /api/v1/driver/readers/block | unblock (свій маршрут/ТЗ)
 *   • контролер → POST /api/v1/inspector/inspection/current/readers
 *     (лише в межах своєї активної перевірки — коли автоматика не пройшла).
 */

export type ReadersBlockState = 'blocked' | 'partial' | 'normal' | 'unknown';

/** Хто ініціював блокування — для пояснення у банері. */
export type ReadersBlockSource = 'inspection' | 'driver' | 'controller' | 'admin' | 'watchdog';

export interface ReaderFailure {
  serialNumber: string;
  error: string | null;
}

export interface ReadersState {
  state: ReadersBlockState;
  blocked: boolean;
  total: number;
  blockedCount: number;
  routeNumber: string | null;
  vehicleNumber: string | null;
  source: ReadersBlockSource | null;
  blockedByUserId: string | null;
  inspectionSessionId: string | null;
  blockedAt: string | null;
  blockedSeconds: number;
  /** Скільки лишилось до автоматичного зняття блокування (страховка бекенда). */
  autoUnblockSeconds: number | null;
  error: string | null;
  failed: ReaderFailure[];
}

export interface ReadersCommandResult {
  ok: boolean;
  /** Команду надіслано, але прилад ще не підтвердив — статус дотягне polling. */
  pending: boolean;
  targetBlocked: boolean;
  total: number;
  succeeded: number;
  failed: ReaderFailure[];
  message: string;
  readers: ReadersState;
}

export interface BackendReadersState {
  state: ReadersBlockState;
  blocked: boolean;
  total: number;
  blocked_count: number;
  route_number: string | null;
  vehicle_number: string | null;
  source: ReadersBlockSource | null;
  blocked_by_user_id: string | null;
  inspection_session_id: string | null;
  blocked_at: string | null;
  blocked_seconds: number;
  auto_unblock_seconds: number | null;
  error: string | null;
  failed: { serial_number: string; error: string | null }[];
}

interface BackendReadersCommand {
  ok: boolean;
  pending: boolean;
  target_blocked: boolean;
  total: number;
  succeeded: number;
  failed: { serial_number: string; error: string | null }[];
  message: string;
  readers: BackendReadersState;
}

export function mapReadersState(b: BackendReadersState | null | undefined): ReadersState | null {
  if (!b) return null;
  return {
    state: b.state,
    blocked: !!b.blocked,
    total: b.total ?? 0,
    blockedCount: b.blocked_count ?? 0,
    routeNumber: b.route_number,
    vehicleNumber: b.vehicle_number,
    source: b.source,
    blockedByUserId: b.blocked_by_user_id,
    inspectionSessionId: b.inspection_session_id,
    blockedAt: b.blocked_at,
    blockedSeconds: b.blocked_seconds ?? 0,
    autoUnblockSeconds: b.auto_unblock_seconds ?? null,
    error: b.error,
    failed: (b.failed ?? []).map((f) => ({ serialNumber: f.serial_number, error: f.error })),
  };
}

function mapCommand(b: BackendReadersCommand): ReadersCommandResult {
  return {
    ok: !!b.ok,
    pending: !!b.pending,
    targetBlocked: !!b.target_blocked,
    total: b.total ?? 0,
    succeeded: b.succeeded ?? 0,
    failed: (b.failed ?? []).map((f) => ({ serialNumber: f.serial_number, error: f.error })),
    message: b.message,
    readers: mapReadersState(b.readers) as ReadersState,
  };
}

/** Людський підпис джерела блокування — однаковий в обох застосунках. */
export function formatReadersSource(source: ReadersBlockSource | null): string {
  switch (source) {
    case 'inspection':
      return 'автоматично, на час перевірки';
    case 'driver':
      return 'вручну водієм';
    case 'controller':
      return 'вручну контролером';
    case 'admin':
      return 'диспетчерською';
    case 'watchdog':
      return 'автоматично';
    default:
      return '';
  }
}

export async function getReadersState(
  routeNumber: string,
  vehicleNumber?: string | null,
): Promise<ReadersState> {
  const params = new URLSearchParams({ route_number: routeNumber });
  if (vehicleNumber) params.set('vehicle_number', vehicleNumber);
  const data = await api<BackendReadersState>(`/api/v1/driver/readers?${params.toString()}`);
  return mapReadersState(data) as ReadersState;
}

/** Резервна кнопка водія. */
export async function setRouteReadersBlocked(
  blocked: boolean,
  routeNumber: string,
  vehicleNumber?: string | null,
): Promise<ReadersCommandResult> {
  const data = await api<BackendReadersCommand>(
    `/api/v1/driver/readers/${blocked ? 'block' : 'unblock'}`,
    {
      method: 'POST',
      body: JSON.stringify({
        route_number: routeNumber,
        vehicle_number: vehicleNumber ?? null,
      }),
    },
  );
  return mapCommand(data);
}

/** Повтор команди контролером у межах його активної перевірки. */
export async function setInspectionReadersBlocked(
  blocked: boolean,
): Promise<ReadersCommandResult> {
  const data = await api<BackendReadersCommand>('/api/v1/inspector/inspection/current/readers', {
    method: 'POST',
    body: JSON.stringify({ blocked }),
  });
  return mapCommand(data);
}
