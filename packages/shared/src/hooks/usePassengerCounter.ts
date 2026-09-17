import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EMPTY_TAP_STATS,
  type PassengerDirection,
  type PassengerTapStats,
  addPassengerTap,
  getPassengerTapStats,
  undoLastTap,
} from '../data/trip-sessions';
import { tap as hapticTap } from '../lib/haptics';
import { useSettings } from './useSettings';

export const PASSENGER_STATS_KEY = (tripId: string | null): readonly unknown[] => [
  'passenger-stats',
  tripId,
];

/**
 * Об'єднаний hook: повертає і посадку/висадку для плити лічильника, і
 * «увійшло» для картки контролю оплати — з одного запиту. Один кеш — нема
 * розсинхронізації між двома блоками на екрані.
 */
export function usePassengerStats(tripId: string | null): {
  stats: PassengerTapStats;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
} {
  const { settings } = useSettings();
  const q = useQuery({
    queryKey: PASSENGER_STATS_KEY(tripId),
    queryFn: () => getPassengerTapStats(tripId),
    refetchInterval: settings.pollIntervalMs,
    staleTime: 1_000,
  });
  return {
    stats: q.data ?? EMPTY_TAP_STATS,
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}

/** Скільки пасажирів зайшло за рейс (для підсумку при завершенні рейсу). */
export function usePassengerCount(tripId: string | null): {
  count: number;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
} {
  const { stats, isLoading, refetch } = usePassengerStats(tripId);
  return { count: stats.boarded, isLoading, refetch };
}

export function usePassengerCounterActions(tripId: string | null): {
  /** Пасажир зайшов (+1 до «увійшло»). */
  board: () => Promise<PassengerTapStats>;
  /** Пасажир вийшов (+1 до «вийшло»; «увійшло» не змінюється). */
  alight: () => Promise<PassengerTapStats>;
  /** Скасувати останній тап — виправлення помилкового натискання. */
  undo: () => Promise<PassengerTapStats>;
  isPending: boolean;
} {
  const qc = useQueryClient();

  // Інвалідуємо ОДИН ключ — і плита, і контроль оплати перечитають
  // з єдиного запиту getPassengerTapStats. Розсинхронізація неможлива.
  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: PASSENGER_STATS_KEY(tripId) });
  };

  const tapMutation = useMutation({
    mutationFn: (direction: PassengerDirection) => addPassengerTap(tripId, direction),
    onSuccess: () => {
      hapticTap('tile-tap');
      invalidate();
    },
  });

  const undoMutation = useMutation({
    mutationFn: () => undoLastTap(tripId),
    onSuccess: invalidate,
  });

  return {
    board: () => tapMutation.mutateAsync('in'),
    alight: () => tapMutation.mutateAsync('out'),
    undo: undoMutation.mutateAsync,
    isPending: tapMutation.isPending || undoMutation.isPending,
  };
}
