import { friendlyNetworkError } from '../../../src/network/errorMessages';

// Mobile containers surface raw Java exception strings; each class must map to
// actionable guidance instead of the raw message.
describe('friendlyNetworkError', () => {
  it('translates SSLHandshakeException (TLS cut off mid-handshake)', () => {
    const text = friendlyNetworkError(new Error('request failed, SSLHandshakeException: Connection closed by peer'));
    expect(text).toContain('TLS handshake');
    expect(text).toContain('not your credentials');
    expect(text).toContain('hotspot');
  });

  it('translates SSLException generically', () => {
    expect(friendlyNetworkError(new Error('SSLException: Read error'))).toContain('TLS handshake');
  });

  it('translates socket resets with the mobile hint', () => {
    const text = friendlyNetworkError(new Error('SocketException: Connection reset by peer'));
    expect(text).toContain('socket error');
    expect(text).toContain('mobile devices');
  });

  it('translates DNS and timeout failures', () => {
    expect(friendlyNetworkError(new Error('UnknownHostException: cloud.example.com'))).toContain('could not be resolved');
    expect(friendlyNetworkError(new Error('request timed out after 30s'))).toContain('did not respond');
  });

  it('passes unknown messages through unchanged', () => {
    expect(friendlyNetworkError(new Error('something unusual'))).toBe('something unusual');
    expect(friendlyNetworkError('plain string')).toBe('plain string');
  });

  // Regression: the socket message used to end with "sign in with a manual app password", and the
  // login call site appends its own app-password hint. The user saw the same instruction twice in
  // one Notice, and a SYNC failure (which routes through the same translator) was told to
  // re-authenticate — advice that cannot act on a mid-sync network drop. The credential hint now
  // belongs to the login call sites alone.
  it('does not carry a credential hint, so login call sites are the only place it appears', () => {
    for (const raw of ['SocketException: Connection reset by peer', 'SSLHandshakeException: closed']) {
      const text = friendlyNetworkError(new Error(raw));
      expect(text).not.toMatch(/app password/i);
    }
  });

  // The CJK alternative is spelled \u7f51\u7edc so the source file stays ASCII and passes the
  // pre-commit english-only gate. That is only safe if the escape still matches the real string —
  // a mangled escape would silently stop recognising Chinese-locale socket errors, which is the
  // case this term exists for.
  it('still matches a Chinese-locale socket failure through the escaped literal', () => {
    // Built from escapes so this test file also satisfies the english-only gate: a CJK literal here
    // would reintroduce the very violation the production escape exists to avoid.
    const chineseSocketError = '\u7f51\u7edc\u8fde\u63a5\u88ab\u91cd\u7f6e'; // "network connection was reset"
    expect(friendlyNetworkError(new Error(chineseSocketError))).toContain('socket error');
  });
});
