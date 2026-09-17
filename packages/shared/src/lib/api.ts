import Constants from 'expo-constants';
import { notifyUnauthorized } from './auth-events';
import { loadTokens } from './auth';
import { recordServerTime } from './clock-drift';
import { getCachedEtag, setCachedEtag } from './etag-cache';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };
const apiBaseUrl = extra.apiBaseUrl ?? 'TODO_API_URL';

/** Скільки чекаємо на відповідь сервера, перш ніж здатись. */
const REQUEST_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Fetch wrapper з bearer token + clock-drift tracking (M1.2.10) + ETag caching (M1.2.7).
 *
 * GET requests:
 *   - Sends cached ETag у `If-None-Match` header
 *   - On 304 → returns cached body (JSON parsed з storage)
 *   - On 200 з новим ETag → cache update + повертає fresh body
 *
 * Non-GET: no ETag (mutations immediate).
 *
 * Every response — reads `X-Server-Epoch-Ms` для skew tracking (isDrifting()).
 */
export async function api<T = unknown>(
  path: string,
  init: RequestInit & {
    /**
     * Не піднімати глобальний сигнал «сесія протухла» на 401.
     *
     * Потрібно для запитів САМОГО логіну: там 401 означає «цей вхід не
     * вдався», а не «наявну сесію треба прибрати». Без цього 401 від
     * /profile/me посеред входу зносив кеш разом із мутацією логіну, і
     * кнопка входу лишалась у стані «виконується» назавжди.
     */
    skipAuthExpiry?: boolean;
  } = {},
): Promise<T> {
  const { skipAuthExpiry = false, ...requestInit } = init;
  init = requestInit;
  const tokens = await loadTokens();
  const headers = new Headers(init.headers);
  if (tokens?.accessToken) {
    headers.set('authorization', `Bearer ${tokens.accessToken}`);
  }
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const url = path.startsWith('http') ? path : `${apiBaseUrl}${path}`;
  const method = (init.method ?? 'GET').toUpperCase();
  const etagCache = method === 'GET' ? await getCachedEtag(url) : null;
  if (etagCache) {
    headers.set('if-none-match', etagCache.etag);
  }

  // Таймаут обов'язковий: у React Native fetch без нього може висіти хвилинами,
  // якщо бекенд недоступний або мовчить. Саме так «вхід» перетворювався на
  // кнопку, що крутиться нескінченно і нічого не пояснює.
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (error) {
    // У повідомлення кладемо адресу, до якої зверталися: якщо застосунок
    // зібрано без apiBaseUrl, він мовчки стукає в 'TODO_API_URL' і виглядає
    // це як «сервер не відповідає». Побачити хост — найшвидший спосіб
    // відрізнити зламану збірку від справжніх проблем зі звʼязком.
    if (controller.signal.aborted) {
      throw new ApiError(
        0,
        null,
        `Сервер не відповів за ${Math.round(REQUEST_TIMEOUT_MS / 1000)} с.\n${apiBaseUrl}`,
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new ApiError(0, null, `Немає звʼязку з сервером.\n${apiBaseUrl}\n${detail}`);
  } finally {
    clearTimeout(timeout);
  }
  recordServerTime(res, started);

  if (method === 'GET' && res.status === 304 && etagCache) {
    try {
      return JSON.parse(etagCache.body) as T;
    } catch {
      // corrupted cache → fall through до normal parsing
    }
  }

  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const rawText = await res.text();
  const body = isJson && rawText.length > 0 ? JSON.parse(rawText) : rawText;

  if (!res.ok) {
    // 401 на робочому запиті = токен мертвий (строк, зміна пароля або зміна
    // ролі акаунта — роль вшита в JWT). Сесію треба прибрати, інакше
    // застосунок виглядає залогіненим, а всі екрани мовчки порожні.
    // Виняток — сам логін: там 401 означає просто невірний пароль.
    if (res.status === 401 && !skipAuthExpiry && !path.includes('/auth/login')) {
      notifyUnauthorized();
    }
    throw new ApiError(res.status, body, `${res.status} ${res.statusText}`);
  }

  if (method === 'GET' && isJson) {
    const etag = res.headers.get('etag');
    if (etag) {
      await setCachedEtag(url, etag, rawText).catch(() => {});
    }
  }

  return body as T;
}
