import { requestUrl } from 'obsidian';
import { friendlyNetworkError } from '../network/errorMessages';
import { LoginFlowInit, LoginFlowResult, LoginFlowError } from '../types';

/**
 * Nextcloud Login Flow v2 client.
 *
 * Official flow that issues an app password using browser approval alone.
 * 1. start(): POST /index.php/login/v2 → {@link LoginFlowInit}
 * 2. The user opens loginUrl in a browser and approves
 * 3. poll(): polls until approval completes and returns {@link LoginFlowResult}
 *
 * Everything goes through Obsidian's requestUrl (no fetch). No `any`; JSON is validated with type guards.
 *
 * Both endpoints tolerate transient socket failures: on mobile — and in particular inside the
 * HarmonyOS "出境易"/卓易通 Android container, where the container's network stack aggressively
 * reaps sockets and DNS/NAT hiccups surface as Java `SocketException` — any single dropped
 * connection used to abort the whole login. Start retries with backoff; poll treats a failed
 * request as "pending" until failures persist well beyond a resume from the browser.
 */
/**
 * Default "the app came back to the foreground" signal (issue #34). Mobile suspends the webview's
 * timers while the browser holds the foreground, so the poll loop needs a second way to be woken.
 * Guarded because the a-layer tests run under jest's `node` environment, where neither global exists.
 */
function defaultOnResume(cb: () => void): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => undefined;
  const onVisibility = (): void => { if (document.visibilityState === 'visible') cb(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', cb);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', cb);
  };
}

/** Injection seams for {@link LoginFlowV2.poll}; all default to the real clock / DOM. */
export interface PollDeps {
  /** Current wall-clock time in ms. */
  now?: () => number;
  /** Subscribe to app-resume; returns an unsubscribe function. */
  onResume?: (cb: () => void) => () => void;
}

export class LoginFlowV2 {
  /** Polling interval (milliseconds). */
  static readonly POLL_INTERVAL_MS = 2000;
  /**
   * Wall-clock budget for the whole flow.
   *
   * Matched to Nextcloud's own token lifetime — `LoginFlowV2Mapper::lifetime` is 1200 seconds — so the
   * client stops looking at the same moment the server stops honouring the token, and never earlier.
   * This replaces a fixed 90-iteration cap: because the loop only advanced when its timer fired, that
   * cap measured "time spent polling in the foreground" rather than elapsed time, which is not a
   * budget anyone can reason about once the OS starts suspending timers mid-flow.
   */
  static readonly POLL_DEADLINE_MS = 20 * 60 * 1000;
  /**
   * Per-request hard timeout. `requestUrl` has none, and in the HarmonyOS 出境易/卓易通 container a
   * wedged socket can stay pending for minutes; without this the login hangs instead of failing.
   */
  static readonly REQUEST_TIMEOUT_MS = 30_000;
  /**
   * `start()` retries a request this many times when no HTTP response arrived at all (socket reset,
   * DNS hiccup, timeout) — the transient failure class the HarmonyOS container produces in bursts.
   */
  static readonly START_ATTEMPTS = 3;
  /**
   * Consecutive poll requests that may fail (no HTTP response) before the flow reports
   * {@link LoginFlowError}-free abandonment via an `error` result. Resume from the browser is exactly
   * when stale sockets fail in a burst, so this must tolerate well over a couple of drops.
   */
  static readonly MAX_CONSECUTIVE_POLL_FAILURES = 15;
  /** Upper bound on the failure backoff between polls (linear growth from POLL_INTERVAL_MS). */
  static readonly MAX_POLL_FAILURE_BACKOFF_MS = 15_000;

