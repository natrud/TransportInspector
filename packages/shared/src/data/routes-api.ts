import type { Route } from '../types/ticket';
import { api } from '../lib/api';

interface BackendRoute {
  id: string;
  name: string;
  number?: string | null;
  color?: string | null;
}

/** Маппінг відповіді бекенду → Route. transport за замовчуванням 'bus'. */
function mapBackendRoute(r: BackendRoute): Route {
  return {
    id: r.id,
    code: r.number ?? r.name.slice(0, 8),
    name: r.name,
    transport: 'bus',
  };
}

/**
 * GET /api/v1/map/routes — список маршрутів з бекенду.
 * Повертає порожній масив якщо маршрутів немає — БЕЗ mock fallback.
 *
 * withValidator: true — тільки номери маршрутів, на яких реально встановлено
 * валідатор (validator_controllers.route_number), а не весь довідник TransportRoute.
 */
export async function listRoutes(opts?: { withValidator?: boolean }): Promise<Route[]> {
  const path = opts?.withValidator ? '/api/v1/map/routes?with_validator=true' : '/api/v1/map/routes';
  const data = await api<BackendRoute[]>(path);
  return Array.isArray(data) ? data.map(mapBackendRoute) : [];
}

export async function getRoute(id: string): Promise<Route | null> {
  try {
    const data = await api<BackendRoute>(`/api/v1/map/routes/${id}`);
    return mapBackendRoute(data);
  } catch {
    return null;
  }
}

/**
 * GET /api/v1/map/vehicles?route_number= — другий крок вибору: транспортні
 * номери (ТЗ) валідаторів, встановлених саме на цьому маршруті. Уточнюючий
 * пошук у межах вже обраного route_number.
 */
export async function listVehicles(routeNumber: string): Promise<string[]> {
  const data = await api<string[]>(
    `/api/v1/map/vehicles?route_number=${encodeURIComponent(routeNumber)}`,
  );
  return Array.isArray(data) ? data : [];
}
