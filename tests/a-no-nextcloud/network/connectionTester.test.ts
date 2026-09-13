// The a-layer runs under jest's `node` env, which has no `window`; ConnectionTester's timeout race
// uses window timers (as it must inside Obsidian). Alias the node globals so the code runs here.
(globalThis as unknown as { window: unknown }).window = globalThis;

import { requestUrl } from 'obsidian';
import { checkReachability } from '../../../src/network/ConnectionTester';

const mockRequestUrl = requestUrl as unknown as jest.Mock;

function res(status: number, json: unknown = null) {
  return Promise.resolve({ status, text: '', json, arrayBuffer: new ArrayBuffer(0), headers: {} });
}

beforeEach(() => mockRequestUrl.mockReset());

describe('checkReachability (stage 1 of the connection check)', () => {
  it('strips the WebDAV path and probes {base}/status.php without credentials', async () => {
    mockRequestUrl.mockReturnValueOnce(res(200, { productname: 'Nextcloud', version: '28.0.4' }));
    const r = await checkReachability('https://nc.example.com/remote.php/dav/files/alice/');
    expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://nc.example.com/status.php',
      method: 'GET',
    }));
    expect(r).toEqual({ ok: true, detail: 'server reachable (Nextcloud 28.0.4)' });
  });

  it('counts a plain 404 as reachable (non-Nextcloud WebDAV servers 404 the status probe)', async () => {
    mockRequestUrl.mockReturnValueOnce(res(404));
    const r = await checkReachability('https://dav.example.com');
    expect(r.ok).toBe(true);
    expect(r.detail).toContain('HTTP 404');
  });

  it('reports a 5xx as reachable-but-unhealthy', async () => {
    mockRequestUrl.mockReturnValueOnce(res(503));
    const r = await checkReachability('https://nc.example.com');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('HTTP 503');
  });

  it('translates a TLS transport failure instead of showing the raw exception', async () => {
    mockRequestUrl.mockRejectedValueOnce(new Error('SSLHandshakeException: Connection closed by peer'));
    const r = await checkReachability('https://nc.example.com');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('TLS handshake');
  });

  it('tolerates a non-JSON body (the status line alone proves reachability)', async () => {
    mockRequestUrl.mockReturnValueOnce(Promise.resolve({ status: 200, text: '<html/>', json: null, arrayBuffer: new ArrayBuffer(0), headers: {} }));
    const r = await checkReachability('https://nc.example.com');
    expect(r).toEqual({ ok: true, detail: 'server reachable (HTTP 200)' });
  });
});
