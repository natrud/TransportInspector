import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeCurrentInspection,
  getCurrentInspection,
  getInspectorQr,
  type InspectionSession,
  type InspectorQrCredential,
  rotateInspectorQr,
} from '../data/inspections-api';
import { isRoleAllowed } from '../lib/app-access';
import { useSession } from './useSession';

const CURRENT_INSPECTION_KEY = ['inspection', 'current'] as const;

export function useCurrentInspection(refetchIntervalMs = 10_000): {
  inspection: InspectionSession | null;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  close: () => Promise<InspectionSession>;
  isClosing: boolean;
} {
  const qc = useQueryClient();
  const { session } = useSession();
  const enabled = isRoleAllowed(session?.role, 'controller');
  const query = useQuery({
    queryKey: [...CURRENT_INSPECTION_KEY, session?.user_id],
    queryFn: getCurrentInspection,
    enabled,
    refetchInterval: enabled ? refetchIntervalMs : false,
    refetchOnMount: 'always',
    staleTime: 5_000,
  });
  const closeMutation = useMutation({
    mutationFn: () => closeCurrentInspection('manual'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CURRENT_INSPECTION_KEY });
    },
  });
  return {
    inspection: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    close: closeMutation.mutateAsync,
    isClosing: closeMutation.isPending,
  };
}

export function useInspectorQr(): {
  credential: InspectorQrCredential | null;
  isLoading: boolean;
  error: Error | null;
  rotate: () => Promise<InspectorQrCredential>;
  isRotating: boolean;
} {
  const qc = useQueryClient();
  const { session } = useSession();
  const controllerId = session?.user_id ?? '';
  const key = ['inspector-qr', controllerId] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => getInspectorQr(controllerId),
    enabled: isRoleAllowed(session?.role, 'controller') && !!controllerId,
    // Важливо для безпечної міграції формату QR: після оновлення застосунку
    // завжди звіряємо кеш з бекендом. У звичайному випадку сервер повертає
    // той самий постійний QR і зайвого створення не відбувається.
    refetchOnMount: 'always',
    staleTime: Number.POSITIVE_INFINITY,
  });
  const rotateMutation = useMutation({
    mutationFn: () => rotateInspectorQr(controllerId),
    onSuccess: (credential) => {
      qc.setQueryData(key, credential);
    },
  });
  return {
    credential: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    rotate: rotateMutation.mutateAsync,
    isRotating: rotateMutation.isPending,
  };
}
