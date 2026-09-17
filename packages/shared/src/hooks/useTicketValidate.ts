import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ValidateTicketRequest, validateTicket } from '../data/tickets-api';
import { logValidation } from '../data/validation-log';
import { ApiError } from '../lib/api';
import { tap, warning } from '../lib/haptics';
import type { ValidationResult } from '../types/ticket';
import { useSession } from './useSession';
import { RECENT_VALIDATIONS_KEY } from './useRecentValidations';

export function useTicketValidate(): {
  validate: (req: ValidateTicketRequest) => Promise<ValidationResult>;
  isPending: boolean;
  result: ValidationResult | null;
  error: Error | null;
  reset: () => void;
} {
  const qc = useQueryClient();
  const { session } = useSession();
  const controllerId = session?.user_id ?? null;

  const invalidate = async (): Promise<void> => {
    await qc.invalidateQueries({ queryKey: RECENT_VALIDATIONS_KEY });
    await qc.invalidateQueries({ queryKey: ['shift-summary'] });
  };

  const mutation = useMutation({
    mutationFn: async (req: ValidateTicketRequest) => {
      let result: ValidationResult;
      try {
        result = await validateTicket(req);
      } catch (err) {
        // ApiError = сервер відповів (напр. 500) — нехай розбираються на бекенді.
        // Інше = немає звʼязку: фіксуємо СПРОБУ сканування в офлайн-чергу, щоб
        // вона все одно потрапила у звіт роботи контролера, коли зʼявиться мережа.
        if (!(err instanceof ApiError)) {
          try {
            await logValidation({
              controllerId,
              ticketId: req.qr.ticket_id,
              routeId: req.routeId,
              result: {
                kind: 'invalid',
                reason: 'offline',
                ticket: null,
                message: 'Немає звʼязку — квиток не перевірено',
              },
              rawQr: req.rawQr ?? null,
              inspectionSessionId: req.inspectionSessionId ?? null,
              syncedWithBackend: false,
            });
            await invalidate();
          } catch {
            /* локальний журнал не критичний для UX */
          }
        }
        throw err;
      }

      // Успіх: бекенд уже зафіксував цей скан у controller_action_log
      // (app/api/tickets.py::inspector_get_ticket) — локально пишемо лише для
      // офлайн-перегляду «Останні скани», без повторної відправки.
      try {
        await logValidation({
          controllerId,
          ticketId: req.qr.ticket_id,
          routeId: req.routeId,
          result,
          rawQr: req.rawQr ?? null,
          inspectionSessionId: req.inspectionSessionId ?? null,
          syncedWithBackend: true,
        });
        await invalidate();
      } catch {
        /* silent — журнал офлайн-нагляду не критичний для UX */
      }
      return result;
    },
    onSuccess: (res) => {
      if (res.kind === 'valid') tap('scan-success');
      else warning();
    },
  });

  return {
    validate: mutation.mutateAsync,
    isPending: mutation.isPending,
    result: mutation.data ?? null,
    error: mutation.error,
    reset: mutation.reset,
  };
}
