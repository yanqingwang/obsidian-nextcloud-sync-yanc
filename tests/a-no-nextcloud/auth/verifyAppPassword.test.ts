// The a-layer runs under jest's `node` env, which has no `window`; the timeout race uses window
// timers (as it must inside Obsidian). Alias the node globals so the code is exercisable here.
(globalThis as unknown as { window: unknown }).window = globalThis;

import { requestUrl } from 'obsidian';
import { verifyAppPassword, AppPasswordRejectedError } from '../../../src/auth/verifyCredentials';
import { NetworkError } from '../../../src/types';

const mockRequestUrl = requestUrl as unknown as jest.Mock;

function res(status: number, json: unknown = {}) {
  return Promise.resolve({ status, text: '', json, arrayBuffer: new ArrayBuffer(0), headers: {} });
}

describe('verifyAppPassword', () => {
  beforeEach(() => mockRequestUrl.mockReset());

  it('returns uid and display name from a healthy OCS response', async () => {
    mockRequestUrl.mockReturnValueOnce(res(200, {
      ocs: { data: { id: 'wang', displayname: 'Wang' } },
    }));
    const user = await verifyAppPassword('https://nc', 'wang', 'apppw');
    expect(user).toEqual({ uid: 'wang', displayname: 'Wang' });
  });

  it('resolves the uid when the login name is an email (NC docs: login name vs. email login)', async () => {
    mockRequestUrl.mockReturnValueOnce(res(200, {
      ocs: { data: { id: 'wang', displayname: 'Wang' } },
    }));
    const user = await verifyAppPassword('https://nc', 'wang@example.com', 'apppw');
    // WebDAV paths must use the uid, never the email login name.
    expect(user.uid).toBe('wang');
    expect(user.uid).not.toBe('wang@example.com');
  });

  it('sends Basic auth and the OCS-APIRequest header to /ocs/v1.php/cloud/user', async () => {
    mockRequestUrl.mockReturnValueOnce(res(200, { ocs: { data: { id: 'u', displayname: 'U' } } }));
    await verifyAppPassword('https://nc/', 'u', 'pw');
    const params = mockRequestUrl.mock.calls[0][0];
    expect(params.url).toBe('https://nc/ocs/v1.php/cloud/user?format=json'); // trailing slash normalized
    expect(params.headers['OCS-APIRequest']).toBe('true');
    expect(params.headers.Authorization).toMatch(/^Basic /);
  });

  it('throws AppPasswordRejectedError on 401 (credential must not be stored)', async () => {
    mockRequestUrl.mockReturnValueOnce(res(401));
    await expect(verifyAppPassword('https://nc', 'u', 'bad')).rejects.toBeInstanceOf(AppPasswordRejectedError);
  });

  it('throws AppPasswordRejectedError on 403', async () => {
    mockRequestUrl.mockReturnValueOnce(res(403));
    await expect(verifyAppPassword('https://nc', 'u', 'bad')).rejects.toMatchObject({ status: 403 });
  });

  it('throws NetworkError with the status on other non-2xx responses', async () => {
    mockRequestUrl.mockReturnValueOnce(res(500));
    await expect(verifyAppPassword('https://nc', 'u', 'pw')).rejects.toMatchObject(
      { name: 'NetworkError', status: 500 } as Partial<NetworkError>,
    );
  });

  it('propagates transport failures unchanged so callers can classify them', async () => {
    const socketError = new Error('SocketException: Connection reset');
    mockRequestUrl.mockRejectedValueOnce(socketError);
    await expect(verifyAppPassword('https://nc', 'u', 'pw')).rejects.toBe(socketError);
  });

  it('rejects a malformed success payload (no ocs.data.id)', async () => {
    mockRequestUrl.mockReturnValueOnce(res(200, { ocs: { data: {} } }));
    await expect(verifyAppPassword('https://nc', 'u', 'pw')).rejects.toThrow(/invalid user response/);
  });

  it('falls back to the uid when displayname is absent', async () => {
    mockRequestUrl.mockReturnValueOnce(res(200, { ocs: { data: { id: 'alice' } } }));
    const user = await verifyAppPassword('https://nc', 'alice', 'pw');
    expect(user.displayname).toBe('alice');
  });
});
