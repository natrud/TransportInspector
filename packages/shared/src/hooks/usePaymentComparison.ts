import { useRouteActivity } from './useRouteActivity';
import { usePassengerStats } from './usePassengerCounter';

export type ComparisonSeverity = 'idle' | 'ok' | 'warn' | 'danger' | 'undercount';

export interface PaymentComparison {
  windowMs: number;
  entered: number; // тапів пасажирів у вікні
  validated: number; // валідованих квитків у тому ж вікні
  diff: number; // entered - validated; >0 = ймовірно зайці
  percentUnpaid: number; // 0..100
  severity: ComparisonSeverity;
  message: string;
}

const WARN_THRESHOLD = 5; // %
const DANGER_THRESHOLD = 15; // %

function classify(entered: number, validated: number, windowMin: number): PaymentComparison {
  if (entered === 0 && validated === 0) {
    return {
      windowMs: windowMin * 60_000,
      entered,
      validated,
      diff: 0,
      percentUnpaid: 0,
      severity: 'idle',
      message: `За останні ${windowMin} хв немає активності.`,
    };
  }
  if (entered < validated) {
    return {
      windowMs: windowMin * 60_000,
      entered,
      validated,
      diff: entered - validated,
      percentUnpaid: 0,
      severity: 'undercount',
      message: 'Валідовано більше, ніж натапано — звір лічильник.',
    };
  }
  const diff = entered - validated;
  const percent = entered > 0 ? Math.round((diff / entered) * 100) : 0;
  let severity: ComparisonSeverity = 'ok';
  let message = `✓ Усі ${entered} пасажирів валідували квиток.`;
  if (diff > 0) {
    if (percent > DANGER_THRESHOLD) {
      severity = 'danger';
    } else if (percent > WARN_THRESHOLD) {
      severity = 'warn';
    } else {
      severity = 'ok';
    }
    message = `${diff} (${percent}%) без квитка за останні ${windowMin} хв.`;
  }
  return {
    windowMs: windowMin * 60_000,
    entered,
    validated,
    diff,
    percentUnpaid: percent,
    severity,
    message,
  };
}

/**
 * Порівняння тапів пасажирів (entered) з валідованими квитками (validated)
 * з моменту старту поточного рейсу (`sinceMs` = trip.started_at). Тапи
 * беруться з тієї самої query, що годує counter на головній кнопці —
 * гарантовано sync.
 */
export function usePaymentComparison(params: {
  tripId: string | null;
  routeId: string | null;
  sinceMs: number | null;
  vehicleNumber?: string | null;
}): { comparison: PaymentComparison | null; isLoading: boolean } {
  const { data: activity } = useRouteActivity(params.routeId, params.sinceMs, params.vehicleNumber);
  const { stats, isLoading } = usePassengerStats(params.tripId);

  if (!params.tripId || !params.sinceMs || !activity) {
    return { comparison: null, isLoading: false };
  }

  const windowMin = Math.round((Date.now() - params.sinceMs) / 60_000);
  const validated = activity.totalSince;
  // Саме «увійшло», а не наповнення салону: пасажир, що вийшов, свій квиток
  // уже або валідував, або ні — вихід не має «списувати» неоплачений проїзд.
  const entered = stats.boarded;

  return {
    comparison: classify(entered, validated, windowMin),
    isLoading,
  };
}
