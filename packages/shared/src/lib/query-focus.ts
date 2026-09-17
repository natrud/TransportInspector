import { AppState, type AppStateStatus } from 'react-native';
import { focusManager } from '@tanstack/react-query';

/**
 * Прив'язує «фокус» React Query до стану застосунку.
 *
 * Без цього RN завжди вважається сфокусованим: `refetchIntervalInBackground:
 * false` нічого не вимикає, а `refetchOnWindowFocus` ніколи не спрацьовує.
 * З прив'язкою згорнутий застосунок перестає опитувати сервер, а при
 * поверненні одразу дотягує свіже — на сотню водіїв це прибирає більшу
 * частину марного трафіку (планшет у кабіні лежить згорнутим годинами).
 *
 * Повертає функцію відписки.
 */
export function setupQueryFocus(): () => void {
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  });
  focusManager.setFocused(AppState.currentState === 'active');
  return () => subscription.remove();
}
