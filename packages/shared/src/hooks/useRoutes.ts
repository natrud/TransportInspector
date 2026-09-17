import { useQuery } from '@tanstack/react-query';
import { getRoute, listRoutes, listVehicles } from '../data/routes-api';
import type { Route } from '../types/ticket';

export function useRoutes(opts?: { withValidator?: boolean }): {
  routes: Route[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
} {
  const withValidator = opts?.withValidator ?? false;
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['routes', withValidator],
    queryFn: () => listRoutes({ withValidator }),
    staleTime: 30 * 60_000, // маршрути міняються рідко — але picker форсує refetch при відкритті
  });
  return { routes: data ?? [], isLoading, error, refetch };
}

export function useRoute(id: string | null | undefined): {
  route: Route | null;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ['routes', id],
    queryFn: () => (id ? getRoute(id) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: 30 * 60_000,
  });
  return { route: data ?? null, isLoading };
}

/**
 * Другий крок вибору — транспортні номери (ТЗ) на вже обраному маршруті.
 * Уточнюючий пошук у validator_controllers, звужений по route_number.
 */
export function useVehicles(routeNumber: string | null | undefined): {
  vehicles: string[];
  isLoading: boolean;
  refetch: () => Promise<unknown>;
} {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['vehicles', routeNumber],
    queryFn: () => (routeNumber ? listVehicles(routeNumber) : Promise.resolve([])),
    enabled: !!routeNumber,
    staleTime: 30 * 60_000,
  });
  return { vehicles: data ?? [], isLoading, refetch };
}
