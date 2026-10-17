// The a-layer runs under jest's `node` env, which has no `window`; ConnectionTester's timeout race
// uses window timers (as it must inside Obsidian). Alias the node globals so the code runs here.
(globalThis as unknown as { window: unknown }).window = globalThis;

import { requestUrl } from 'obsidian';
import { checkWebdavBase, basicAuthHeader } from '../../../src/network/ConnectionTester';

const mockRequestUrl = requestUrl as unknown as jest.Mock;

function res(status: number) {
  return Promise.resolve({ status, text: '', json: null, arrayBuffer: new ArrayBuffer(0), headers: {} });
}

/** The URL of the Nth requestUrl call (1-based), for asserting which path was probed. */
function calledUrl(n: number): string {
  return (mockRequestUrl.mock.calls[n - 1][0] as { url: string }).url;
}

beforeEach(() => mockRequestUrl.mockReset());

describe('checkWebdavBase (stage 3 of the connection check)', () => {
  it('accepts a Server URL that answers 207 to a Depth:0 PROPFIND, and sends the credentials', async () => {
    mockRequestUrl.mockReturnValueOnce(res(207));
    const r = await checkWebdavBase('https://nc.example.com/remote.php/dav/files/alice/', 'Basic abc');
    expect(r).toEqual({ ok: true, detail: 'WebDAV endpoint accepted (HTTP 207)' });
    expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
      // Trailing slashes are trimmed before probing, so the URL on the wire has none.
      url: 'https://nc.example.com/remote.php/dav/files/alice',
      method: 'PROPFIND',
      headers: { Authorization: 'Basic abc', Depth: '0' },
    }));
  });

  it('probes the Server URL itself, not a stripped /status.php path', async () => {
    // This is the whole point of the stage: the Server URL is the thing under test, so it must be
    // the URL on the wire. A stripped path would re-create the blind spot it exists to close.
    mockRequestUrl.mockReturnValueOnce(res(207));
    await checkWebdavBase('https://nc.example.com/remote.php/dav/files/alice/Notes', 'Basic abc');
    expect(calledUrl(1)).toBe('https://nc.example.com/remote.php/dav/files/alice/Notes');
  });

  it('fails with the /files/ hint when the URL 404s and its parent 404s too', async () => {
    // The reported misconfiguration: `.../remote.php/dav/<user>/<folder>` — the user id where the
    // namespace belongs, so neither the URL nor its parent is a collection.
    mockRequestUrl.mockReturnValueOnce(res(404)).mockReturnValueOnce(res(404));
    const r = await checkWebdavBase('https://nc.example.com/remote.php/dav/alice/wk_note', 'Basic abc');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('not a WebDAV collection');
    expect(r.detail).toContain('/remote.php/dav/files/<user>/');
    // The parent was asked, which is what separates a wrong URL from a not-yet-created folder.
    expect(calledUrl(2)).toBe('https://nc.example.com/remote.php/dav/alice');
  });

  it('accepts a not-yet-created target folder whose parent is a collection', async () => {
    mockRequestUrl.mockReturnValueOnce(res(404)).mockReturnValueOnce(res(207));
    const r = await checkWebdavBase('https://nc.example.com/remote.php/dav/files/alice/New', 'Basic abc');
    expect(r.ok).toBe(true);
    expect(r.detail).toContain('does not exist yet');
  });

  it('reports a bare host as 405 rather than a 404', async () => {
    mockRequestUrl.mockReturnValueOnce(res(405));
    const r = await checkWebdavBase('https://cloud.example.com', 'Basic abc');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('405');
    expect(r.detail).toContain('/remote.php/dav/files/<user>/');
  });

  it('does not ask for a parent when the URL is an origin root', async () => {
    mockRequestUrl.mockReturnValueOnce(res(404));
    const r = await checkWebdavBase('https://cloud.example.com/', 'Basic abc');
    expect(r.ok).toBe(false);
    expect(mockRequestUrl).toHaveBeenCalledTimes(1); // no parent to ask
  });

  it('reports rejected credentials distinctly from a wrong URL', async () => {
    mockRequestUrl.mockReturnValueOnce(res(401));
    const r = await checkWebdavBase('https://nc.example.com/remote.php/dav/files/alice/', 'Basic bad');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('rejected the credentials');
  });

  it('reports an unhealthy server on 5xx', async () => {
    mockRequestUrl.mockReturnValueOnce(res(503));
    const r = await checkWebdavBase('https://nc.example.com/remote.php/dav/files/alice/', 'Basic abc');
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('HTTP 503');
  });

  it('reports a transport failure as "no response", never as a wrong URL', async () => {
    mockRequestUrl.mockRejectedValueOnce(new Error('SSLHandshakeException: Connection closed by peer'));
    const r = await checkWebdavBase('https://nc.example.com/remote.php/dav/files/alice/', 'Basic abc');
    expect(r.ok).toBe(false);
    expect(r.detail).toBe('no response from the configured WebDAV URL');
  });

  it('tolerates a trailing slash on the configured URL', async () => {
    mockRequestUrl.mockReturnValueOnce(res(207));
    await checkWebdavBase('https://nc.example.com/remote.php/dav/files/alice///', 'Basic abc');
    expect(calledUrl(1)).toBe('https://nc.example.com/remote.php/dav/files/alice');
  });
});

describe('basicAuthHeader', () => {
  it('base64-encodes user:password as UTF-8, matching the WebDAV clients', () => {
    // btoa alone throws on non-Latin1 input, which is why the clients encode first; the header must
    // match what they send or the preflight would authenticate differently from the sync.
    expect(basicAuthHeader('alice', 'secret')).toBe(`Basic ${Buffer.from('alice:secret').toString('base64')}`);
    expect(basicAuthHeader('王', 'pw')).toBe(`Basic ${Buffer.from('王:pw', 'utf8').toString('base64')}`);
  });
});
