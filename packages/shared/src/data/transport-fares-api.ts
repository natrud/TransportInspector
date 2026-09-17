import { api } from '../lib/api';

/**
 * Ціна квитка за видом транспорту — з адмінки (SETTINGS_SPEC transport_price_*,
 * /admin/app-setting/list). Єдине джерело для «Видати постанову» без
 * прив'язаного квитка: контролер обирає тариф, штраф = 20× цієї ціни.
 *
 * Перелік видів транспорту і суми НІКОЛИ не хардкодяться на клієнті — скільки
 * їх і які ціни, вирішує бекенд (app/api/inspector.py::get_transport_fares).
 * Якщо адмін додасть транспорт чи змінить ціну, застосунок підхопить це без
 * оновлення застосунку.
 */
export interface TransportFare {
  /** Той самий код, що й Ticket.transport ('bus' | 'trolley' | ...) — форматується formatTransport(). */
  transport: string;
  /** Ціле число у ГРИВНЯХ, як і Ticket.price. */
  price: number;
}

interface BackendTransportFare {
  transport: string;
  price: number;
}

interface BackendTransportFaresOut {
  fares: BackendTransportFare[];
}

export async function getTransportFares(): Promise<TransportFare[]> {
  const data = await api<BackendTransportFaresOut>('/api/v1/inspector/transport-fares');
  return Array.isArray(data.fares) ? data.fares : [];
}
