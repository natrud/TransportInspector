import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CreateFineInput, type Fine, getFine, listFines, saveFine } from '../data/fines-api';
import { useSession } from './useSession';

const FINES_KEY = ['fines'] as const;

export function useFines(limit = 50): {
  fines: Fine[];
  isLoading: boolean;
  refetch: () => Promise<unknown>;
} {
  const { session } = useSession();
  const controllerId = session?.user_id ?? null;
  const q = useQuery({
    queryKey: [...FINES_KEY, controllerId, limit],
    queryFn: () => listFines(controllerId, limit),
    staleTime: 5_000,
  });
  return {
    fines: q.data ?? [],
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}

export function useFine(id: string | null | undefined): {
  fine: Fine | null;
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: ['fine', id],
    queryFn: () => (id ? getFine(id) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: 60_000,
  });
  return { fine: q.data ?? null, isLoading: q.isLoading };
}

export function useCreateFine(): {
  create: (input: Omit<CreateFineInput, 'controller_id'>) => Promise<Fine>;
  isPending: boolean;
  error: Error | null;
} {
  const qc = useQueryClient();
  const { session } = useSession();
  const controllerId = session?.user_id ?? null;
  const m = useMutation({
    mutationFn: (input: Omit<CreateFineInput, 'controller_id'>) =>
      saveFine({ ...input, controller_id: controllerId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: FINES_KEY });
    },
  });
  return { create: m.mutateAsync, isPending: m.isPending, error: m.error };
}
