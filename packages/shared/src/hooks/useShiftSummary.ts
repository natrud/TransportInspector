import { useQuery } from '@tanstack/react-query';
import { type ShiftSummary, getShiftSummary } from '../data/validation-log';
import { useSession } from './useSession';

export function useShiftSummary(): {
  summary: ShiftSummary | null;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
} {
  const { session } = useSession();
  const controllerId = session?.user_id ?? null;
  const q = useQuery({
    queryKey: ['shift-summary', controllerId],
    queryFn: () => getShiftSummary(controllerId),
    staleTime: 30_000,
  });
  return {
    summary: q.data ?? null,
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}
