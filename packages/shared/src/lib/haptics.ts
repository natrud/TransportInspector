import { Vibration } from 'react-native';

/**
 * Haptics wrapper. Використовує вбудований `Vibration` (без native deps).
 * Перемикач увімкнення/вимкнення додається у Settings.
 */

let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

type SuccessKind = 'scan-success' | 'tile-tap' | 'new-activity';

const DURATION_MS: Record<SuccessKind, number | number[]> = {
  'scan-success': [0, 60, 80, 60],
  'tile-tap': 15,
  'new-activity': 25,
};

export function tap(kind: SuccessKind): void {
  if (!enabled) return;
  try {
    Vibration.vibrate(DURATION_MS[kind]);
  } catch {
    /* silent */
  }
}

export function warning(): void {
  if (!enabled) return;
  try {
    Vibration.vibrate([0, 100, 60, 100]);
  } catch {
    /* silent */
  }
}
