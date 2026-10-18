// Helpers for the lazy-attachment-sync feature (YANC fork).
//
// Lazy sync means: files inside attachment folders are indexed (their remote identity is recorded)
// but never downloaded automatically. The bytes are fetched on demand when a note that embeds them
// is opened. This keeps the local vault small while still backing up new local attachments.
//
// The folder list accepts three kinds of entry:
//   1. A plain folder name, e.g. `files` — matches ANY directory with that exact name at any depth
//      (`files/x.png`, `notes/files/y.png`, `a/b/files/z.png` all match). This is the "all folders
//      named X" mode the user asked for.
//   2. A vault-relative path containing `/`, e.g. `attachments/img` — matches only that specific
//      directory and everything beneath it (prefix match at a folder boundary, same semantics as
//      excludedFolders).
//   3. The literal `@obsidian` — resolves to Obsidian's configured attachment folder path, but ONLY
//      when that setting is a fixed vault path. "Same folder as current note" (`""`) and "subfolder
//      of the current note" (`"./sub"`) are per-note and cannot be enumerated in advance, so they
//      resolve to nothing here.

import { isUnderExcludedFolder } from './excludedFolders';

/**
 * Resolve the `@obsidian` token to a fixed vault path, or null when Obsidian's attachment-folder
 * setting is per-note (and therefore not a single enumerable directory).
 *
 * Obsidian's `attachmentFolderPath` values:
 *   - `""`             → same folder as the current note  (per-note, not enumerable)
 *   - `"./sub"`        → subfolder of the current note     (per-note, not enumerable)
 *   - anything else    → a fixed vault-relative path       (enumerable)
 */
export function resolveObsidianAttachmentFolder(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const p = raw.trim();
  if (p === '' || p.startsWith('./') || p.startsWith('.\\')) return null;
  return p.replace(/^\/+/, ''); // strip a leading slash so it is vault-relative
}

/**
 * True when `path` lives under any folder described by `folderSpecs` (with Obsidian's attachment
 * folder optionally injected for the `@obsidian` token).
 *
 * A path matches when:
 *   - any spec is a plain name and that name appears as a path segment, OR
 *   - any spec is a vault-relative path and `path` sits beneath it.
 */
export function isLazyAttachmentPath(
  path: string,
  folderSpecs: readonly string[] | undefined,
  obsidianAttachmentFolder?: string | null,
): boolean {
  if (!folderSpecs || folderSpecs.length === 0) return false;
  const segments = path.split('/');
  for (const spec of folderSpecs) {
    if (!spec) continue;
    if (spec === '@obsidian') {
      if (obsidianAttachmentFolder && isUnderExcludedFolder(path, [obsidianAttachmentFolder])) return true;
      continue;
    }
    if (spec.includes('/')) {
      // Vault-relative path: prefix match at a folder boundary.
      if (isUnderExcludedFolder(path, [spec])) return true;
    } else {
      // Plain folder name: any segment with that exact name.
      if (segments.includes(spec)) return true;
    }
  }
  return false;
}
