// Live check of the post-login credential verification against a real Nextcloud.
//
// Why this exists: the a-layer proves the parsing/classification logic against a mocked
// requestUrl, but the whole point of verifyAppPassword is the round-trip — that a freshly
// issued app password authenticates /ocs/v1.php/cloud/user and yields the uid WebDAV paths
// need (Nextcloud Login Flow docs: "Login name vs. email login"). Only a live server can
// prove that contract, so this runs in the b-1 layer and skips without credentials.
import { verifyAppPassword, AppPasswordRejectedError } from '../../../src/auth/verifyCredentials';

const serverUrl = process.env.NEXTCLOUD_SERVER_URL ?? '';
const user = process.env.NEXTCLOUD_USER ?? '';
const password = process.env.NEXTCLOUD_PASSWORD ?? '';

const describeLive = serverUrl && user && password ? describe : describe.skip;

/** Strips `/remote.php/...` off the configured DAV URL to get the server base the flow needs. */
function serverBase(davUrl: string): string {
  return davUrl.replace(/\/remote\.php.*$/, '').replace(/\/$/, '');
}

describeLive('verifyAppPassword — live Nextcloud (b1)', () => {
  it('accepts the configured credentials and resolves a uid', async () => {
    const verified = await verifyAppPassword(serverBase(serverUrl), user, password);
    expect(verified.uid).toBeTruthy();
    expect(verified.displayname).toBeTruthy();
    // The uid must be usable as the WebDAV path segment — i.e. not an email login name
    // unless the account's uid genuinely is one.
    expect(verified.uid).not.toContain('@');
  });

  it('rejects a wrong password with AppPasswordRejectedError (credential must not be stored)', async () => {
    await expect(
      verifyAppPassword(serverBase(serverUrl), user, `${password}-definitely-wrong`),
    ).rejects.toBeInstanceOf(AppPasswordRejectedError);
  });
});
