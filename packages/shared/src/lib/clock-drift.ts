/**
 * Clock drift tracking. Після кожного fetch — читає header `X-Server-Epoch-Ms`
 * і обчислює skew між пристроєм і бекендом. |skew| > 5 хв → банер у UI
 * (`NetworkStatusBanner`).
 */

let lastSkewMs: number | null = null;
let lastRttMs: number | null = null;
let lastCheckAt = 0;

const DRIFT_THRESHOLD_MS = 5 * 60 * 1000; // 5 хв

export function recordServerTime(response: Response, requestStartMs: number): void {
  const serverEpochStr = response.headers.get('x-server-epoch-ms');
  if (!serverEpochStr) return;
  const serverMs = Number.parseInt(serverEpochStr, 10);
  if (!Number.isFinite(serverMs)) return;

  const now = Date.now();
  const rtt = now - requestStartMs;
  const midpoint = requestStartMs + rtt / 2;
  const skew = serverMs - midpoint;

  lastSkewMs = skew;
  lastRttMs = rtt;
  lastCheckAt = now;
}

export function getClockState(): {
  skewMs: number | null;
  rttMs: number | null;
  checkedAt: number;
  isDrifting: boolean;
} {
  return {
    skewMs: lastSkewMs,
    rttMs: lastRttMs,
    checkedAt: lastCheckAt,
    isDrifting: lastSkewMs != null && Math.abs(lastSkewMs) > DRIFT_THRESHOLD_MS,
  };
}

export function isDrifting(): boolean {
  return lastSkewMs != null && Math.abs(lastSkewMs) > DRIFT_THRESHOLD_MS;
}
