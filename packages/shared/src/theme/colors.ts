/**
 * Theme tokens (Wave 5).
 *
 * Both light and dark palettes share keys — компоненти можуть отримати поточну
 * через `useColors()`. Старий `colors` експорт залишається light для backward
 * compat — без масової міграції всі скріни рендеряться у light.
 */

export const lightColors = {
  primary: '#123a72',
  primarySoft: '#eaf1fb',
  primaryStrong: '#0d2b55',
  accent: '#d78f1b',
  accentSoft: '#fff4de',
  danger: '#b9352f',
  dangerSoft: '#fce8e6',
  success: '#2f6f4f',
  successSoft: '#e8f3ed',
  warning: '#9b6800',
  warningSoft: '#fff5dd',
  background: '#f2f4f7',
  surface: '#ffffff',
  surfaceMuted: '#f7f9fc',
  text: '#18212f',
  textMuted: '#667085',
  textSoft: '#8b95a7',
  border: '#d7deea',
  borderStrong: '#b8c4d8',
  shadow: 'rgba(16, 24, 40, 0.08)',
} as const;

export const darkColors = {
  primary: '#5a90d8',
  primarySoft: '#1c2a45',
  primaryStrong: '#a3c2ee',
  accent: '#e0a13a',
  accentSoft: '#3a2f1a',
  danger: '#e87a73',
  dangerSoft: '#3a1d1c',
  success: '#6dbf95',
  successSoft: '#19302a',
  warning: '#e3b250',
  warningSoft: '#3a2e16',
  background: '#0e131c',
  surface: '#1a212d',
  surfaceMuted: '#141a25',
  text: '#f1f4fb',
  textMuted: '#a8b1c2',
  textSoft: '#7d889c',
  border: '#2a3343',
  borderStrong: '#3a465c',
  shadow: 'rgba(0, 0, 0, 0.4)',
} as const;

export const colors = lightColors;

export type ColorScheme = 'light' | 'dark';
export type ColorName = keyof typeof lightColors;
export type ColorPalette = { readonly [K in ColorName]: string };
