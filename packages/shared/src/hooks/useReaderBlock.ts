import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type ReadersCommandResult,
  setInspectionReadersBlocked,
  setRouteReadersBlocked,
} from '../data/readers-api';

/**
 * Ручні команди блокування зчитувачів.
 *
 * Стан читати НЕ звідси: він уже приходить у `useRouteInspection()` (водій) та
 * `useCurrentInspection()` (контролер) — один polling на все, без розсинхрону
 * між банером і кнопками. Тут лише мутації + інвалідація тих самих ключів.
 */

function useReadersInvalidation(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['route-inspection'] });
    void qc.invalidateQueries({ queryKey: ['inspection', 'current'] });
  };
}

/** Резервні кнопки водія: маршрут/ТЗ передаємо явно. */
export function useRouteReaderControls(): {
  setBlocked: (params: {
    blocked: boolean;
    routeNumber: string;
    vehicleNumber?: string | null;
  }) => Promise<ReadersCommandResult>;
  isPending: boolean;
} {
  const invalidate = useReadersInvalidation();
  const m = useMutation({
    mutationFn: ({
      blocked,
      routeNumber,
      vehicleNumber,
    }: {
      blocked: boolean;
      routeNumber: string;
      vehicleNumber?: string | null;
    }) => setRouteReadersBlocked(blocked, routeNumber, vehicleNumber),
    // Навіть невдала команда могла частково змінити стан приладів —
    // перечитуємо його в обох випадках.
    onSettled: invalidate,
  });
  return { setBlocked: m.mutateAsync, isPending: m.isPending };
}

/** Повтор команди контролером — завжди в межах його активної перевірки. */
export function useInspectionReaderControls(): {
  setBlocked: (blocked: boolean) => Promise<ReadersCommandResult>;
  isPending: boolean;
} {
  const invalidate = useReadersInvalidation();
  const m = useMutation({
    mutationFn: (blocked: boolean) => setInspectionReadersBlocked(blocked),
    onSettled: invalidate,
  });
  return { setBlocked: m.mutateAsync, isPending: m.isPending };
}
