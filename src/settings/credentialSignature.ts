/**
 * Default secret ID in SecretStorage (users can pick a different ID via "Link…").
 * Pure module — no Obsidian imports — so the a-layer test suite can import it.
 */
export const DEFAULT_PASSWORD_SECRET_ID = 'obsidian-nextcloudsync-password';

/**
 * Fingerprint of everything that determines the credentials a sync engine is built with. Stored by
 * `initSyncEngine` when the engine is created and compared by `runSyncNow` — a mismatch (e.g. the
 * user pasted an app password AFTER startup, so the engine is still holding a null-password client
 * factory) forces a rebuild instead of syncing with stale credentials that can only fail with
 * CredentialsNotFoundError.
 */
export function credentialSignature(serverUrl: string, username: string, secretId: string, password: string | null): string {
  return `${serverUrl.trim()}|${username.trim()}|${secretId || DEFAULT_PASSWORD_SECRET_ID}|${password ?? ''}`;
}
