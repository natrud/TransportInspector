import { getDb } from './db';

/**
 * ETag cache (M1.2.7).
 *
 * Stores ETag + response body per URL у SQLite. Used by `apiWithEtag` fetch
 * helper — sends `If-None-Match` header, handles 304 з cached body.
 *
 * Schema — created on demand (idempotent CREATE TABLE IF NOT EXISTS).
 */

let initialized = false;

async function ensureTable(): Promise<void> {
  if (initialized) return;
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS etag_cache (
      url TEXT PRIMARY KEY,
      etag TEXT NOT NULL,
      body TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    )
  `);
  initialized = true;
}

export async function getCachedEtag(url: string): Promise<{ etag: string; body: string } | null> {
  await ensureTable();
  const db = getDb();
  const res = await db.execute('SELECT etag, body FROM etag_cache WHERE url = ?', [url]);
  const rows = (res.rows ?? []) as { etag: string; body: string }[];
  return rows[0] ?? null;
}

export async function setCachedEtag(url: string, etag: string, body: string): Promise<void> {
  await ensureTable();
  const db = getDb();
  await db.execute(
    'INSERT INTO etag_cache (url, etag, body, cached_at) VALUES (?, ?, ?, ?) ON CONFLICT(url) DO UPDATE SET etag=excluded.etag, body=excluded.body, cached_at=excluded.cached_at',
    [url, etag, body, Date.now()],
  );
}

export async function clearEtagCache(): Promise<void> {
  await ensureTable();
  const db = getDb();
  await db.execute('DELETE FROM etag_cache');
}
