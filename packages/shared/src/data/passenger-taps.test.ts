import { beforeEach, describe, expect, it, vi } from 'vitest';

// trip-sessions тягне lib/db (expo/op-sqlite) — у node-середовищі vitest він
// не парситься, тож підміняємо мінімальним фейком.
const execute = vi.fn();
vi.mock('../lib/db', () => ({ getDb: () => ({ execute }) }));

const { EMPTY_TAP_STATS, addPassengerTap, countTapsForTrip, getPassengerTapStats } =
  await import('./trip-sessions');

function rows(boarded: unknown, exited: unknown): void {
  execute.mockResolvedValue({ rows: [{ boarded, exited }] });
}

beforeEach(() => {
  execute.mockReset();
});

describe('getPassengerTapStats', () => {
  it('рахує наповнення салону як увійшло − вийшло', async () => {
    rows(20, 8);
    await expect(getPassengerTapStats('trip-1')).resolves.toEqual({
      boarded: 20,
      exited: 8,
      onboard: 12,
      taps: 28,
    });
  });

  it('SUM() над порожньою таблицею повертає NULL — не NaN у лічильнику', async () => {
    rows(null, null);
    await expect(getPassengerTapStats('trip-1')).resolves.toEqual(EMPTY_TAP_STATS);
  });

  it('зовсім порожня відповідь БД теж дає нулі', async () => {
    execute.mockResolvedValue({ rows: [] });
    await expect(getPassengerTapStats('trip-1')).resolves.toEqual(EMPTY_TAP_STATS);
  });

  it('якщо вийшло більше, ніж увійшло, салон не йде в мінус', async () => {
    rows(3, 5);
    const stats = await getPassengerTapStats('trip-1');
    expect(stats.onboard).toBe(0);
    // Але самі лічильники не спотворюються — «увійшло» лишається базою контролю оплати.
    expect(stats.boarded).toBe(3);
    expect(stats.exited).toBe(5);
  });
});

describe('addPassengerTap', () => {
  it('за замовчуванням пише посадку', async () => {
    rows(1, 0);
    await addPassengerTap('trip-1');
    expect(execute.mock.calls[0]?.[1]).toContain('in');
  });

  it('висадка пишеться напрямом out, коли в салоні є люди', async () => {
    rows(5, 2);
    await addPassengerTap('trip-1', 'out');
    const insert = execute.mock.calls.find((call) => String(call[0]).includes('INSERT'));
    expect(insert?.[1]).toContain('out');
  });

  it('з порожнього салону висадити не можна — INSERT не відбувається', async () => {
    rows(3, 3);
    const stats = await addPassengerTap('trip-1', 'out');
    expect(execute.mock.calls.some((call) => String(call[0]).includes('INSERT'))).toBe(false);
    expect(stats.onboard).toBe(0);
    // Саме це раніше ламало лічильник: «вийшло» переганяло «увійшло»
    // і «у салоні» більше ніколи не зрушувало з нуля.
    expect(stats.exited).toBe(3);
  });

  it('посадка з порожнього салону дозволена завжди', async () => {
    rows(0, 0);
    await addPassengerTap('trip-1', 'in');
    expect(execute.mock.calls.some((call) => String(call[0]).includes('INSERT'))).toBe(true);
  });
});

describe('countTapsForTrip', () => {
  it('snapshot рейсу — це ті, хто зайшов, а не ті, хто лишився в салоні', async () => {
    rows(20, 8);
    await expect(countTapsForTrip('trip-1')).resolves.toBe(20);
  });
});
