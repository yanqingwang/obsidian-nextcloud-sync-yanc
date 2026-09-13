import { friendlyNetworkError } from '../../../src/network/errorMessages';

// HarmonyOS 出境易/卓易通 containers surface raw Java exception strings; each class must map to
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

  it('translates socket resets with the HarmonyOS hint', () => {
    const text = friendlyNetworkError(new Error('SocketException: Connection reset by peer'));
    expect(text).toContain('socket error');
    expect(text).toContain('HarmonyOS');
  });

  it('translates DNS and timeout failures', () => {
    expect(friendlyNetworkError(new Error('UnknownHostException: cloud.example.com'))).toContain('could not be resolved');
    expect(friendlyNetworkError(new Error('request timed out after 30s'))).toContain('did not respond');
  });

  it('passes unknown messages through unchanged', () => {
    expect(friendlyNetworkError(new Error('something unusual'))).toBe('something unusual');
    expect(friendlyNetworkError('plain string')).toBe('plain string');
  });
});
