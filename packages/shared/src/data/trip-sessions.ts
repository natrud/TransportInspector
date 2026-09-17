import { getDb } from '../lib/db';

/**
 * Сесії рейсу водія — маркери start/end. Один активний trip на пристрій
 * одночасно. На end записуємо фінальний passenger_count (snapshot).
 */

export interface TripSession {
  id: string;
  driver_serial: string;
  route_id: string;
  started_at: number;
  ended_at: number | null;
  passenger_count: number;
}

function genId(): string {
  return `trip-${Date.now().toString(36)}-${Math.floor(Math.random() * 10_000).toString(36)}`;
}

export async function startTrip(params: {
  driverSerial: string;
  routeId: string;
}): Promise<TripSession> {
  const db = getDb();
  // Закриваємо попередній активний trip — захист від випадку якщо забули завершити.
  await db.execute(
    `UPDATE trip_sessions SET ended_at = ? WHERE ended_at IS NULL AND driver_serial = ?`,
    [Date.now(), params.driverSerial],
  );

  const trip: TripSession = {
    id: genId(),
    driver_serial: params.driverSerial,
    route_id: params.routeId,
    started_at: Date.now(),
    ended_at: null,
    passenger_count: 0,
  };
  await db.execute(
    `INSERT INTO trip_sessions (id, driver_serial, route_id, started_at, ended_at, passenger_count)
     VALUES (?, ?, ?, ?, NULL, 0)`,
    [trip.id, trip.driver_serial, trip.route_id, trip.started_at],
  );
  return trip;
}

export async function endTrip(tripId: string): Promise<void> {
  const db = getDb();
  const taps = await countTapsForTrip(tripId);
  await db.execute(
    `UPDATE trip_sessions SET ended_at = ?, passenger_count = ? WHERE id = ?`,
    [Date.now(), taps, tripId],
  );
}

export async function getActiveTrip(driverSerial: string): Promise<TripSession | null> {
  const db = getDb();
  const res = await db.execute(
    `SELECT id, driver_serial, route_id, started_at, ended_at, passenger_count
     FROM trip_sessions
     WHERE driver_serial = ? AND ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`,
    [driverSerial],
  );
  const row = res.rows?.[0];
  return row ? rowToTrip(row) : null;
}

export async function listRecentTrips(driverSerial: string, limit = 10): Promise<TripSession[]> {
  const db = getDb();
  const res = await db.execute(
    `SELECT id, driver_serial, route_id, started_at, ended_at, passenger_count
     FROM trip_sessions
     WHERE driver_serial = ?
     ORDER BY started_at DESC
     LIMIT ?`,
    [driverSerial, limit],
  );
  return (res.rows ?? []).map(rowToTrip);
}

function rowToTrip(r: Record<string, unknown>): TripSession {
  return {
    id: String(r.id),
    driver_serial: String(r.driver_serial),
    route_id: String(r.route_id),
    started_at: Number(r.started_at),
    ended_at: r.ended_at != null ? Number(r.ended_at) : null,
    passenger_count: Number(r.passenger_count ?? 0),
  };
}

/* ============================================================================
   Passenger taps — окрема таблиця, дозволяє undo (помічаємо undone=1).
   Кожен тап має напрям: 'in' (увійшов) або 'out' (вийшов).
     увійшло = count(direction='in')   — база для контролю оплати;
     вийшло  = count(direction='out');
     у салоні = увійшло − вийшло.
   Вихід НЕ зменшує «увійшло»: інакше порівняння з валідованими квитками
   занижувало б кількість неоплачених проїздів.
   ============================================================================ */

/** Напрям тапу водія: пасажир зайшов чи вийшов. */
export type PassengerDirection = 'in' | 'out';

function genTapId(): string {
  return `tap-${Date.now().toString(36)}-${Math.floor(Math.random() * 10_000).toString(36)}`;
}

