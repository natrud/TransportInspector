import { describe, expect, it } from 'vitest';
import type { AppRole } from '../types/ticket';
import {
  AccessDeniedError,
  CONTROLLER_APP_ROLES,
  DRIVER_APP_ROLES,
  accessDeniedMessage,
  formatRole,
  isRoleAllowed,
} from './app-access';

const ALL_ROLES: AppRole[] = ['user', 'inspector', 'driver', 'moderator', 'admin', 'superadmin'];

describe('isRoleAllowed — застосунок водія', () => {
  it('пускає driver, admin, superadmin', () => {
    expect(isRoleAllowed('driver', 'driver')).toBe(true);
    expect(isRoleAllowed('admin', 'driver')).toBe(true);
    expect(isRoleAllowed('superadmin', 'driver')).toBe(true);
  });

  it('не пускає нікого іншого', () => {
    const denied = ALL_ROLES.filter((r) => !isRoleAllowed(r, 'driver'));
    expect(denied).toEqual(['user', 'inspector', 'moderator']);
  });
});

describe('isRoleAllowed — застосунок контролера', () => {
  it('пускає inspector, admin, superadmin', () => {
    expect(isRoleAllowed('inspector', 'controller')).toBe(true);
    expect(isRoleAllowed('admin', 'controller')).toBe(true);
    expect(isRoleAllowed('superadmin', 'controller')).toBe(true);
  });

  it('не пускає нікого іншого — водія в тому числі', () => {
    const denied = ALL_ROLES.filter((r) => !isRoleAllowed(r, 'controller'));
    expect(denied).toEqual(['user', 'driver', 'moderator']);
  });
});

describe('isRoleAllowed — відсутня роль', () => {
  it('null/undefined = доступу немає (fail closed)', () => {
    expect(isRoleAllowed(null, 'driver')).toBe(false);
    expect(isRoleAllowed(undefined, 'controller')).toBe(false);
  });
});

describe('списки ролей', () => {
  it('відповідають ролям бекенда (app/core/security.py)', () => {
    expect([...DRIVER_APP_ROLES]).toEqual(['driver', 'admin', 'superadmin']);
    expect([...CONTROLLER_APP_ROLES]).toEqual(['inspector', 'admin', 'superadmin']);
  });
});

describe('повідомлення для людини', () => {
  it('називає роль і відсилає до адміністратора', () => {
    const msg = accessDeniedMessage('driver', 'controller');
    expect(msg).toContain('Водій');
    expect(msg).toContain('Контролер');
    expect(msg).toContain('адміністратора');
  });

  it('невідома роль не ламає текст', () => {
    expect(formatRole('ghost' as AppRole)).toBe('ghost');
  });

  it('AccessDeniedError несе роль і застосунок', () => {
    const err = new AccessDeniedError('user', 'driver');
    expect(err).toBeInstanceOf(Error);
    expect(err.role).toBe('user');
    expect(err.app).toBe('driver');
    expect(err.message).toContain('Пасажир');
  });
});
