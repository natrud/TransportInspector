import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { syncControllerData } from '../data/offline-sync';
import { useSession } from './useSession';
import { RECENT_VALIDATIONS_KEY } from './useRecentValidations';

/**
 * Тримає локальну чергу дій контролера синхронізованою з бекендом:
 *   - при старті (коли є сесія);
 *   - при відновленні мережі (перехід offline → online).
 *
 * Монтується один раз у AppNavigator.
 */
export function useOfflineSync(): void {
  const { session } = useSession();
  const qc = useQueryClient();
  const wasOnline = useRef<boolean | null>(null);

  const authed = !!session;

  useEffect(() => {
    if (!authed) return;

    const run = (): void => {
      void syncControllerData().then(() => {
        void qc.invalidateQueries({ queryKey: RECENT_VALIDATIONS_KEY });
        void qc.invalidateQueries({ queryKey: ['shift-summary'] });
        void qc.invalidateQueries({ queryKey: ['fines'] });
      });
    };

    run();

    const unsub = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      if (online && wasOnline.current === false) run();
      wasOnline.current = online;
    });

    return unsub;
  }, [authed, qc]);
}
