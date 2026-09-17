/**
 * Сигнал «сервер більше не приймає наш токен».
 *
 * Сесія (ім'я, роль, маршрут) і сам JWT лежать у SecureStore ОКРЕМО. Через це
 * застосунок може вважати себе залогіненим, коли токен уже мертвий: екрани
 * малюються, а кожен запит повертає 401. Зовні це виглядає як «все пусте» —
 * ні викликів, ні перевірки, ні реакції на QR.
 *
 * Токен помирає не лише від закінчення строку (14 днів). Бекенд
 * (app/core/security.py::authenticate_access_token) відхиляє його ще й коли:
 *   • змінився session_version акаунта (зміна пароля, примусовий вихід);
 *   • РОЛЬ в JWT не збігається з роллю акаунта в БД — тобто щойно адмін
 *     змінює роль користувача, усі його старі токени стають недійсними.
 *
 * Тому 401 тут — не помилка окремого запиту, а подія рівня застосунку:
 * треба прибрати сесію і показати екран входу з поясненням.
 */

type UnauthorizedListener = () => void;

const listeners = new Set<UnauthorizedListener>();

/** Чи був вихід саме через протухлий токен — щоб пояснити це на екрані входу. */
let sessionExpired = false;

/** Підписатися на 401. Повертає функцію відписки. */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Викликається з api() на будь-який 401, окрім самого логіну. */
export function notifyUnauthorized(): void {
  sessionExpired = true;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Один поганий підписник не має ламати решту.
    }
  }
}

/**
 * Прочитати і скинути прапорець. Екран входу показує пояснення рівно один раз,
 * щоб воно не висіло після наступної невдалої спроби пароля.
 */
export function consumeSessionExpired(): boolean {
  const value = sessionExpired;
  sessionExpired = false;
  return value;
}

/** Скидання без читання — після успішного входу. */
export function resetSessionExpired(): void {
  sessionExpired = false;
}

/* ============================================================================
   Задачі, які треба виконати ПЕРЕД виходом, поки ще живий токен.
   ============================================================================ */

type PreLogoutTask = () => Promise<void>;

const preLogoutTasks = new Set<PreLogoutTask>();

/**
 * Зареєструвати дію, яку треба зробити на боці сервера перед логаутом.
 *
 * Потрібно через те, що lib/push-notifications навмисно не входить у барель
 * пакета (він тягне нативний expo-notifications, якого нема в збірці водія).
 * Тому застосунок, якому це треба, реєструє свою задачу сам:
 *
 *     registerPreLogoutTask(unregisterPushToken)
 *
 * Повертає функцію зняття реєстрації.
 */
export function registerPreLogoutTask(task: PreLogoutTask): () => void {
  preLogoutTasks.add(task);
  return () => {
    preLogoutTasks.delete(task);
  };
}

/** Виконує всі зареєстровані задачі. Помилка однієї не блокує вихід. */
export async function runPreLogoutTasks(): Promise<void> {
  await Promise.allSettled([...preLogoutTasks].map((task) => task()));
}
