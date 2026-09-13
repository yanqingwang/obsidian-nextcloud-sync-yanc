import { credentialSignature } from '../../../src/settings/SettingTab';

// The credential fingerprint lets runSyncNow detect "credentials changed since the engine was
// built" — the manual-sign-in-after-startup case (HarmonyOS 出境易: paste app password, sync).
describe('credentialSignature', () => {
  it('changes when the pasted password value changes (same secret id)', () => {
    const a = credentialSignature('https://nc', 'alice', 'obsidian-nextcloudsync-password', 'old-secret');
    const b = credentialSignature('https://nc', 'alice', 'obsidian-nextcloudsync-password', 'new-secret');
    expect(a).not.toEqual(b);
  });

  it('changes when the server URL or username changes (trimmed)', () => {
    const base = credentialSignature('https://nc', 'alice', 's1', 'pw');
    expect(credentialSignature('https://nc/', 'alice', 's1', 'pw')).toEqual(base);
    expect(credentialSignature(' https://nc ', ' alice ', 's1', 'pw')).toEqual(base);
    expect(credentialSignature('https://other', 'alice', 's1', 'pw')).not.toEqual(base);
    expect(credentialSignature('https://nc', 'bob', 's1', 'pw')).not.toEqual(base);
  });

  it('changes when the secret id changes, and treats an empty id as the default', () => {
    const def = credentialSignature('https://nc', 'alice', '', 'pw');
    expect(def).toEqual(credentialSignature('https://nc', 'alice', 'obsidian-nextcloudsync-password', 'pw'));
    expect(credentialSignature('https://nc', 'alice', 'other-id', 'pw')).not.toEqual(def);
  });

  it('distinguishes a null password from an empty one', () => {
    expect(credentialSignature('https://nc', 'alice', 's1', null))
      .not.toEqual(credentialSignature('https://nc', 'alice', 's1', ''));
  });
});
