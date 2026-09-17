import type { AppRole, Session } from '../types/ticket';
import { api } from '../lib/api';
import { type AppKind, AccessDeniedError, isRoleAllowed } from '../lib/app-access';
import { clearTokens, saveLoginToken } from '../lib/auth';
import { MOCK_ROUTES } from './mock-store';

function delay(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock-логін. На реальному бекенді: OIDC → /me → бекенд повертає роль і,
 * для драйвера, прив'язаний маршрут (зкейлено з адмінки).
 *
 * Тут імітуємо чотири предустановлені сесії — інспектор + по водію на кожен
 * перший і третій маршрути; ще одна — інспектор Дарʼя.
 */

export interface MockLoginParams {
  role: AppRole;
  /** Тільки для драйвера: який маршрут йому привʼязано. */
  routeId?: string;
}

export interface RealLoginParams {
  email: string;
  password: string;
  /** Який застосунок логінить — визначає, які ролі сюди пускати. */
  app: AppKind;
  /** Тільки для водія — прив'язаний маршрут. */
  routeId?: string | null;
}

interface LoginResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
}

interface ProfileResponse {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
  assigned_route_id: string | null;
}

/**
 * Реальний логін через POST /api/v1/auth/login.
 * Після логіну завантажує профіль з БД для отримання assigned_route_id і ролі.
 *
 * Роль береться ВИКЛЮЧНО з профілю на бекенді — ніяких клієнтських дефолтів:
 * саме вона вирішує, чи пускати людину в цей застосунок. Якщо профіль не
 * завантажився, вхід не відбувається взагалі — краще зрозуміла помилка, ніж
 * сесія з вгаданою роллю.
 */
export async function realLogin(params: RealLoginParams): Promise<Session> {
  const res = await api<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: params.email, password: params.password }),
  });
  await saveLoginToken(res.access_token);

  // Завантажуємо профіль — там роль і assigned_route_id з БД.
  //
  // skipAuthExpiry: цей запит — частина входу. Його 401 означає «вхід не
  // вдався» (нижче кидаємо зрозумілу помилку), а не «прибрати наявну сесію»:
  // глобальний обробник зніс би кеш разом із мутацією логіну, і кнопка входу
  // зависла б у стані «виконується».
  let profile: ProfileResponse | null = null;
  try {
    profile = await api<ProfileResponse>('/api/v1/profile/me', { skipAuthExpiry: true });
  } catch {
    // нижче перетворимо на зрозумілу помилку
  }

  if (!profile?.role) {
    await clearTokens();
    throw new Error(
      'Не вдалося отримати профіль користувача — вхід неможливий. ' +
        'Перевірте звʼязок і спробуйте ще раз.',
    );
  }

  const role = profile.role as AppRole;
  if (!isRoleAllowed(role, params.app)) {
    await clearTokens();
    throw new AccessDeniedError(role, params.app);
  }

  const parts = [profile.last_name, profile.first_name].filter(Boolean);
  const displayName = parts.length > 0 ? parts.join(' ') : (profile.email ?? res.email);

  return {
    user_id: res.user_id,
    display_name: displayName,
    role,
    serial_number: res.user_id.slice(0, 8).toUpperCase(),
    assigned_route_id: profile.assigned_route_id ?? params.routeId ?? null,
    assigned_vehicle_number: null,
  };
}

const SERIAL_BY_ROLE: Record<AppRole, string> = {
  user: 'USR-001',
  inspector: 'INS-001',
  driver: 'DRV-001',
  moderator: 'MOD-001',
  admin: 'ADM-001',
  superadmin: 'SUP-001',
};

export async function mockLogin(params: MockLoginParams): Promise<Session> {
  await delay();

  if (params.role === 'driver') {
    const assigned = params.routeId ?? MOCK_ROUTES[0]?.id ?? null;
    return {
      user_id: 'mock-user-driver',
      display_name: 'Олексій (водій)',
      role: 'driver',
      serial_number: SERIAL_BY_ROLE.driver,
      assigned_route_id: assigned,
      assigned_vehicle_number: null,
    };
  }

  return {
    user_id: 'mock-user-inspector',
    display_name: 'Марія (контролер)',
    role: 'inspector',
    serial_number: SERIAL_BY_ROLE.inspector,
    assigned_route_id: null,
    assigned_vehicle_number: null,
  };
}
