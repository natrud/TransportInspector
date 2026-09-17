import { describe, expect, it } from 'vitest';
import {
  FINE_MULTIPLIER,
  calculateFineKopecks,
  fineFromTicketPriceKopecks,
  ticketPriceToKopecks,
} from '../lib/fine-math';

describe('calculateFineKopecks', () => {
  it('повертає 20× від базової ціни (default Київ 15 грн → 300 грн)', () => {
    expect(calculateFineKopecks(1500)).toBe(30_000);
  });

  it('8 грн (стара ціна Києва) → 160 грн', () => {
    expect(calculateFineKopecks(800)).toBe(16_000);
  });

  it('30 грн (преміум-транспорт) → 600 грн', () => {
    expect(calculateFineKopecks(3000)).toBe(60_000);
  });

  it('константа FINE_MULTIPLIER = 20 (за ст. 135 КУпАП)', () => {
    expect(FINE_MULTIPLIER).toBe(20);
  });

  it('нуль → нуль', () => {
    expect(calculateFineKopecks(0)).toBe(0);
  });

  it('відʼємні значення → нуль (захист від bad input)', () => {
    expect(calculateFineKopecks(-100)).toBe(0);
  });

  it('заокруглює дробові копійки', () => {
    expect(calculateFineKopecks(1500.7)).toBe(20 * 1501);
  });
});

describe('fineFromTicketPriceKopecks', () => {
  it('Ticket.price у гривнях → 20× у копійках (15 грн → 300 грн)', () => {
    expect(fineFromTicketPriceKopecks(15)).toBe(30_000);
  });

  it('безкоштовний квиток (0 грн) → 0', () => {
    expect(fineFromTicketPriceKopecks(0)).toBe(0);
  });

  it('дробова ціна квитка заокруглюється до копійки', () => {
    expect(ticketPriceToKopecks(12.345)).toBe(1235);
  });

  it('NaN з бекенда → 0, а не NaN у сумі штрафу', () => {
    expect(fineFromTicketPriceKopecks(Number.NaN)).toBe(0);
  });
});
