import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { Camera, type CameraPermissionStatus } from 'react-native-vision-camera';

/**
 * Детальний стан дозволу камери.
 *
 * useCameraPermission() з react-native-vision-camera дає лише true/false —
 * цього досить, щоб вирішити, малювати `<Camera>` чи ні, але недостатньо, щоб
 * пояснити людині, ЩО робити. Android розрізняє «ще не питали» (діалог
 * дозволу з'явиться знову) і «відхилено назавжди» (після другої відмови чи
 * «не питати знову» — requestPermission() більше НЕ показує діалог, єдиний
 * вихід — налаштування телефону). Без цієї різниці кнопка «Запросити дозвіл»
 * на екрані сканера тихо нічого не робить, і виглядає це як «камеру не
 * знайдено», хоча камера є — просто дозвіл заблокований на рівні системи.
 *
 * Оновлюється сама, коли застосунок повертається з фону (людина відкрила
 * системні налаштування, дала дозвіл і повернулась назад) — той самий
 * прийом, що й у бібліотечному useCameraPermission().
 */
export function useCameraPermissionState(): {
  status: CameraPermissionStatus;
  isGranted: boolean;
  /** Відхилено назавжди — системний діалог дозволу більше не зʼявиться. */
  isPermanentlyDenied: boolean;
  /** Відкриває сторінку застосунку в системних налаштуваннях Android/iOS. */
  openSettings: () => void;
  refresh: () => void;
} {
  const [status, setStatus] = useState<CameraPermissionStatus>(() =>
    Camera.getCameraPermissionStatus(),
  );

  const refresh = useCallback(() => {
    setStatus(Camera.getCameraPermissionStatus());
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  return {
    status,
    isGranted: status === 'granted',
    isPermanentlyDenied: status === 'denied' || status === 'restricted',
    openSettings,
    refresh,
  };
}
