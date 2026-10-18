// Pure helpers for the user-managed "Excluded file types" sync filter (YANC fork).
//
// The user lists extensions — `js`, `exe`, `*.dmg`, `tar.gz` — and any file whose name ends with
// one of them is never synced: not uploaded, not downloaded, and (because the same predicate guards
// server-driven deletions) never deleted locally on the server's say-so. Entries are stored
// lowercase and WITHOUT the leading dot or `*.` glob, so `*.JS` and `.js` both persist as `js`.
//
// Why extensions and not globs: a glob engine is a footgun here. `*.js` reads naturally, but the
// moment users write `notes/*` they expect folder semantics, and a half-supported glob language is
// worse than none. Accepting `*.js` on INPUT and matching by suffix is the useful 90% with no
// ambiguity — folder exclusions already have their own list.

/**
 * Normalize one user-entered extension into the stored form (lowercase, no leading dot / `*.`),
 * or return null when the entry cannot be an extension.
 *
 * Accepts `js`, `.js`, `*.js`, `*.JS`, and compound forms such as `tar.gz`.
 * Rejects empty input, path separators (`a/b`), anything still containing `*` or whitespace, and
 * entries that are only dots.
 */
export function normalizeExtension(input: string): string | null {
  if (typeof input !== 'string') return null;
  let e = input.trim().toLowerCase();
  if (e.length === 0) return null;
  // Strip a leading glob/dot prefix: "*.js" → "js", ".js" → "js", ".*.js" → "js".
  e = e.replace(/^\*\./, '');
  e = e.replace(/^\.+/, '');
  if (e.length === 0) return null;
  if (/[/\\\s*?\[\]{}]/.test(e)) return null;      // not an extension — a path or a wider glob
  if (e.startsWith('.') || e.endsWith('.')) return null;
  return e;
}

/**
 * Parse a comma/space separated field ("js, exe  *.dmg") into the stored list.
 * Invalid fragments are dropped rather than aborting the whole field, so one typo cannot silently
 * discard the rest of the list. Order is preserved and duplicates are removed.
 */
export function parseExcludedExtensions(input: string): string[] {
  if (typeof input !== 'string') return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.split(/[,;\s]+/)) {
    const e = normalizeExtension(raw);
    if (e === null || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

/** Render the stored list back into the comma-separated field. */
export function formatExcludedExtensions(list: readonly string[] | undefined): string {
  return (list ?? []).join(', ');
}

/**
 * True when `path`'s basename carries one of the excluded extensions.
 *
 * Matching is case-insensitive and suffix-based, so `tar.gz` matches `backup.tar.gz` while `gz`
 * alone would match it too. A leading dot is not an extension: `.env` has NO extension (the hidden
 * file rule owns it), so excluding `env` does not silently catch dotfiles. Entries are normalized
 * on the fly, which keeps a hand-edited data.json working without a migration.
 */
export function isExcludedExtension(path: string, extensions: readonly string[] | undefined): boolean {
  if (!extensions || extensions.length === 0) return false;
  const base = (path.split('/').pop() ?? '').toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return false;  // no extension, dotfile, or trailing dot
  const ext = base.slice(dot + 1);
  for (const raw of extensions) {
    if (!raw) continue;
    const entry = normalizeExtension(raw);
    if (entry === null) continue;
    if (entry.includes('.')) {
      // Compound suffix ("tar.gz"): compare the whole tail, not just the last segment.
      if (base.endsWith('.' + entry)) return true;
    } else if (ext === entry) {
      return true;
    }
  }
  return false;
}
