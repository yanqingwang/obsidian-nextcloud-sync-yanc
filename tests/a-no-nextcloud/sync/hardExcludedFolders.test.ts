import { SyncEngine } from '../../../src/sync/SyncEngine';
import { DavSyncSettings } from '../../../src/types';
import { DIR_BREAKER_REPORT_FILENAME, FILE_BREAKER_REPORT_FILENAME } from '../../../src/ui/breakerReport';

/**
 * [SPEC:EXCL-HARD-1] Machine-managed vault-root folders (.git, .trash) are PERMANENTLY excluded
 * from sync, regardless of the user's excludedFolders list.
 *
 * Motivation:
 *  - `.trash` is Obsidian's device-local trash (deletions land here when "Deleted files" =
 *    "Move to Obsidian trash"). Syncing it clutters every device's trash and churns against the
 *    plugin's own trashFile-based deletion (remote delete → local .trash move → re-upload).
 *  - `.git` is a machine-managed repository whose piecewise file sync corrupts the repo
 *    (discussion #6). The settings UI already DOCUMENTS these dotfolders as excluded; this makes
 *    the implementation match that promised contract.
 *
 * YANC fork: beyond the targeted .git/.trash list, hidden files (basename starts with ".") and ALL
 * dotfolders (any segment starts with ".") are excluded by DEFAULT via the "Exclude hidden files" /
 * "Exclude dotfolders" toggles. Each is independently opt-out. The assertions below use the YANC
 * defaults.
 */

function isSystemExcluded(path: string, overrides: Partial<DavSyncSettings> = {}): boolean {
  const settings = {
    configDir: '.obsidian',
    logsFolder: '',
    loggingEnabled: false,
    syncConfigFolder: false,
    excludedFolders: [],
    excludeHiddenFiles: true,
    excludeDotFolders: true,
    configSync: { appearance: false, themesSnippets: false, hotkeys: false, corePlugins: false, bookmarks: false },
    ...overrides,
  } as unknown as DavSyncSettings;
  const engine = new SyncEngine({
    app: {}, settings, configDir: '.obsidian', pluginDir: '.obsidian/plugins/nextcloud-sync',
    localAdapter: {}, stateDB: {}, statusBar: {}, webdavFactory: {},
  } as never);
  return (engine as unknown as { isSystemExcluded(p: string): boolean }).isSystemExcluded(path);
}

describe('[SPEC:EXCL-HARD-1] hard-excluded machine folders (.git / .trash)', () => {
  it('excludes the .trash folder and everything under it', () => {
    expect(isSystemExcluded('.trash')).toBe(true);
    expect(isSystemExcluded('.trash/note.md')).toBe(true);
    expect(isSystemExcluded('.trash/sub/deep.md')).toBe(true);
  });

  it('excludes the .git folder and everything under it', () => {
    expect(isSystemExcluded('.git')).toBe(true);
    expect(isSystemExcluded('.git/config')).toBe(true);
    expect(isSystemExcluded('.git/objects/ab/cdef')).toBe(true);
  });

  it('YANC: the hard .git/.trash list still matches at a folder boundary — non-dot same-prefix siblings are NOT excluded', () => {
    // `git` / `trash` (no leading dot) are ordinary folders, not the machine-managed ones → syncable.
    expect(isSystemExcluded('git/config')).toBe(false);
    expect(isSystemExcluded('trash/x.md')).toBe(false);
    // `.gitbackup` is a DIFFERENT dotfolder — it falls under the dotfolder (not .git) exclusion.
    expect(isSystemExcluded('.gitbackup/note.md')).toBe(true);
  });

  it('YANC: excludes hidden files (basename starts with ".") by default', () => {
    expect(isSystemExcluded('.env')).toBe(true);
    expect(isSystemExcluded('.gitignore')).toBe(true);
    expect(isSystemExcluded('secret/.env')).toBe(true);
    expect(isSystemExcluded('.DS_Store')).toBe(true);
  });

  it('YANC: excludes dotfolders and their subtree by default', () => {
    expect(isSystemExcluded('.archive/note.md')).toBe(true);
    expect(isSystemExcluded('.trashcan/x.md')).toBe(true);
    expect(isSystemExcluded('.github/workflows/ci.yml')).toBe(true);
    expect(isSystemExcluded('Notes/.hidden/deep/doc.md')).toBe(true);
  });

  it('YANC: opting out of the exclusions restores sync of dot content', () => {
    // A root dotfile (.env) and a hidden file in a normal folder (secret/.env) are caught by BOTH
    // rules, so both toggles must be OFF to sync them again.
    expect(isSystemExcluded('.env', { excludeHiddenFiles: false, excludeDotFolders: false })).toBe(false);
    expect(isSystemExcluded('.gitignore', { excludeHiddenFiles: false, excludeDotFolders: false })).toBe(false);
    expect(isSystemExcluded('secret/.env', { excludeHiddenFiles: false, excludeDotFolders: false })).toBe(false);
    // Dotfolders need excludeDotFolders OFF.
    expect(isSystemExcluded('.archive/note.md', { excludeHiddenFiles: false, excludeDotFolders: false })).toBe(false);
    expect(isSystemExcluded('.github/workflows/ci.yml', { excludeHiddenFiles: false, excludeDotFolders: false })).toBe(false);
    // Hard .git/.trash stay excluded even with both toggles off (the targeted hard list is independent).
    expect(isSystemExcluded('.git/config', {})).toBe(true);
    expect(isSystemExcluded('.trash/x.md', {})).toBe(true);
  });

  it('does not touch ordinary vault files', () => {
    expect(isSystemExcluded('note.md')).toBe(false);
    expect(isSystemExcluded('folder/sub/doc.md')).toBe(false);
  });
});

// Feature 056: the mass-delete breaker report notes (fixed vault-root filenames, regenerated and
// overwritten on demand — see src/ui/breakerReport.ts) are device-local diagnostic snapshots, not
// vault content worth syncing. Same rationale as the per-device debug log exclusion
// (isActiveLogFile): syncing a snapshot that's about to be overwritten again just churns.
describe('[SPEC:MDV-5] breaker report notes are excluded from sync (feature 056)', () => {
  it('excludes both fixed report filenames at the vault root', () => {
    expect(isSystemExcluded(DIR_BREAKER_REPORT_FILENAME)).toBe(true);
    expect(isSystemExcluded(FILE_BREAKER_REPORT_FILENAME)).toBe(true);
  });

  it('does not exclude an ordinary vault file with a similar-looking name', () => {
    expect(isSystemExcluded('nextcloud-sync-dir-breaker-report-old.md')).toBe(false);
    expect(isSystemExcluded('notes/nextcloud-sync-dir-breaker-report.md')).toBe(false);
  });
});
