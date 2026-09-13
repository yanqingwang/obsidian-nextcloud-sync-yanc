/**
 * Converts raw network failures into short, actionable messages. Mobile `requestUrl` errors arrive
 * as native exception strings ("SocketException: Connection reset", "SSLHandshakeException:
 * Connection closed by peer", …) that are meaningless to users — and in the HarmonyOS
 * 出境易/卓易通 Android container they are the *normal* symptom of the container reaping sockets or
 * its network stack cutting TLS handshakes, not a misconfiguration. Returns the raw message when
 * nothing matches.
 */
export function friendlyNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/SSL|TLS|handshake|certificate/i.test(msg)) {
    return 'the TLS handshake was cut off (SSL error). This is the network path interfering with the secure connection — container network stacks (e.g. HarmonyOS 出境易), proxies or firewalls often do this — not your credentials. Try another network (e.g. a phone hotspot); if it works there, the original network is the problem.';
  }
  if (/socket|ECONNRESET|ECONNABORTED|EPIPE|connection reset|broken pipe|网络/i.test(msg)) {
    return 'connection to the server was dropped (socket error). Check the network, then retry — ' +
      'on HarmonyOS devices (出境易/卓易通) this is often transient; if it persists, sign in with a manual app password.';
  }
  if (/UnknownHost|ENOTFOUND|resolve|EAI_AGAIN/i.test(msg)) {
    return 'server address could not be resolved. Check the server URL and DNS/network access.';
  }
  if (/timed out/i.test(msg)) {
    return 'the server did not respond in time. Check the network or server status, then retry.';
  }
  return msg;
}

/**
 * Back-compat alias used by the login flow UI; identical to {@link friendlyNetworkError}.
 */
export const friendlyLoginError = friendlyNetworkError;
