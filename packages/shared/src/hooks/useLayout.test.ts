import { describe, expect, it, vi } from 'vitest';

// Модуль тягне react-native лише заради useWindowDimensions — для перевірки
// брейкпоінтів достатньо заглушки.
vi.mock('react-native', () => ({ useWindowDimensions: () => ({ width: 0, height: 0 }) }));

const { CONTENT_MAX_WIDTH, describeLayout } = await import('./useLayout');

describe('describeLayout', () => {
  it('телефон у портреті — одна колонка', () => {
    const l = describeLayout(360, 800);
    expect(l.isLandscape).toBe(false);
    expect(l.isTablet).toBe(false);
    expect(l.isWide).toBe(false);
    expect(l.contentMaxWidth).toBe(CONTENT_MAX_WIDTH);
  });

  it('телефон у альбомній — низьке вікно, але не широке', () => {
    const l = describeLayout(800, 360);
    expect(l.isLandscape).toBe(true);
    expect(l.isShort).toBe(true);
    expect(l.isWide).toBe(false);
  });

  it('планшет у портреті — планшет, але однією колонкою', () => {
    const l = describeLayout(800, 1280);
    expect(l.isTablet).toBe(true);
    expect(l.isWide).toBe(false);
    expect(l.isShort).toBe(false);
  });

  it('планшет у альбомній — дві колонки і ширша смуга контенту', () => {
    const l = describeLayout(1280, 800);
    expect(l.isTablet).toBe(true);
    expect(l.isLandscape).toBe(true);
    expect(l.isWide).toBe(true);
    expect(l.contentMaxWidth).toBe(CONTENT_MAX_WIDTH * 2);
  });

  it('квадратне вікно не вважається альбомним', () => {
    expect(describeLayout(700, 700).isLandscape).toBe(false);
  });
});
