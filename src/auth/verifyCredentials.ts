import { requestUrl } from 'obsidian';
import { NetworkError } from '../types';

/** What the post-login credential check learned about the signed-in account. */
export interface VerifiedUser {
  /**
   * The account's uid — the value WebDAV paths must use. The Login Flow v2 `loginName` may be an
   * email address (Nextcloud's own docs: "Login name vs. email login"), and building
   * `/remote.php/dav/files/<loginname>/` from an email produces paths the server never matches.
   */
  uid: string;
  /** Display name, for user-facing notices. Falls back to the uid when absent. */
  displayname: string;
}

/**
 * The server definitively refused the freshly issued app password (HTTP 401/403).
 *
 * Definitive, unlike a transport failure: the server answered, and re-asking without user action
 * cannot change the verdict. Callers must NOT store credentials that hit this.
 */
export class AppPasswordRejectedError extends Error {
  constructor(public readonly status: number) {
    super(`Server rejected the app password (HTTP ${status})`);
    this.name = 'AppPasswordRejectedError';
  }
}

/** UTF-8-safe Basic auth header (same encoding as NextcloudClient.authHeader). */
function basicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `Basic ${btoa(binary)}`;
}

/**
 * Verifies the app password issued by Login Flow v2 actually authenticates, and resolves the
 * account's uid for WebDAV paths.
 *
 * Nextcloud's Login Flow docs ("Login name vs. email login") require the credential to be checked
 * against the server before use, and point at `GET /ocs/v1.php/cloud/user` for the actual username.
 * Doing this at the moment of sign-in turns "stored a credential that only fails at first sync"
 * into an immediate, actionable verdict.
 *
 * @param serverBaseUrl Server base URL (no `/remote.php/...`), as passed to LoginFlowV2.start
 * @param username The login name from the flow result (uid or email)
 * @param appPassword The freshly issued app password
 * @throws {AppPasswordRejectedError} On HTTP 401/403 — do not store the credential
 * @throws {NetworkError} On any other non-2xx status
 * @throws Transport errors (no HTTP response) propagate unchanged so callers can classify them
 */
export async function verifyAppPassword(
  serverBaseUrl: string,
  username: string,
  appPassword: string,
  timeoutMs = 30_000,
): Promise<VerifiedUser> {
  const base = serverBaseUrl.replace(/\/$/, '');
  const res = await withTimeout(requestUrl({
    url: `${base}/ocs/v1.php/cloud/user?format=json`,
    method: 'GET',
    headers: {
      Authorization: basicAuth(username, appPassword),
      'OCS-APIRequest': 'true',
    },
    throw: false,
  }), timeoutMs);

  if (res.status === 401 || res.status === 403) throw new AppPasswordRejectedError(res.status);
  if (res.status < 200 || res.status >= 300) {
    throw new NetworkError(res.status, res.text, 'GET /ocs/v1.php/cloud/user');
  }

  const data = (res.json as { ocs?: { data?: Record<string, unknown> } } | null)?.ocs?.data;
  const uid = data?.id;
  if (typeof uid !== 'string' || !uid) {
    throw new Error('invalid user response from /ocs/v1.php/cloud/user');
  }
  const displayname = typeof data?.displayname === 'string' && data.displayname ? data.displayname : uid;
  return { uid, displayname };
}

/**
 * Races a request against a hard timeout. Window timers (same idiom as network/requestWithTimeout.ts)
 * — the a-layer test file aliases the node globals to `window` since jest's node env lacks one.
 */
function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Login verification timed out after ${Math.round(timeoutMs / 1000)}s`));
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
