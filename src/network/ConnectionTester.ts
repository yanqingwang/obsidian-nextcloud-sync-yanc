import { requestUrl } from 'obsidian';
import { friendlyNetworkError } from './errorMessages';

/** Result of one diagnostic stage: whether it passed and a human-readable detail line. */
export interface StageResult {
  ok: boolean;
  detail: string;
}

/**
 * Hard per-request timeout for diagnostics. Window timers (same idiom as requestWithTimeout.ts);
 * the a-layer test file aliases the node globals to `window` since jest's node env lacks one.
 */
function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`request timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    p.then(
      (v) => { if (!settled) { settled = true; window.clearTimeout(timer); resolve(v); } },
      (e) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * Stage 1 — reachability: GET `{base}/status.php` with NO credentials. One HTTP response of any
 * kind proves the whole chain below the application: DNS, TCP, TLS and HTTP all worked. That is
 * exactly the evidence needed to separate "the network/container kills the connection"
 * (SSLHandshakeException, socket resets — no status code at all) from "the server is there but
 * the credentials are wrong" (later stages answer HTTP 401). Any 2xx-4xx counts as reachable;
 * 5xx is reachable but the server itself is unhealthy.
 *
 * Non-Nextcloud WebDAV servers usually 404 the status probe — that is still reachability.
 */
export async function checkReachability(serverUrl: string, timeoutMs = 20_000): Promise<StageResult> {
  const base = serverUrl.replace(/\/remote\.php.*$/, '').replace(/\/$/, '');
  let res;
  try {
    res = await withTimeout(requestUrl({ url: `${base}/status.php`, method: 'GET', throw: false }), timeoutMs);
  } catch (err) {
    // No HTTP response at all: DNS, TCP, TLS or the container's socket layer failed. This is the
    // stage where SSLHandshakeException / SocketException land.
    return { ok: false, detail: friendlyNetworkError(err) };
  }
  if (res.status >= 500) {
    return { ok: false, detail: `server is reachable but reported HTTP ${res.status} — it is unhealthy or in maintenance. Try again later.` };
  }
  let product = '';
  try {
    const json = res.json as Record<string, unknown> | null;
    if (json && typeof json.productname === 'string') product = json.productname;
    if (json && typeof json.version === 'string') product += ` ${json.version}`;
  } catch { /* body is optional — the status line alone proved reachability */ }
  product = product.trim();
  return { ok: true, detail: product ? `server reachable (${product})` : `server reachable (HTTP ${res.status})` };
}
