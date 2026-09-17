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
} {
  const { data, isLoading } = useQuery({
    queryKey: ['transport-fares'],
    queryFn: getTransportFares,
    staleTime: 10 * 60_000,
  });
  return { fares: data ?? [], isLoading };
}
