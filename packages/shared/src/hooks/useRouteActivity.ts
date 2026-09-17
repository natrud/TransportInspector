import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type RouteActivityResponse, getRouteActivity } from '../data/tickets-api';
import { useSettings } from './useSettings';

/**
 * Polling-стрічка валідованих квитків на маршруті. Інтервал береться з
 * налаштувань (мін. 10с), оновлення у фоні теж triggers refetch.
 *
 * sinceMs, якщо передано (час старту поточного рейсу) — і стрічка, і денні
 * лічильники рахуються від цього моменту.
 */
export function useRouteActivity(
  routeId: string | null | undefined,
  sinceMs?: number | null,
  vehicleNumber?: string | null,
): {
  data: RouteActivityResponse | null;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
} {
  const { settings } = useSettings();

  const q = useQuery({
    queryKey: ['route-activity', routeId, sinceMs ?? null, vehicleNumber ?? null],
    queryFn: () => {
      if (!routeId) throw new Error('routeId is required');
      return getRouteActivity(routeId, sinceMs, vehicleNumber);
    },
    enabled: !!routeId,
    refetchInterval: routeId ? settings.pollIntervalMs : false,
    // Згорнутий застосунок стрічку не показує — опитувати нема сенсу.
    // При поверненні staleTime: 0 одразу дотягує свіже.
    refetchIntervalInBackground: false,
    // sinceMs входить у ключ, тож старт і завершення рейсу створюють НОВИЙ
    // запит. Без цього картка на мить порожніла і показувала «Завантажуємо
    // активність маршруту» — саме те зникнення стрічки при завершенні рейсу.
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

  return {
    data: q.data ?? null,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error,
    refetch: q.refetch,
  };
}