export async function addPassengerTap(
  tripId: string | null,
  direction: PassengerDirection = 'in',
): Promise<PassengerTapStats> {
  const db = getDb();

  // З порожнього салону вийти нікому. Без цієї перевірки «вийшло» переганяє
  // «увійшло», і «у салоні» назавжди застрягає на нулі: скільки не тапай «+»,
  // число не зрушить, доки посадок не стане більше за всі зайві виходи.
  if (direction === 'out') {
    const current = await getPassengerTapStats(tripId);
    if (current.onboard <= 0) return current;
  }

  await db.execute(
    `INSERT INTO passenger_taps (id, trip_id, tapped_at, undone, direction) VALUES (?, ?, ?, 0, ?)`,
    [genTapId(), tripId, Date.now(), direction],
  );
  return getPassengerTapStats(tripId);
}

/**
 * Скасовує останній тап — будь-якого напряму. Це виправлення помилкового
 * натискання, а не «пасажир вийшов»: для виходу є власна кнопка.
 */
export async function undoLastTap(tripId: string | null): Promise<PassengerTapStats> {
  const db = getDb();
  // Знаходимо останній не-undone тап у цій сесії.
  const res = await db.execute(
    tripId
      ? `SELECT id FROM passenger_taps WHERE trip_id = ? AND undone = 0 ORDER BY tapped_at DESC LIMIT 1`
      : `SELECT id FROM passenger_taps WHERE trip_id IS NULL AND undone = 0 ORDER BY tapped_at DESC LIMIT 1`,
    tripId ? [tripId] : [],
  );
  const row = res.rows?.[0];
  if (row) {
    await db.execute(`UPDATE passenger_taps SET undone = 1 WHERE id = ?`, [String(row.id)]);
  }
  return getPassengerTapStats(tripId);
}

export interface PassengerTapStats {
  /** Скільки пасажирів зайшло з початку рейсу. Саме це порівнюється з валідаціями. */
  boarded: number;
  /** Скільки вийшло з початку рейсу. */
  exited: number;
  /** Скільки зараз у салоні (boarded − exited, не менше нуля). */
  onboard: number;
  /** Чи є взагалі тапи цього рейсу — щоб відрізнити «порожньо» від «ще не рахували». */
  taps: number;
}

export const EMPTY_TAP_STATS: PassengerTapStats = {
  boarded: 0,
  exited: 0,
  onboard: 0,
  taps: 0,
};

/**
 * Статистика тапів пасажирів за один SQL-запит. Це гарантує, що лічильник на
 * головній плиті і «Увійшло» у картці контролю оплати читаються з одного
 * джерела (одна queryKey, один кеш) — неможливо мати розсинхронізацію між ними.
 */
export async function getPassengerTapStats(tripId: string | null): Promise<PassengerTapStats> {
  const db = getDb();
  const res = await db.execute(
    tripId
      ? `SELECT
           SUM(CASE WHEN direction = 'out' THEN 0 ELSE 1 END) as boarded,
           SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) as exited
         FROM passenger_taps WHERE trip_id = ? AND undone = 0`
      : `SELECT
           SUM(CASE WHEN direction = 'out' THEN 0 ELSE 1 END) as boarded,
           SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) as exited
         FROM passenger_taps WHERE trip_id IS NULL AND undone = 0`,
    tripId ? [tripId] : [],
  );
  const row = res.rows?.[0];
  // SUM() над порожньою вибіркою повертає NULL, не 0.
  const boarded = Number(row?.boarded ?? 0);
  const exited = Number(row?.exited ?? 0);
  return {
    boarded,
    exited,
    onboard: Math.max(0, boarded - exited),
    taps: boarded + exited,
  };
}

/** Скільки пасажирів зайшло за рейс — snapshot для завершення рейсу. */
export async function countTapsForTrip(tripId: string | null): Promise<number> {
  const stats = await getPassengerTapStats(tripId);
  return stats.boarded;
}
