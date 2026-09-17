import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { api } from './api';
import { getDeviceContext } from './device-id';
import { useSession } from '../hooks/useSession';

/**
 * Показувати push навіть коли застосунок на передньому плані (напр. виклик
 * контролера має бути помітним одразу, а не лише в фоні).
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getEasProjectId(): string | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as { eas?: { projectId?: string } };
  return extra.eas?.projectId ?? null;
}

/**
 * Запитує дозвіл і повертає Expo push token. Потребує прив'язки застосунку
 * до EAS-проєкту (extra.eas.projectId в app.json) — інакше поверне null.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const projectId = getEasProjectId();
  if (!projectId) {
    // eslint-disable-next-line no-console
    console.warn('[push] extra.eas.projectId відсутній в app.json — push-токен недоступний');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[push] Не вдалось отримати push-токен:', error);
    return null;
  }
}

/**
 * При наявній сесії реєструє push-токен на бекенді:
 *
 * 1. PATCH /api/v1/devices/me/push-token — токен, прив'язаний до конкретного
 *    пристрою й позначений тегом застосунку (app: "controller"/"driver",
 *    визначається з app.json slug). Це джерело, яке зараз читають
 *    громадянські розсилки (новини/тривоги/локальні попередження) — вони
 *    фільтрують по app, тож токен цього застосунку туди більше не потрапить
 *    і не зламає чужий батч в Expo API.
 * 2. PUT /api/v1/settings/me — той самий expo_push_token, що й раніше;
 *    залишено для сумісності з викликом контролера (send_controller_call_push
 *    на бекенді поки що читає саме це поле).
 */
/**
 * Знімає push-токен при виході з акаунту.
 *
 * Обов'язково ДО очищення токена авторизації: обидва запити потребують ще
 * живого JWT. Без цього пристрій лишався зареєстрованим на бекенді і
 * продовжував отримувати сповіщення про виклики водіїв уже після логауту.
 *
 * Чистимо у двох місцях, бо їх читають різні розсилки:
 *   • devices/me/push-token — реєстр пристроїв (громадянські розсилки);
 *   • settings/me.expo_push_token — саме це поле читає send_controller_call_push.
 *
 * Помилки навмисно глушимо: невдала відписка не має блокувати вихід.
 */
export async function unregisterPushToken(): Promise<void> {
  const device = await getDeviceContext();
  if (device) {
    try {
      await api('/api/v1/devices/me/push-token', {
        method: 'DELETE',
        body: JSON.stringify({ device_id: device.device_id }),
      });
    } catch {
      // non-critical
    }
  }

  try {
    await api('/api/v1/settings/me', {
      method: 'PUT',
      body: JSON.stringify({ push_enabled: false, expo_push_token: null }),
    });
  } catch {
    // non-critical
  }
}

export function usePushRegistration(): void {
  const { session } = useSession();

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    void (async () => {
      const token = await registerForPushNotifications();
      if (!token || cancelled) return;

      const device = await getDeviceContext();
      if (device) {
        try {
          await api('/api/v1/devices/me/push-token', {
            method: 'PATCH',
            body: JSON.stringify({ ...device, push_token: token }),
          });
        } catch {
          // non-critical — спробуємо ще раз наступного запуску
        }
      }

      try {
        await api('/api/v1/settings/me', {
          method: 'PUT',
          body: JSON.stringify({ push_enabled: true, expo_push_token: token }),
        });
      } catch {
        // non-critical — спробуємо ще раз наступного запуску
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user_id]);
}
