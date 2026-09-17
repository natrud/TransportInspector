import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mockLogin, type MockLoginParams, realLogin, type RealLoginParams } from '../data/auth-roles';
import { clearSession, loadSession, persistSession } from '../lib/session-storage';
import { useEffect } from 'react';
import { clearTokens } from '../lib/auth';
import { onUnauthorized, resetSessionExpired, runPreLogoutTasks } from '../lib/auth-events';
import { SETTINGS_KEY } from './useSettings';
import type { Session } from '../types/ticket';

const SESSION_KEY = ['session'] as const;

/**
 * Поточна сесія користувача (інспектор/водій). У реальному застосунку
 * приходить з бекенда після OIDC; зараз береться зі SecureStore.
 */
export function useSession(): {
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: SESSION_KEY,
    queryFn: loadSession,
    staleTime: 60_000,
  });
  return {
    session: data ?? null,
    isLoading,
    isAuthenticated: data != null,
  };
}

/**
 * Стежить за 401 від будь-якого запиту і, якщо токен мертвий, прибирає сесію —
 * застосунок сам повертається на екран входу.
 *
 * Без цього виходила найгірша з можливих поведінок: людина «залогінена»,
 * екрани відкриваються, але всі списки порожні і жодна дія не дає ефекту,
 * бо кожен запит мовчки повертає 401.
 *
 * Викликати один раз — у кореневому навігаторі застосунку.
 */
export function useSessionExpiryWatcher(): void {
  const qc = useQueryClient();
  useEffect(
    () =>
      onUnauthorized(() => {
        // Нема чого завершувати — на екрані входу 401 від фонового запиту не
        // повинен нічого робити.
        if (qc.getQueryData(SESSION_KEY) == null) return;

        void (async () => {
          await clearSession();
          await clearTokens();
          // removeQueries, а НЕ clear(): clear() зносить ще й кеш мутацій, а
          // разом з ним — мутацію, яка саме виконується. Саме через це вхід
          // міг зависнути назавжди у стані «виконується».
          qc.removeQueries();
          qc.setQueryData(SESSION_KEY, null);
        })();
      }),
    [qc],
  );
}

export function useLogin(): {
  login: (params: MockLoginParams) => Promise<Session>;
  isPending: boolean;
  error: Error | null;
} {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (params: MockLoginParams) => {
      const session = await mockLogin(params);
      await persistSession(session);
      return session;
    },
    onSuccess: (session) => {
      qc.setQueryData(SESSION_KEY, session);
    },
  });
  return {
    login: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}

export function useLogout(): {
  logout: () => Promise<void>;
  isPending: boolean;
} {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      // Спершу серверні задачі (зняти push-токен) — їм ще потрібен живий JWT.
      await runPreLogoutTasks();
      await clearSession();
      await clearTokens();
    },
    onSuccess: () => {
      qc.setQueryData(SESSION_KEY, null);
      qc.removeQueries({ queryKey: ['route-activity'] });
      // Налаштування належать акаунту — на спільному пристрої наступний
      // користувач не повинен успадкувати чужі.
      qc.removeQueries({ queryKey: SETTINGS_KEY });
    },
  });
  return {
    logout: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

/** Оновлює assigned_route_id — зберігає в БД і локально. */
export function useSelectRoute(): {
  selectRoute: (routeId: string) => Promise<void>;
} {
  const qc = useQueryClient();
  return {
    selectRoute: async (routeId: string) => {
      const current = await loadSession();
      if (!current) return;

      // Зберігаємо в БД
      try {
        const { api } = await import('../lib/api');
        await api('/api/v1/profile/', {
          method: 'PUT',
          body: JSON.stringify({ assigned_route_id: routeId }),
        });
      } catch {
        // non-critical — локально все одно оновимо
      }

      // Оновлюємо локальну сесію. Транспортний номер скидаємо — він
      // прив'язаний до попереднього маршруту і для нового невалідний,
      // другий крок (вибір ТЗ) водій проходить заново.
      const updated: Session = { ...current, assigned_route_id: routeId, assigned_vehicle_number: null };
      await persistSession(updated);
      qc.setQueryData(SESSION_KEY, updated);
      qc.invalidateQueries({ queryKey: ['routes', routeId] });
    },
  };
}

/**
 * Другий крок вибору — транспортний номер (ТЗ) у межах вже обраного
 * маршруту. Тільки локально (SecureStore) — на відміну від маршруту, не
 * зберігається в БД, бо це лише уточнення для фільтрації активності на
 * пристрої водія.
 */
export function useSelectVehicle(): {
  selectVehicle: (vehicleNumber: string) => Promise<void>;
} {
  const qc = useQueryClient();
  return {
    selectVehicle: async (vehicleNumber: string) => {
      const current = await loadSession();
      if (!current) return;

      const updated: Session = { ...current, assigned_vehicle_number: vehicleNumber };
      await persistSession(updated);
      qc.setQueryData(SESSION_KEY, updated);
    },
  };
}

/** Реальна авторизація через email + пароль → JWT бекенду. */
export function useRealLogin(): {
  login: (params: RealLoginParams) => Promise<Session>;
  isPending: boolean;
  error: Error | null;
} {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (params: RealLoginParams) => {
      const session = await realLogin(params);
      await persistSession(session);
      return session;
    },
    onSuccess: (session) => {
      resetSessionExpired();
      qc.setQueryData(SESSION_KEY, session);
      // Налаштування читаються за токеном, а до логіну запит або падав з 401,
      // або повертав локальний fallback. Без цього збережені в акаунті
      // значення підтяглись би лише за хвилину (staleTime).
      void qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
  return {
    login: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
