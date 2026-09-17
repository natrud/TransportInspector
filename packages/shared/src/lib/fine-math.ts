/**
 * Чиста математика штрафу. Без side-imports — щоб тестувалось без mock-у
 * SQLite/SecureStore.
 *
 * Згідно зі ст. 135 КУпАП — штраф за безквитковий проїзд у міському
 * транспорті = 20 × вартість одноразового квитка.
 */

export const FINE_MULTIPLIER = 20;

export function calculateFineKopecks(baseFareKopecks: number): number {
  return Math.max(0, Math.round(baseFareKopecks)) * FINE_MULTIPLIER;
}

/**
 * Ticket.price приходить у ГРИВНЯХ (ціле число, напр. 15), а штраф рахується
 * в копійках. Один конвертер на обидва застосунки — щоб ніде не помножити на
 * 100 двічі й не отримати штраф у 100 разів більший.
 */
export function ticketPriceToKopecks(priceHryvnia: number): number {
  if (!Number.isFinite(priceHryvnia)) return 0;
  return Math.max(0, Math.round(priceHryvnia * 100));
}

/** Штраф за конкретним квитком: 20 × його ціна. */
export function fineFromTicketPriceKopecks(priceHryvnia: number): number {
  return calculateFineKopecks(ticketPriceToKopecks(priceHryvnia));
}
