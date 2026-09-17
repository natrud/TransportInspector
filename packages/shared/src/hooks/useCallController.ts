import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type CallControllerRequest,
  type ControllerCall,
  callController,
  cancelControllerCall,
  getControllerCallStatus,
  listMyControllerCalls,
} from '../data/support-api';

export function useCallController(): {
  call: (req: CallControllerRequest) => Promise<{
    request_id: string;
    estimated_eta_min: number | null;
    message: string;
  }>;
  isPending: boolean;
  error: Error | null;
} {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: callController,
    // Без цього статус у шапці водія оновиться лише наступним polling'ом
    // (до 8 с) — виглядає так, ніби тап не спрацював.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['driver-my-calls'] });
      void qc.invalidateQueries({ queryKey: ['controller-calls'] });
    },
  });
  return { call: m.mutateAsync, isPending: m.isPending, error: m.error };
}

const TERMINAL_CALL_STATUSES = ['completed', 'cancelled'];

/**
 * Polling статусу власного виклику водія (pending → accepted → completed).
 * Зупиняється лише на термінальних станах (completed/cancelled) — доти опитує,
 * щоб зловити і прийняття, і завершення перевірки контролером.
 */
export function useControllerCallStatus(requestId: string | null): {
  call: ControllerCall | null;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
} {
  const q = useQuery({
    queryKey: ['driver-call-status', requestId],
    queryFn: () => getControllerCallStatus(requestId as string),
    enabled: !!requestId,
    refetchInterval: (query) =>
      TERMINAL_CALL_STATUSES.includes(query.state.data?.status ?? '') ? false : 6000,
    refetchIntervalInBackground: true,
  });
  return { call: q.data ?? null, isFetching: q.isFetching, refetch: q.refetch };
}

export function useCancelControllerCall(): {
  cancel: (requestId: string) => Promise<ControllerCall>;
  isPending: boolean;
} {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: cancelControllerCall,
    onSuccess: (call) => {
      qc.setQueryData(['driver-call-status', call.id], call);
      void qc.invalidateQueries({ queryKey: ['driver-my-calls'] });
      void qc.invalidateQueries({ queryKey: ['controller-calls'] });
    },
  });
  return { cancel: m.mutateAsync, isPending: m.isPending };
}

const ACTIVE_CALL_STATUSES = ['pending', 'accepted'];

/**
 * Виклики контролера цього водія — джерело правди з бекенду (не локальний
 * стан). Опитує кожні 8 c. `activeCall` — поточний pending/accepted, якщо є.
 */
export function useMyControllerCalls(limit = 20): {
  calls: ControllerCall[];
  activeCall: ControllerCall | null;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
} {
  const q = useQuery({
    queryKey: ['driver-my-calls', limit],
    queryFn: () => listMyControllerCalls(limit),
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
  const calls = q.data ?? [];
  const latest = calls[0] ?? null;
  return {
    calls,
    activeCall: latest && ACTIVE_CALL_STATUSES.includes(latest.status) ? latest : null,
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}
