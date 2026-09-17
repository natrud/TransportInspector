import { useColorScheme } from 'react-native';
import { type ColorPalette, darkColors, lightColors } from './colors';

/**
 * Повертає активну палітру за системною темою. Override тема додається у
 * Settings (task #8) через окремий storage.
 */
export function useColors(): ColorPalette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkColors : lightColors;
}
