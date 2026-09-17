import { useQuery } from '@tanstack/react-query';
import { type TransportFare, getTransportFares } from '../data/transport-fares-api';

/**
 * Ціни квитка за видом транспорту — для тарифних кнопок у «Видати постанову»
 * без прив'язаного квитка. Джерело — адмінка (див. data/transport-fares-api).
 *
 * staleTime 10 хв: ціни в адмінці міняються рідко, а екран постанови
 * відкривають за секунди — форсований рефетч тут не потрібен.
 */
export function useTransportFares(): {
  fares: TransportFare[];
  isLoading: boolean;
  /**
   * Помилка запиту. Потрібна, щоб відрізнити «в адмінці не налаштовано
   * жодного тарифу» (порожній список) від «не змогли дістатись бекенда»
   * (застарілий застосунок, нема звʼязку, ендпоінт ще не задеплоєно) —
   * ціна штрафу залежить від цього, тож мовчазний нуль неприпустимий.
   */
  error: Error | null;
  refetch: () => Promise<unknown>;
} {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transport-fares'],
    queryFn: getTransportFares,
    staleTime: 10 * 60_000,
  });
  return { fares: data ?? [], isLoading, error, refetch };
}
