import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type TripSession,
  endTrip,
  getActiveTrip,
  listRecentTrips,
  startTrip,
} from '../data/trip-sessions';

const TRIP_KEY = ['trip-session'] as const;

export function useActiveTrip(driverSerial: string | null | undefined): {
  trip: TripSession | null;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
} {
  const q = useQuery({
    queryKey: [...TRIP_KEY, 'active', driverSerial],
    queryFn: () => (driverSerial ? getActiveTrip(driverSerial) : Promise.resolve(null)),
    enabled: !!driverSerial,
    staleTime: 5_000,
  });
  return { trip: q.data ?? null, isLoading: q.isLoading, refetch: q.refetch };
}

export function useRecentTrips(driverSerial: string | null | undefined, limit = 10): {
  trips: TripSession[];
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: [...TRIP_KEY, 'recent', driverSerial, limit],
    queryFn: () => (driverSerial ? listRecentTrips(driverSerial, limit) : Promise.resolve([])),
    enabled: !!driverSerial,
    staleTime: 30_000,
  });
  return { trips: q.data ?? [], isLoading: q.isLoading };
}

export function useTripActions(): {
  start: (params: { driverSerial: string; routeId: string }) => Promise<TripSession>;
  end: (tripId: string) => Promise<void>;
  isPending: boolean;
} {
  const qc = useQueryClient();

  const startMutation = useMutation({
    mutationFn: startTrip,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TRIP_KEY });
    },
  });

  const endMutation = useMutation({
    mutationFn: endTrip,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TRIP_KEY });
    },
  });

  return {
    start: startMutation.mutateAsync,
    end: endMutation.mutateAsync,
    isPending: startMutation.isPending || endMutation.isPending,
  };
}
