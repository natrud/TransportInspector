import { api } from '../lib/api';

export interface CallControllerRequest {
  driverSerial: string;
  routeId: string;
  transport?: string;
  reason?: string;
}

export interface CallControllerResponse {
  request_id: string;
  estimated_eta_min: number | null;
  message: string;
}

/**
 * POST /api/v1/driver/call-controller — водій викликає контролера.
 * Зберігається в БД, інспектор бачить через GET /api/v1/driver/controller-calls.
 */
export async function callController(req: CallControllerRequest): Promise<CallControllerResponse> {
  const res = await api<{ request_id: string; status: string; estimated_eta_min: number | null; message: string }>(
    '/api/v1/driver/call-controller',
    {
      method: 'POST',
      body: JSON.stringify({
        driver_serial: req.driverSerial,
        route_id: req.routeId,
        transport: req.transport ?? null,
        reason: req.reason ?? null,
      }),
    },
  );
  return {
    request_id: res.request_id,
    estimated_eta_min: res.estimated_eta_min,
    message: res.message,
  };
}

export interface ControllerCall {
  id: string;
  driverSerial: string;
  routeId: string | null;
  transport: string | null;
  reason: string | null;
  status: string;
  createdAt: string;
  etaMinutes: number | null;
  acceptedAt: string | null;
  /** Контакти для обміну між водієм і контролером після прийняття виклику. */
  driverDisplayName: string | null;
  driverPhone: string | null;
  acceptedByDisplayName: string | null;
  acceptedByPhone: string | null;
  acceptedBySerial: string | null;
}

interface BackendControllerCall {
  id: string;
  driver_serial: string;
  route_id: string | null;
  transport: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  eta_minutes: number | null;
  accepted_at: string | null;
  driver_display_name?: string | null;
  driver_phone?: string | null;
  accepted_by_display_name?: string | null;
  accepted_by_phone?: string | null;
  accepted_by_serial?: string | null;
}

function mapBackendCall(c: BackendControllerCall): ControllerCall {
  return {
    id: c.id,
    driverSerial: c.driver_serial,
    routeId: c.route_id,
    transport: c.transport,
    reason: c.reason,
    status: c.status,
    createdAt: c.created_at,
    etaMinutes: c.eta_minutes,
    acceptedAt: c.accepted_at,
    driverDisplayName: c.driver_display_name ?? null,
    driverPhone: c.driver_phone ?? null,
    acceptedByDisplayName: c.accepted_by_display_name ?? null,
    acceptedByPhone: c.accepted_by_phone ?? null,
    acceptedBySerial: c.accepted_by_serial ?? null,
  };
}

/**
 * GET /api/v1/driver/controller-calls — виклики водіїв (для інспектора).
 * status: 'pending' (за замовчуванням, активні) або 'all' (повна історія — архів).
 */
export async function listControllerCalls(
  status: 'pending' | 'accepted' | 'all' = 'pending',
): Promise<ControllerCall[]> {
  const data = await api<BackendControllerCall[]>(
    `/api/v1/driver/controller-calls?status=${status}&limit=100`,
  );
  return Array.isArray(data) ? data.map(mapBackendCall) : [];
}

/**
 * POST /api/v1/driver/controller-calls/{id}/accept — інспектор приймає виклик.
 */
export async function acceptControllerCall(id: string): Promise<ControllerCall> {
  const data = await api<BackendControllerCall>(
    `/api/v1/driver/controller-calls/${id}/accept`,
    { method: 'POST' },
  );
  return mapBackendCall(data);
}

/**
 * GET /api/v1/driver/call-controller/{id} — водій перевіряє статус власного
 * виклику (pending → accepted → completed/cancelled), щоб показати прогрес в UI.
 */
export async function getControllerCallStatus(requestId: string): Promise<ControllerCall> {
  const data = await api<BackendControllerCall>(`/api/v1/driver/call-controller/${requestId}`);
  return mapBackendCall(data);
}

/**
 * POST /api/v1/driver/call-controller/{id}/cancel — водій скасовує власний
 * виклик (кнопка «Скинути виклик»). Ідемпотентно.
 */
export async function cancelControllerCall(requestId: string): Promise<ControllerCall> {
  const data = await api<BackendControllerCall>(
    `/api/v1/driver/call-controller/${requestId}/cancel`,
    { method: 'POST' },
  );
  return mapBackendCall(data);
}

/**
 * GET /api/v1/driver/call-controller — історія власних викликів водія.
 */
export async function listMyControllerCalls(limit = 20): Promise<ControllerCall[]> {
  const data = await api<BackendControllerCall[]>(
    `/api/v1/driver/call-controller?limit=${limit}`,
  );
  return Array.isArray(data) ? data.map(mapBackendCall) : [];
}

/**
 * POST /api/v1/driver/controller-calls/{id}/complete — інспектор вручну
 * завершує виклик (робота з водієм закінчена).
 */
export async function completeControllerCall(id: string): Promise<ControllerCall> {
  const data = await api<BackendControllerCall>(
    `/api/v1/driver/controller-calls/${id}/complete`,
    { method: 'POST' },
  );
  return mapBackendCall(data);
}
