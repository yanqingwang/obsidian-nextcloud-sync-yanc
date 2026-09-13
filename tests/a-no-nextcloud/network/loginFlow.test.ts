// The a-layer runs under jest's `node` env, which has no `window`; LoginFlowV2's timeout race uses
// window timers (as it must inside Obsidian). Alias the node globals so the code is exercisable here.
(globalThis as unknown as { window: unknown }).window = globalThis;

import { requestUrl } from 'obsidian';
import { LoginFlowV2, friendlyLoginError } from '../../../src/auth/LoginFlowV2';
import { LoginFlowError } from '../../../src/types';

const mockRequestUrl = requestUrl as unknown as jest.Mock;

function res(status: number, json: unknown = {}) {
  return Promise.resolve({ status, text: '', json, arrayBuffer: new ArrayBuffer(0), headers: {} });
}

const noSleep = (): Promise<void> => Promise.resolve();
/** Resume signal that never fires — the desktop case, where the timer alone drives the loop. */
const noResume = () => () => undefined;

/**
 * A fake clock that advances by `stepMs` on every read, so a loop using `noSleep` still reaches the
 * wall-clock deadline in bounded time instead of spinning against the real `Date.now`.
 */
function fakeClock(stepMs: number) {
  let t = 0;
  return () => { const v = t; t += stepMs; return v; };
}

