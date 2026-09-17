import { type DB, open } from '@op-engineering/op-sqlite';

let instance: DB | null = null;

export function getDb(): DB {
  if (!instance) {
    instance = open({ name: 'transport-inspector.db' });
  }
  return instance;
}

export async function initDb(): Promise<void> {
  const db = getDb();
  await db.execute('PRAGMA journal_mode = WAL');
  await db.execute('PRAGMA synchronous = FULL');
  await db.execute('PRAGMA foreign_keys = ON');

  // Журнал валідацій — кожен скан контролера. Використовується для
  // RecentScansScreen і ShiftSummary.
  //   controller_id     — хто саме сканував (фільтр при читанні, щоб на
  //                       спільному пристрої контролери не бачили чужі скани);
  //   client_action_id  — ключ ідемпотентності для синхронізації з бекендом;
  //   synced_at         — коли рядок доїхав у controller_action_log на бекенді
  //                       (NULL = ще в черзі; такі рядки ніколи не видаляє prune).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS validation_log (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      route_id TEXT,
      result TEXT NOT NULL,
      reason TEXT,
      scanned_at INTEGER NOT NULL,
      payload TEXT,
      controller_id TEXT,
      inspection_session_id TEXT,
      client_action_id TEXT,
      synced_at INTEGER
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS validation_log_recent_idx
      ON validation_log(scanned_at DESC)
  `);

  // Міграція для вже наявних установок — додаємо колонки, якщо їх немає.
  for (const col of [
    'ALTER TABLE validation_log ADD COLUMN controller_id TEXT',
    'ALTER TABLE validation_log ADD COLUMN inspection_session_id TEXT',
    'ALTER TABLE validation_log ADD COLUMN client_action_id TEXT',
    'ALTER TABLE validation_log ADD COLUMN synced_at INTEGER',
  ]) {
    try { await db.execute(col); } catch { /* вже існує */ }
  }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS validation_log_controller_idx
      ON validation_log(controller_id, scanned_at DESC)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS validation_log_pending_idx
      ON validation_log(synced_at)
  `);

  // Постанови ст. 135 КУпАП. Тримаємо локально для офлайну і журналу.
  // synced_at != NULL коли відправлено на бекенд.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS fines (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      controller_serial TEXT NOT NULL,
      route_id TEXT,
      ticket_id TEXT,
      offender_name TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      doc_number TEXT NOT NULL,
      reason TEXT NOT NULL,
      base_fare_kopecks INTEGER NOT NULL,
      fine_amount_kopecks INTEGER NOT NULL,
      location_note TEXT,
      status TEXT NOT NULL,
      synced_at INTEGER,
      server_id TEXT,
      controller_id TEXT,
      inspection_session_id TEXT
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS fines_recent_idx
      ON fines(created_at DESC)
  `);

  // Міграція: нові колонки (додаємо якщо не існують)
  for (const col of [
    'ALTER TABLE fines ADD COLUMN offender_phone TEXT',
    'ALTER TABLE fines ADD COLUMN offender_user_id TEXT',
    'ALTER TABLE fines ADD COLUMN controller_id TEXT',
    'ALTER TABLE fines ADD COLUMN inspection_session_id TEXT',
  ]) {
    try { await db.execute(col); } catch { /* вже існує */ }
  }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS fines_controller_idx
      ON fines(controller_id, created_at DESC)
  `);

  // Журнал тапів пасажирів водія. Один запис на тап (для undo).
  // trip_id посилається на trip_sessions.id.
  //   direction — 'in' (увійшов) або 'out' (вийшов). Тримаємо обидва напрями
  //   окремо: «увійшло» годує контроль оплати (порівняння з валідаціями), а
  //   «вийшло» потрібне лише щоб показати наповнення салону. Якби вихід просто
  //   зменшував один лічильник, кількість «зайців» була б заниженою.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS passenger_taps (
      id TEXT PRIMARY KEY,
      trip_id TEXT,
      tapped_at INTEGER NOT NULL,
      undone INTEGER NOT NULL DEFAULT 0,
      direction TEXT NOT NULL DEFAULT 'in'
    )
  `);

  // Міграція для вже встановлених застосунків: старі тапи — це посадка.
  try {
    await db.execute(`ALTER TABLE passenger_taps ADD COLUMN direction TEXT NOT NULL DEFAULT 'in'`);
  } catch { /* колонка вже є */ }

  await repairSurplusExits(db);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS passenger_taps_trip_idx
      ON passenger_taps(trip_id, tapped_at DESC)
  `);

  // Сесії рейсів водія: start/end маркери.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS trip_sessions (
      id TEXT PRIMARY KEY,
      driver_serial TEXT NOT NULL,
      route_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      passenger_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS trip_sessions_recent_idx
      ON trip_sessions(started_at DESC)
  `);

  await pruneLocalDb();
}

/**
 * Разовий ремонт даних лічильника пасажирів.
 *
 * У збірці, де кнопка «вийшов» ще не мала обмеження, можна було висаджувати
 * пасажирів з порожнього салону. Там, де виходів записано більше, ніж посадок,
 * «у салоні» назавжди показує нуль. Скасовуємо зайві виходи (лишаємо найраніші
 * — рівно стільки, скільки було посадок); «увійшло» не чіпаємо, бо на ньому
 * тримається контроль оплати.
 *
 * Множину id рахуємо підзапитом до UPDATE — вона фіксується ДО змін, тож
 * скасування одного рядка не впливає на рішення щодо наступних.
 */
async function repairSurplusExits(db: DB): Promise<void> {
  try {
    await db.execute(`
      UPDATE passenger_taps SET undone = 1
       WHERE id IN (
         SELECT t.id FROM passenger_taps t
          WHERE t.undone = 0 AND t.direction = 'out'
            AND (SELECT COUNT(*) FROM passenger_taps e
                  WHERE e.undone = 0 AND e.direction = 'out'
                    AND e.trip_id IS t.trip_id
                    AND e.tapped_at <= t.tapped_at)
              > (SELECT COUNT(*) FROM passenger_taps b
                  WHERE b.undone = 0 AND b.direction <> 'out'
                    AND b.trip_id IS t.trip_id)
       )
    `);
  } catch {
    // Ремонт не критичний — не валимо старт застосунку.
  }
}

/** Скільки днів тримати локально вже синхронізовані записи. */
const VALIDATION_LOG_RETENTION_DAYS = 14;
const FINES_RETENTION_DAYS = 30;
/**
 * ETag-кеш. Кожен старт рейсу дає новий URL (since_ms у запиті), а тіло
 * відповіді там до 200 записів — без прибирання таблиця росла б вічно.
 * Тримаємо лише свіже: старі URL більше ніколи не запитають.
 */
const ETAG_RETENTION_DAYS = 3;
const ETAG_MAX_ROWS = 100;
/** Жорсткий стелаж на кількість синхронізованих сканів (страховка від росту). */
const VALIDATION_LOG_MAX_SYNCED_ROWS = 1000;

/**
 * Чистить локальну базу: видаляє ВЖЕ синхронізовані (synced_at != NULL) старі
 * записи. Несинхронізовані (в черзі на бекенд) не чіпає ніколи — це втрата
 * даних. Локальна база = кеш + черга, архів живе на бекенді (controller_action_log
 * / inspector_fines). Викликається на старті застосунку і після кожної успішної
 * синхронізації.
 */
export async function pruneLocalDb(): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const vCutoff = now - VALIDATION_LOG_RETENTION_DAYS * 86_400_000;
  const fCutoff = now - FINES_RETENTION_DAYS * 86_400_000;

  try {
    await db.execute(
      `DELETE FROM validation_log WHERE synced_at IS NOT NULL AND scanned_at < ?`,
      [vCutoff],
    );
    // Плюс стелаж: якщо синхронізованих усе одно забагато — лишаємо найновіші.
    await db.execute(
      `DELETE FROM validation_log
        WHERE synced_at IS NOT NULL
          AND id NOT IN (
            SELECT id FROM validation_log
            WHERE synced_at IS NOT NULL
            ORDER BY scanned_at DESC
            LIMIT ?
          )`,
      [VALIDATION_LOG_MAX_SYNCED_ROWS],
    );
    await db.execute(
      `DELETE FROM fines WHERE synced_at IS NOT NULL AND created_at < ?`,
      [fCutoff],
    );
    // Таблиця створюється на вимогу (lib/etag-cache) — до першого запиту її
    // може не бути, тому власний try.
    try {
      await db.execute(`DELETE FROM etag_cache WHERE cached_at < ?`, [
        now - ETAG_RETENTION_DAYS * 86_400_000,
      ]);
      await db.execute(
        `DELETE FROM etag_cache
          WHERE url NOT IN (
            SELECT url FROM etag_cache ORDER BY cached_at DESC LIMIT ?
          )`,
        [ETAG_MAX_ROWS],
      );
    } catch {
      /* кешу ще нема */
    }
    await db.execute('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {
    // прибирання не критичне — не валимо старт застосунку
  }
}

export function resetDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
