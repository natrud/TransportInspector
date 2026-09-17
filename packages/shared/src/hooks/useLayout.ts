import { useWindowDimensions } from 'react-native';

/**
 * Розміри вікна застосунку → рішення про розкладку.
 *
 * Обидва застосунки крутяться на всьому: від 5" телефона до 11" планшета в
 * альбомній орієнтації. Читаємо саме розмір вікна (а не «це планшет?»), бо
 * після зняття блокування портрета той самий пристрій буває і вузьким, і
 * широким — і компонент має перебудуватись без перезапуску.
 */

/** Ширина смуги контенту, за якою рядки тексту стають незручно довгими. */
export const CONTENT_MAX_WIDTH = 720;

/** Від цієї ширини вікна є сенс у двох колонках. */
const TWO_COLUMN_MIN_WIDTH = 840;

/** Нижче цієї висоти вертикального місця мало — великі цифри треба зменшити. */
const SHORT_VIEWPORT_HEIGHT = 520;

export interface LayoutInfo {
  width: number;
  height: number;
  isLandscape: boolean;
  /** Найкоротша сторона ≥ 600dp — планшетний клас пристрою. */
  isTablet: boolean;
  /** Вікно достатньо широке для двоколонкової розкладки. */
  isWide: boolean;
  /** Вікно низьке (альбомний телефон) — герой-цифри слід зменшити. */
  isShort: boolean;
  /** Максимальна ширина однієї колонки контенту. */
  contentMaxWidth: number;
}

/**
 * Чиста функція рішення — окремо від хука, щоб брейкпоінти можна було
 * перевірити тестом без рендер-середовища React Native.
 */
export function describeLayout(width: number, height: number): LayoutInfo {
  const isLandscape = width > height;
  const isWide = width >= TWO_COLUMN_MIN_WIDTH;
  return {
    width,
    height,
    isLandscape,
    isTablet: Math.min(width, height) >= 600,
    isWide,
    isShort: height < SHORT_VIEWPORT_HEIGHT,
    // У дві колонки смуга контенту ширша — але кожна колонка все одно
    // лишається в межах CONTENT_MAX_WIDTH.
    contentMaxWidth: isWide ? CONTENT_MAX_WIDTH * 2 : CONTENT_MAX_WIDTH,
  };
}

export function useLayout(): LayoutInfo {
  const { width, height } = useWindowDimensions();
  return describeLayout(width, height);
}
