import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type RouteInspection,
  closeRouteInspection,
  getRouteInspection,
} from '../data/route-inspection-api';
import { useSettings } from './useSettings';

const KEY = 'route-inspection';

/**
 * Polling стану перевірки контролера на маршруті водія. Інтервал — той самий,
 * що у живої стрічки валідацій (useRouteActivity).
 */
export function useRouteInspection(
  routeNumber: string | null | undefined,
  vehicleNumber?: string | null,
): {
  data: RouteInspection | null;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
} {
  const { settings } = useSettings();
  // Статус контролера водій має бачити швидко — не чекаючи повний інтервал
  // стрічки валідацій (може бути 60–120 с). Верхня межа — 15 с.
  //
  // Нижня межа — 5 с, навіть якщо стрічку виставлено на 1 с: поява контролера
  // в салоні це подія масштабу хвилин, а запит тут дорожчий за стрічку
  // (кілька звернень до inspection_sessions + журнал дій + стан зчитувачів)
  // і не має дешевого 304.
  const interval = Math.min(Math.max(settings.pollIntervalMs, 5_000), 15_000);
  const q = useQuery({
    queryKey: [KEY, routeNumber ?? null, vehicleNumber ?? null],
    queryFn: () => getRouteInspection(routeNumber as string, vehicleNumber),
    enabled: !!routeNumber,
    refetchInterval: routeNumber ? interval : false,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
  return {
    data: q.data ?? null,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    refetch: q.refetch,
  };
}

export function useCloseRouteInspection(): {
  close: (params: { routeNumber: string; vehicleNumber?: string | null }) => Promise<RouteInspection>;
  isPending: boolean;
} {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: ({ routeNumber, vehicleNumber }: { routeNumber: string; vehicleNumber?: string | null }) =>
      closeRouteInspection(routeNumber, vehicleNumber),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [KEY] });
      void qc.invalidateQueries({ queryKey: ['driver-call-status'] });
      void qc.invalidateQueries({ queryKey: ['driver-my-calls'] });
    },
  });
  return { close: m.mutateAsync, isPending: m.isPending };
}
