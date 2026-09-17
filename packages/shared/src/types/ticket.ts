/**
 * Domain-моделі для квитка. Дзеркалять `class Ticket(Base)` з реального бекенда
 * (SQLAlchemy ORM). Поля та enum-значення повністю відповідають schema; при
 * підʼєднанні справжнього API мати не доведеться нічого мапати.
 *
 * Джерело істини: docs/class Ticket.docx (надано користувачем).
 */

/** Статус квитка протягом життєвого циклу. */
export enum TicketStatus {
  /** Випущений, ще не активований (не сканований у валідаторі). */
  issued = 'issued',
  /** Сканований — у валідному вікні (active_until у майбутньому). */
  active = 'active',
  /** Активне вікно вичерпано (after active_until). */
  used = 'used',
  /** Загальний термін придатності вийшов (after expires_at). */
  expired = 'expired',
}

/** Тип тарифу. Розширюваний enum (бекенд може додати, напр., discount). */
export enum TicketFareType {
  paid = 'paid',
  free = 'free',
}

/**
 * Тип транспорту. У схемі це PgEnum 'transportenum' — точні значення на бекенді,
 * тут тримаємо як string union для гнучкості. Розшир за потреби.
 */
export type Transport = 'bus' | 'trolley' | 'tram' | 'metro' | 'minibus' | string;

/** Метод валідації, як у схемі: validation_method. */
export type ValidationMethod = 'qr' | 'ble' | 'nfc';

/**
 * Повна модель квитка, як приходить з бекенда. ISO-8601 рядки для дат
 * (а не Date) — щоб уникнути серіалізаційних сюрпризів між JSON і React Query.
 */
export interface Ticket {
  id: string; // String(16), UUID hex[:16]
  order_id: string;
  user_id: string; // String(36)
  transport: Transport;
  price: number; // ціле число, вже у гривнях (напр. 15 = 15 грн). Не плутати з fine_amount_kopecks/base_fare_kopecks — ті у копійках.
  status: TicketStatus;
  fare_type: TicketFareType;
  created_at: string; // ISO-8601
  use_by_days: number; // default 30
  validated_at: string | null;
  active_until: string | null;
  validated_serial_number: string | null; // GID контролера
  validated_door_number: number | null; // номер дверей валідатора
  validation_method: ValidationMethod | null;
  validation_card_hash: string | null; // SHA-256 / String(64)
  department_id: string | null;
}

/**
 * Полегшена проекція для лайв-стрічки RouteActivity. Для ролі "водій" не несе
 * user_id/order_id — privacy-by-default. Інспектор може отримати повний Ticket.
 */
export interface RouteActivityEntry {
  id: string;
  validated_at: string; // у фіді тільки провалідовані → non-null
  transport: Transport;
  fare_type: TicketFareType;
  price: number;
  validated_door_number: number | null;
  validation_method: ValidationMethod | null;
}

/** Маршрут — бекенд-агностична проекція. */
export interface Route {
  id: string;
  code: string; // короткий номер маршруту, напр. "5А"
  name: string; // повна назва, напр. "Вокзал — Гідропарк"
  transport: Transport;
}

/** Користувач застосунку (інспектор або водій). */
export type AppRole = 'user' | 'inspector' | 'driver' | 'moderator' | 'admin' | 'superadmin';

export interface Session {
  user_id: string;
  display_name: string;
  role: AppRole;
  /** GID контролера/водія, що зберігається у Ticket.validated_serial_number. */
  serial_number: string;
  /** Для драйвера — жорстко привʼязаний маршрут з адмінки; null для інспектора. */
  assigned_route_id: string | null;
  /** Другий крок вибору (уточнення в межах маршруту) — тільки на пристрої, без бекенда. */
  assigned_vehicle_number: string | null;
}

/**
 * Розпарсений payload QR-коду. Підтримуємо три варіанти (toleratnt parser):
 *   1. JSON: {"ticket_id": "...", "hash": "..."}
 *   2. id:hash рядок
 *   3. Голий ticket.id (для legacy QR без hash)
 */
export interface QrPayload {
  ticket_id: string;
  hash: string | null;
}

/** Причина невалідності квитка. */
export type ValidationFailureReason =
  | 'not-found'
  | 'expired'
  | 'used'
  | 'not-active'
  | 'hash-mismatch'
  | 'route-mismatch'
  | 'malformed-qr'
  | 'offline'
  | 'unknown';

export type ValidationResult =
  | { kind: 'valid'; ticket: Ticket }
  | { kind: 'invalid'; reason: ValidationFailureReason; ticket: Ticket | null; message: string };
