import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ControllerCall,
  acceptControllerCall,
  completeControllerCall,
  listControllerCalls,
} from '../data/support-api';
import { useSettings } from './useSettings';

const CALLS_KEY_BASE = 'controller-calls';

/**
 * Polling-список викликів водіїв (для застосунку контролера).
 *
 * status:
 *   'pending'  — нові виклики, що чекають прийняття (вкладка «Нові», бейдж);
 *   'accepted' — прийняті, робота ще триває (вкладка «В роботі»);
 *   'all'      — повна історія (з неї клієнт бере архів: completed + cancelled).
 */
export function useControllerCalls(
  status: 'pending' | 'accepted' | 'all' = 'pending',
  options?: {
    /**
     * false — список не опитується (напр. архів, поки його вкладка закрита).
     * Економить батарею: інакше екран викликів тримає три паралельні polling'и.
     */
    enabled?: boolean;
  },
): {
  calls: ControllerCall[];
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
} {
  const { settings } = useSettings();
  const enabled = options?.enabled ?? true;

  const q = useQuery({
    queryKey: [CALLS_KEY_BASE, status],
    queryFn: () => listControllerCalls(status),
    enabled,
    refetchInterval: enabled ? Math.min(settings.pollIntervalMs, 15_000) : false,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  return {
    calls: q.data ?? [],
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    refetch: q.refetch,
  };
}

export function useAcceptControllerCall(): {
  accept: (id: string) => Promise<ControllerCall>;
  isPending: boolean;
} {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: acceptControllerCall,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [CALLS_KEY_BASE] });
      void qc.invalidateQueries({ queryKey: ['driver-call-status'] });
      void qc.invalidateQueries({ queryKey: ['driver-my-calls'] });
    },
  });
  return { accept: mutation.mutateAsync, isPending: mutation.isPending };
}

export function useCompleteControllerCall(): {
  complete: (id: string) => Promise<ControllerCall>;
  isPending: boolean;
} {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: completeControllerCall,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [CALLS_KEY_BASE] });
      void qc.invalidateQueries({ queryKey: ['driver-call-status'] });
      void qc.invalidateQueries({ queryKey: ['driver-my-calls'] });
      void qc.invalidateQueries({ queryKey: ['route-inspection'] });
    },
  });
  return { complete: mutation.mutateAsync, isPending: mutation.isPending };
}
