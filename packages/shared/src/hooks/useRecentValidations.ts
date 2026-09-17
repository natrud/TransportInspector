import { useQuery } from '@tanstack/react-query';
import { type ValidationLogEntry, listRecentValidations } from '../data/validation-log';
import { useSession } from './useSession';

export const RECENT_VALIDATIONS_KEY = ['recent-validations'] as const;

export function useRecentValidations(limit = 50): {
  entries: ValidationLogEntry[];
  isLoading: boolean;
  refetch: () => Promise<unknown>;
} {
  const { session } = useSession();
  const controllerId = session?.user_id ?? null;
  const q = useQuery({
    queryKey: [...RECENT_VALIDATIONS_KEY, controllerId, limit],
    queryFn: () => listRecentValidations(controllerId, limit),
    staleTime: 5_000,
  });
  return {
    entries: q.data ?? [],
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}
