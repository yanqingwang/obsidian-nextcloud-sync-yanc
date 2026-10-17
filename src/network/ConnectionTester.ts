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

/** Build the HTTP Basic header the WebDAV clients send, so the preflight authenticates identically. */
export function basicAuthHeader(username: string, password: string): string {
  const credentials = `${username}:${password}`;
  const bytes = new TextEncoder().encode(credentials);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `Basic ${btoa(binary)}`;
}

/**
 * Depth:0 PROPFIND against one URL. Returns the status, or null when no HTTP response arrived at all
 * (DNS/TCP/TLS failure, timeout) — the same distinction `checkReachability` draws, kept here so the
 * preflight can tell "the server said no" from "the server never answered".
 */
async function propfindDepth0(
  url: string,
  authHeader: string,
  timeoutMs: number,
): Promise<number | null> {
  try {
    const res = await withTimeout(
      requestUrl({ url, method: 'PROPFIND', headers: { Authorization: authHeader, Depth: '0' }, throw: false }),
      timeoutMs,
    );
    return res.status;
  } catch {
    return null;
  }
}

/** The parent collection of a URL, or null when it has none (an origin root, or an unparsable URL). */
function parentUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '');
    const idx = path.lastIndexOf('/');
    if (idx <= 0) return null; // no parent segment (or the origin root)
    u.pathname = path.slice(0, idx);
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Stage 3 — WebDAV base preflight: PROPFIND Depth:0 on the configured Server URL ITSELF.
 *
 * Stages 1 and 2 cannot catch a wrong Server URL, because every URL they use is derived by
 * *stripping* `/remote.php/...` off it: `/status.php` and the capabilities call land on the host
 * whatever path the user typed, so a Server URL that is not a WebDAV collection at all still reads
 * as "connection OK". The sync then issues PROPFIND/PUT/REPORT against that non-collection and every
 * one of them 404s — the "Test connection says fine, sync says HTTP 404 (PROPFIND)" shape this stage
 * exists to eliminate (upstream issue #35 is the same misconfiguration reported as 405).
 *
 * A 404 is deliberately NOT a verdict on its own: the Server URL may legitimately name a folder that
 * does not exist yet, because the plugin MKCOLs the vault folder and its ancestors on the first
 * upload. Its PARENT separates the two cases — the parent of a real endpoint answers 207, whereas the
 * parent of a missing `/files/<user>/` segment does not.
 */
export async function checkWebdavBase(
  serverUrl: string,
  authHeader: string,
  timeoutMs = 20_000,
): Promise<StageResult> {
  const base = serverUrl.trim().replace(/\/+$/, '');
  const status = await propfindDepth0(base, authHeader, timeoutMs);

  if (status === null) return { ok: false, detail: 'no response from the configured WebDAV URL' };
  if (status === 207 || status === 200) return { ok: true, detail: `WebDAV endpoint accepted (HTTP ${status})` };
  if (status === 401 || status === 403) {
    return { ok: false, detail: `the server rejected the credentials (HTTP ${status})` };
  }
  if (status === 404) {
    const parent = parentUrl(base);
    const parentStatus = parent ? await propfindDepth0(parent, authHeader, timeoutMs) : null;
    if (parentStatus === 207 || parentStatus === 200) {
      return {
        ok: true,
        detail: 'the target folder does not exist yet (HTTP 404); the first sync will create it — its parent is a WebDAV collection',
      };
    }
    return {
      ok: false,
      detail: 'HTTP 404 — this URL is not a WebDAV collection. For Nextcloud it must be '
        + 'https://<host>/remote.php/dav/files/<user>/ — the /files/<user>/ segment is required.',
    };
  }
  if (status === 405) {
    return {
      ok: false,
      detail: 'HTTP 405 — the Server URL must be the full WebDAV endpoint '
        + '(https://<host>/remote.php/dav/files/<user>/), not just the host.',
    };
  }
  if (status >= 500) {
    return { ok: false, detail: `the server reported HTTP ${status} — it is unhealthy or in maintenance` };
  }
  return { ok: false, detail: `unexpected HTTP ${status} from the configured WebDAV URL` };
}
