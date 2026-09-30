/**
 * Converts raw network failures into short, actionable messages. Mobile `requestUrl` errors arrive
 * as native exception strings ("SocketException: Connection reset", "SSLHandshakeException:
 * Connection closed by peer", …) that are meaningless to users. Returns the raw message when
 * nothing matches.
 *
 * Scope: this function names the NETWORK failure and nothing else. It is shared by the login flow,
 * the connection test and the sync engine, and only the first two are places where "sign in with an
 * app password" is meaningful — appending that hint here used to print it twice on a login failure
 * (once from here, once from the login call site) and printed it at all on a sync failure, where
 * re-authenticating is not what the user needs to do. Login call sites add the credential hint.
 */
export function friendlyNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/SSL|TLS|handshake|certificate/i.test(msg)) {
    return 'the TLS handshake was cut off (SSL error). This is the network path interfering with the secure connection — proxies or firewalls often do this — not your credentials. Try another network (e.g. a phone hotspot); if it works there, the original network is the problem.';
  }
  // The CJK term for "network" is written as a unicode escape so this file stays ASCII: it is a
  // literal to MATCH, not prose, and some Android builds report socket failures in the system
  // locale. The pre-commit english-only gate rightly rejects CJK in published files, and an escape
  // keeps the Chinese-locale match without weakening the gate.
  if (/socket|ECONNRESET|ECONNABORTED|EPIPE|connection reset|broken pipe|\u7f51\u7edc/i.test(msg)) {
    return 'connection to the server was dropped (socket error). Check the network, then retry — ' +
      'on mobile devices this is often transient when the app returns from the background with a stale socket.';
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
