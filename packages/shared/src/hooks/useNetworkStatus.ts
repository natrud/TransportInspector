import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * Network status hook (M1.1.11).
 *
 * Повертає:
 *   - isOnline       — true якщо device has Internet reachable
 *   - connectionType — 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown'
 *   - isInternetReachable — додатковий флаг (може бути null під час init)
 *
 * Запит NetInfo.addEventListener subscribes до OS callbacks — immediate update
 * при зміні стану.
 */
export function useNetworkStatus(): {
  isOnline: boolean;
  connectionType: string;
  isInternetReachable: boolean | null;
} {
  const [state, setState] = useState<NetInfoState | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(setState);
    NetInfo.fetch()
      .then(setState)
      .catch(() => setState(null));
    return unsubscribe;
  }, []);

  const isOnline = state
    ? state.isConnected === true && state.isInternetReachable !== false
    : false;
  return {
    isOnline,
    connectionType: state?.type ?? 'unknown',
    isInternetReachable: state?.isInternetReachable ?? null,
  };
}
