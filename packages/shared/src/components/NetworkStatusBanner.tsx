import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { getClockState } from '../lib/clock-drift';
import { useColors } from '../theme/useColors';

const OFFLINE_GRACE_MS = 30_000;

/**
 * Banner з підказкою про offline / drift годинника. Без шуму у нормальному
 * online-стані.
 */
export function NetworkStatusBanner(): JSX.Element | null {
  const c = useColors();
  const { isOnline, connectionType } = useNetworkStatus();

  const [offlineSinceMs, setOfflineSinceMs] = useState<number | null>(null);
  const [graceTick, setGraceTick] = useState(0);

  useEffect(() => {
    if (isOnline) {
      setOfflineSinceMs(null);
      return;
    }
    if (offlineSinceMs == null) setOfflineSinceMs(Date.now());
  }, [isOnline, offlineSinceMs]);

  useEffect(() => {
    if (offlineSinceMs == null) return;
    const interval = setInterval(() => setGraceTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, [offlineSinceMs]);

  const offlineGraceElapsed =
    offlineSinceMs != null && Date.now() - offlineSinceMs >= OFFLINE_GRACE_MS;
  void graceTick;

  const drift = getClockState();
  const showOffline = !isOnline && offlineGraceElapsed;

  if (!drift.isDrifting && !showOffline) return null;

  let bg: string = c.textMuted;
  let label = 'Статус…';

  if (drift.isDrifting) {
    bg = c.danger;
    const skewMin = Math.round((drift.skewMs ?? 0) / 60_000);
    label = `⏱ Час пристрою відхилений на ${skewMin} хв`;
  } else if (showOffline) {
    bg = c.danger;
    label = `⚠ Працюємо офлайн · ${formatConnectionType(connectionType)}`;
  }

  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

function formatConnectionType(type: string): string {
  switch (type) {
    case 'wifi':
      return 'Wi-Fi';
    case 'cellular':
      return 'мобільна мережа';
    case 'ethernet':
      return 'кабельна мережа';
    case 'none':
      return 'без мережі';
    default:
      return 'стан мережі невідомий';
  }
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