describe('LoginFlowV2', () => {
  beforeEach(() => mockRequestUrl.mockReset());

  it('start() parses init response', async () => {
    mockRequestUrl.mockReturnValueOnce(res(200, {
      poll: { token: 'tok', endpoint: 'https://nc/login/v2/poll' },
      login: 'https://nc/login/flow',
    }));
    const init = await LoginFlowV2.start('https://nc');
    expect(init).toEqual({ pollToken: 'tok', pollEndpoint: 'https://nc/login/v2/poll', loginUrl: 'https://nc/login/flow' });
  });

  it('start() throws unsupported on 404', async () => {
    mockRequestUrl.mockReturnValueOnce(res(404));
    await expect(LoginFlowV2.start('https://nc')).rejects.toMatchObject({ reason: 'unsupported' } as Partial<LoginFlowError>);
  });

  it('pollOnce() returns pending on 404', async () => {
    mockRequestUrl.mockReturnValueOnce(res(404));
    const r = await LoginFlowV2.pollOnce({ pollToken: 't', pollEndpoint: 'e', loginUrl: 'l' });
    expect(r.status).toBe('pending');
  });

  it('pollOnce() returns success with credentials on 200', async () => {
    mockRequestUrl.mockReturnValueOnce(res(200, { server: 'https://nc', loginName: 'alice', appPassword: 'secret' }));
    const r = await LoginFlowV2.pollOnce({ pollToken: 't', pollEndpoint: 'e', loginUrl: 'l' });
    expect(r).toEqual({ status: 'success', server: 'https://nc', loginName: 'alice', appPassword: 'secret' });
  });

  it('poll() resolves success after a pending then success', async () => {
    mockRequestUrl
      .mockReturnValueOnce(res(404))
      .mockReturnValueOnce(res(200, { server: 'https://nc', loginName: 'bob', appPassword: 'pw' }));
    const r = await LoginFlowV2.poll({ pollToken: 't', pollEndpoint: 'e', loginUrl: 'l' }, noSleep, {
      now: fakeClock(1000), onResume: noResume,
    });
    expect(r.status).toBe('success');
  });

  it('poll() times out when never approved', async () => {
    mockRequestUrl.mockReturnValue(res(404));
    // 1-minute steps: the 20-minute budget is reached after a bounded number of iterations.
    const r = await LoginFlowV2.poll({ pollToken: 't', pollEndpoint: 'e', loginUrl: 'l' }, noSleep, {
      now: fakeClock(60_000), onResume: noResume,
    });
    expect(r.status).toBe('timeout');
  });

  // Issue #34: on mobile the webview's timers are suspended while the browser holds the foreground,
  // so the interval never fires and the loop parks on one await. Returning to the app must wake it.
  describe('[LF-1] polling survives a suspended timer and resumes when the app does', () => {
    it('polls again on resume even though the interval timer never fires', async () => {
      const neverSleep = (): Promise<void> => new Promise<void>(() => undefined); // suspended timer
      let resume: (() => void) | null = null;
      const onResume = (cb: () => void) => { resume = cb; return () => { resume = null; }; };

      mockRequestUrl
        .mockReturnValueOnce(res(404)) // first poll: not approved yet, then the browser takes over
        .mockReturnValueOnce(res(200, { server: 'https://nc', loginName: 'carol', appPassword: 'pw' }));

      const pending = LoginFlowV2.poll(
        { pollToken: 't', pollEndpoint: 'e', loginUrl: 'l' },
        neverSleep,
        { now: fakeClock(1000), onResume },
      );

      // Let the first poll settle: a macrotask boundary guarantees every pending microtask has run,
      // so the loop is parked in its wait and `wake` is registered before the resume signal fires.
      await new Promise((r) => setTimeout(r, 0));
      expect(resume).not.toBeNull();
      (resume as unknown as () => void)();

      await expect(pending).resolves.toEqual({
        status: 'success', server: 'https://nc', loginName: 'carol', appPassword: 'pw',
      });
      expect(mockRequestUrl).toHaveBeenCalledTimes(2);
    });

    it('unsubscribes from the resume signal once the flow finishes', async () => {
      const unsubscribe = jest.fn();
      mockRequestUrl.mockReturnValueOnce(res(200, { server: 'https://nc', loginName: 'd', appPassword: 'p' }));
      await LoginFlowV2.poll({ pollToken: 't', pollEndpoint: 'e', loginUrl: 'l' }, noSleep, {
        now: fakeClock(1000), onResume: () => unsubscribe,
      });
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('[LF-2] the deadline matches the server-side token lifetime (20 minutes)', () => {
      // Nextcloud's LoginFlowV2Mapper::lifetime is 1200 s; giving up earlier would strand a token
      // the server would still honour, which is what the old 90-iteration cap effectively did.
      expect(LoginFlowV2.POLL_DEADLINE_MS).toBe(20 * 60 * 1000);
    });
  });

  // HarmonyOS 出境易/卓易通 compatibility: the Android container's network stack reaps sockets in
  // bursts (SocketException), and the burst lands exactly when the app resumes from the approval
  // browser with a stale socket pool. A single transport failure must never abort the login.
  describe('[LF-3] transient transport failures are retried, not fatal', () => {
    const socketError = new Error('SocketException: Connection reset');

    it('start() retries a transport failure and succeeds on a later attempt', async () => {
      mockRequestUrl
        .mockRejectedValueOnce(socketError)
        .mockReturnValueOnce(res(200, {
          poll: { token: 'tok', endpoint: 'https://nc/login/v2/poll' },
          login: 'https://nc/login/flow',
        }));
      const init = await LoginFlowV2.start('https://nc', noSleep);
      expect(init.pollToken).toBe('tok');
      expect(mockRequestUrl).toHaveBeenCalledTimes(2);
    });

    it('start() gives up with the transport error after all attempts fail', async () => {
      mockRequestUrl.mockRejectedValue(socketError);
      await expect(LoginFlowV2.start('https://nc', noSleep)).rejects.toBe(socketError);
      expect(mockRequestUrl).toHaveBeenCalledTimes(LoginFlowV2.START_ATTEMPTS);
    });

    it('start() does not retry a definitive HTTP outcome (404 → unsupported)', async () => {
      mockRequestUrl.mockReturnValue(res(404));
      await expect(LoginFlowV2.start('https://nc', noSleep)).rejects.toMatchObject(
        { reason: 'unsupported' } as Partial<LoginFlowError>,
      );
      expect(mockRequestUrl).toHaveBeenCalledTimes(1);
    });

    it('poll() survives a transient poll failure right after resume and still collects approval', async () => {
      mockRequestUrl
        .mockRejectedValueOnce(socketError) // the resume-time socket burst
        .mockReturnValueOnce(res(200, { server: 'https://nc', loginName: 'erin', appPassword: 'pw' }));
      const r = await LoginFlowV2.poll({ pollToken: 't', pollEndpoint: 'e', loginUrl: 'l' }, noSleep, {
        now: fakeClock(1000), onResume: noResume,
      });
      expect(r).toEqual({ status: 'success', server: 'https://nc', loginName: 'erin', appPassword: 'pw' });
    });

    it('poll() reports an error result only after sustained consecutive transport failures', async () => {
      mockRequestUrl.mockRejectedValue(socketError);
      const r = await LoginFlowV2.poll({ pollToken: 't', pollEndpoint: 'e', loginUrl: 'l' }, noSleep, {
        now: fakeClock(60_000), onResume: noResume,
      });
      expect(r).toEqual({ status: 'error', reason: socketError.message });
      expect(mockRequestUrl).toHaveBeenCalledTimes(LoginFlowV2.MAX_CONSECUTIVE_POLL_FAILURES + 1);
    });

    it('poll() resets the failure streak after a healthy response', async () => {
      // Fail just under the cap, recover once, then keep polling pending — the loop must not
      // carry the old streak forward and abandon a flow that is merely flaky again.
      mockRequestUrl
        .mockRejectedValueOnce(socketError)
        .mockRejectedValueOnce(socketError)
        .mockReturnValueOnce(res(404))
        .mockRejectedValueOnce(socketError)
        .mockRejectedValueOnce(socketError)
        .mockReturnValueOnce(res(200, { server: 'https://nc', loginName: 'fred', appPassword: 'pw' }));
      const r = await LoginFlowV2.poll({ pollToken: 't', pollEndpoint: 'e', loginUrl: 'l' }, noSleep, {
        now: fakeClock(1000), onResume: noResume,
      });
      expect(r).toEqual({ status: 'success', server: 'https://nc', loginName: 'fred', appPassword: 'pw' });
    });

    it('friendlyLoginError() translates native socket strings into actionable guidance', () => {
      const text = friendlyLoginError(new Error('SocketException: Connection reset by peer'));
      expect(text).toContain('socket error');
      expect(text).toContain('HarmonyOS');
      expect(friendlyLoginError(new Error('something unusual'))).toBe('something unusual');
    });
  });
});
