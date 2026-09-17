import type { AppRole } from '../types/ticket';

/**
 * Хто має право відкрити застосунок.
 *
 * Джерело істини — роль акаунта в БД (Account.role), яку віддає
 * GET /api/v1/profile/me. Бекенд і сам закриває свої endpoint'и
 * (app/core/security.py), але застосунок мусить сказати це людині ще на
 * вході — інакше водій у застосунку контролера бачить порожні екрани
 * замість зрозумілого «зверніться до адміністратора».
 *
 *   застосунок Водія     → driver, admin, superadmin
 *   застосунок Контролера → inspector, admin, superadmin
 */

export type AppKind = 'driver' | 'controller';

export const DRIVER_APP_ROLES: readonly AppRole[] = ['driver', 'admin', 'superadmin'];
export const CONTROLLER_APP_ROLES: readonly AppRole[] = ['inspector', 'admin', 'superadmin'];

export const APP_TITLES: Record<AppKind, string> = {
  driver: 'Застосунок водія',
  controller: 'Застосунок контролера',
};

export function allowedRolesFor(app: AppKind): readonly AppRole[] {
  return app === 'driver' ? DRIVER_APP_ROLES : CONTROLLER_APP_ROLES;
}

export function isRoleAllowed(role: AppRole | null | undefined, app: AppKind): boolean {
  if (!role) return false;
  return allowedRolesFor(app).includes(role);
}

const ROLE_LABELS: Record<AppRole, string> = {
  user: 'Пасажир',
  inspector: 'Контролер',
  driver: 'Водій',
  moderator: 'Модератор',
  admin: 'Адміністратор',
  superadmin: 'Суперадміністратор',
};

/** Людська назва ролі — щоб у «Налаштуваннях» стояла справжня роль, а не константа. */
export function formatRole(role: AppRole | null | undefined): string {
  if (!role) return '—';
  return ROLE_LABELS[role] ?? role;
}

/** Текст для людини, якій цей застосунок не належить. */
export function accessDeniedMessage(role: AppRole | null | undefined, app: AppKind): string {
  const needed = allowedRolesFor(app).map((r) => ROLE_LABELS[r]).join(', ');
  return (
    `Ваша роль — «${formatRole(role)}». ${APP_TITLES[app]} доступний лише для ролей: ${needed}.\n\n` +
    'Зверніться до адміністратора системи, щоб отримати потрібний доступ.'
  );
}

/** Логін пройшов, але роль не та — окремий тип, щоб UI не парсив текст помилки. */
export class AccessDeniedError extends Error {
  readonly role: AppRole | null;
  readonly app: AppKind;

  constructor(role: AppRole | null, app: AppKind) {
    super(accessDeniedMessage(role, app));
    this.name = 'AccessDeniedError';
    this.role = role;
    this.app = app;
  }
}