  /**
   * Starts the Login Flow.
   * @param serverBaseUrl Server base URL without `/remote.php/...`
   * @param sleep Wait function between retries, injectable for testing
   * @returns Start info (browser URL and polling endpoint)
   * @throws {LoginFlowError} If the start POST fails
   */
  static async start(
    serverBaseUrl: string,
    sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => window.setTimeout(r, ms)),
  ): Promise<LoginFlowInit> {
    const base = serverBaseUrl.replace(/\/$/, '');
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < this.START_ATTEMPTS; attempt++) {
      try {
        const res = await withTimeout(requestUrl({
          url: `${base}/index.php/login/v2`,
          method: 'POST',
          headers: { 'User-Agent': 'Obsidian Nextcloud Sync' },
          throw: false,
        }), this.REQUEST_TIMEOUT_MS);
        if (res.status === 404 || res.status === 405) {
          throw new LoginFlowError('unsupported');
        }
        if (res.status < 200 || res.status >= 300) {
          throw new LoginFlowError(`HTTP ${res.status}`);
        }
        const init = this.parseInit(res.json);
        if (!init) throw new LoginFlowError('invalid start response');
        return init;
      } catch (err) {
        // HTTP-level outcomes (unsupported / status codes / bad payload) are definitive — retry
        // only the transport class, where no HTTP response exists to act on.
        if (err instanceof LoginFlowError) throw err;
        lastErr = err;
        if (attempt < this.START_ATTEMPTS - 1) await sleep(1000 * (attempt + 1));
      }
    }
    throw lastErr;
  }

  /**
   * Checks for approval completion exactly once. Returns `pending` before approval, `success` once done.
   * Network failures throw — the poll loop decides whether they are transient.
   * @returns Polling result (discriminated union)
   */
  static async pollOnce(init: LoginFlowInit): Promise<LoginFlowResult> {
    const res = await withTimeout(requestUrl({
      url: init.pollEndpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(init.pollToken)}`,
      throw: false,
    }), this.REQUEST_TIMEOUT_MS);
    if (res.status === 404) return { status: 'pending' };
    if (res.status < 200 || res.status >= 300) return { status: 'pending' };
    const ok = this.parseSuccess(res.json);
    if (!ok) return { status: 'pending' };
    return { status: 'success', ...ok };
  }

  /**
   * Polls until approval completes or {@link POLL_DEADLINE_MS} of wall-clock time has passed.
   *
   * Between polls it waits on whichever comes first: the interval timer, or the app returning to the
   * foreground. Waiting on the timer alone is what broke sign-in on Android (issue #34) — opening the
   * browser to approve suspends Obsidian's webview, the pending `setTimeout` never fires, and the loop
   * stays parked on that one `await` even after the user comes back, so the app password sitting ready
   * on the server is never collected. Racing the resume signal both unsticks the loop and makes the
   * first poll after the user returns immediate, which is exactly the moment approval has just landed.
   *
   * A poll request that gets no HTTP response at all (socket reset, timeout — the burst the HarmonyOS
   * 出境易 container produces right when the app resumes with a stale socket pool) is treated as
   * "pending": the loop backs off, keeps polling, and only gives up after
   * {@link MAX_CONSECUTIVE_POLL_FAILURES} consecutive transport failures.
   *
   * @param sleep Wait function injectable for testing (defaults to a setTimeout-based one)
   * @param deps Clock and resume-signal seams, injectable for testing
   */
  static async poll(
    init: LoginFlowInit,
    sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => window.setTimeout(r, ms)),
    deps: PollDeps = {},
  ): Promise<LoginFlowResult> {
    const now = deps.now ?? (() => Date.now());
    const onResume = deps.onResume ?? defaultOnResume;
    const deadline = now() + this.POLL_DEADLINE_MS;

    let wake: (() => void) | null = null;
    const unsubscribe = onResume(() => wake?.());
    try {
      let consecutiveFailures = 0;
      while (now() < deadline) {
        let result: LoginFlowResult;
        try {
          result = await this.pollOnce(init);
          consecutiveFailures = 0;
        } catch (err) {
          consecutiveFailures++;
          if (consecutiveFailures > this.MAX_CONSECUTIVE_POLL_FAILURES) {
            return { status: 'error', reason: err instanceof Error ? err.message : String(err) };
          }
          result = { status: 'pending' };
        }
        if (result.status === 'success') return result;
        // Back off linearly while the connection keeps failing (capped), so a flapping socket pool
        // gets time to re-establish instead of being hammered every 2 s.
        const waitMs = consecutiveFailures > 0
          ? Math.min(this.POLL_INTERVAL_MS * consecutiveFailures, this.MAX_POLL_FAILURE_BACKOFF_MS)
          : this.POLL_INTERVAL_MS;
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = (): void => {
            if (settled) return;
            settled = true;
            wake = null;
            resolve();
          };
          wake = finish;
          // The timer may never fire (suspended webview); `finish` is idempotent, so whichever of the
          // two arrives first wins and the loser is a no-op when it eventually runs.
          void sleep(waitMs).then(finish);
        });
      }
      return { status: 'timeout' };
    } finally {
      unsubscribe();
    }
  }

  /** Validates the start response JSON with type guards and converts it to LoginFlowInit. */
  private static parseInit(json: unknown): LoginFlowInit | null {
    if (typeof json !== 'object' || json === null) return null;
    const obj = json as Record<string, unknown>;
    const login = obj.login;
    const poll = obj.poll;
    if (typeof login !== 'string') return null;
    if (typeof poll !== 'object' || poll === null) return null;
    const pollObj = poll as Record<string, unknown>;
    const token = pollObj.token;
    const endpoint = pollObj.endpoint;
    if (typeof token !== 'string' || typeof endpoint !== 'string') return null;
    return { pollToken: token, pollEndpoint: endpoint, loginUrl: login };
  }

  /** Validates the successful polling JSON with type guards. */
  private static parseSuccess(
    json: unknown,
  ): { server: string; loginName: string; appPassword: string } | null {
    if (typeof json !== 'object' || json === null) return null;
    const obj = json as Record<string, unknown>;
    const server = obj.server;
    const loginName = obj.loginName;
    const appPassword = obj.appPassword;
    if (typeof server !== 'string' || typeof loginName !== 'string' || typeof appPassword !== 'string') {
      return null;
    }
    return { server, loginName, appPassword };
  }
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
      reject(new Error(`Login request timed out after ${Math.round(timeoutMs / 1000)}s`));
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
 * Converts a login-flow failure into a short, actionable message. Delegates to the shared network
 * translator (src/network/errorMessages.ts) so sync failures and login failures speak the same
 * language about the same native exception strings.
 */
export function friendlyLoginError(err: unknown): string {
  return friendlyNetworkError(err);
}
