import { useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Brightness from 'expo-brightness';

type BrightnessSnapshot = {
  value: number;
  usedSystemBrightness: boolean;
};

/**
 * Тримає екран на максимальній яскравості, поки відкрито екран з QR.
 *
 * Той самий підхід, що і в застосунку пасажира
 * (mobile/src/hooks/useMaxScreenBrightness.ts): без цього зчитувач у салоні
 * погано бачить код на притемненому екрані, а водій/контролер щоразу мусить
 * лізти в шторку. Попередня яскравість (або режим системної яскравості на
 * Android) повертається, щойно екран втрачає фокус чи застосунок згортається.
 */
export function useMaxScreenBrightness(): void {
  useFocusEffect(
    useCallback(() => {
      let focused = true;
      let appActive = AppState.currentState === 'active';
      let snapshot: BrightnessSnapshot | null = null;
      let queue: Promise<void> = Promise.resolve();

      const restore = async () => {
        const previous = snapshot;
        snapshot = null;
        if (!previous) return;

        if (Platform.OS === 'android' && previous.usedSystemBrightness) {
          await Brightness.restoreSystemBrightnessAsync();
          return;
        }
        await Brightness.setBrightnessAsync(previous.value);
      };

      const applyDesiredBrightness = async () => {
        const shouldBeMaximum = focused && appActive;

        if (!shouldBeMaximum) {
          await restore();
          return;
        }

        if (!(await Brightness.isAvailableAsync())) return;

        if (!snapshot) {
          const usedSystemBrightness =
            Platform.OS === 'android' ? await Brightness.isUsingSystemBrightnessAsync() : false;
          const value = await Brightness.getBrightnessAsync();

          if (!focused || !appActive) return;
          snapshot = { value, usedSystemBrightness };
        }

        if (focused && appActive) {
          await Brightness.setBrightnessAsync(1);
        } else {
          await restore();
        }
      };

      const schedule = () => {
        queue = queue.then(applyDesiredBrightness, applyDesiredBrightness).catch(() => {
          // Яскравість — зручність, а не функція. Збій на конкретному пристрої
          // не має заважати відкрити або закрити екран з QR.
        });
      };

      schedule();

      const subscription = AppState.addEventListener('change', (state) => {
        appActive = state === 'active';
        schedule();
      });

      return () => {
        focused = false;
        subscription.remove();
        schedule();
      };
    }, []),
  );
}
