// Excluded-extension filter (YANC fork).
//
// The predicate is consulted by isSystemExcluded, which is ALSO the remote-deletion scope guard, so
// these cases pin two things at once: what gets skipped, and what a user's entry can accidentally
// capture. The dotfile case is the important one — `.env` has no extension, so listing `env` must
// not turn the hidden-file rule into an implicit second copy of itself.
import {
  normalizeExtension,
  parseExcludedExtensions,
  formatExcludedExtensions,
  isExcludedExtension,
} from '../../../src/util/excludedExtensions';

describe('normalizeExtension', () => {
  it('accepts the forms users actually type', () => {
    expect(normalizeExtension('js')).toBe('js');
    expect(normalizeExtension('.js')).toBe('js');
    expect(normalizeExtension('*.js')).toBe('js');
    expect(normalizeExtension('*.JS')).toBe('js');
    expect(normalizeExtension('  Js  ')).toBe('js');
    expect(normalizeExtension('tar.gz')).toBe('tar.gz');
  });

  it('rejects anything that is not an extension', () => {
    expect(normalizeExtension('')).toBeNull();
    expect(normalizeExtension('   ')).toBeNull();
    expect(normalizeExtension('*')).toBeNull();
    expect(normalizeExtension('notes/*')).toBeNull();
    expect(normalizeExtension('a/b')).toBeNull();
    expect(normalizeExtension('a\\b')).toBeNull();
    expect(normalizeExtension('js*')).toBeNull();
    expect(normalizeExtension('...')).toBeNull();
  });
});

describe('parseExcludedExtensions / formatExcludedExtensions', () => {
  it('splits on commas and whitespace, normalizing each fragment', () => {
    expect(parseExcludedExtensions('js, exe  *.dmg')).toEqual(['js', 'exe', 'dmg']);
    expect(parseExcludedExtensions('.JS;*.PNG')).toEqual(['js', 'png']);
  });

  it('de-dups case-insensitively and preserves order', () => {
    expect(parseExcludedExtensions('JS, js, exe')).toEqual(['js', 'exe']);
  });

  it('drops invalid fragments instead of discarding the whole field', () => {
    // A single typo must not silently wipe the rest of the list — the field parses on each keystroke.
    expect(parseExcludedExtensions('js, a/b, exe, *')).toEqual(['js', 'exe']);
  });

  it('round-trips through the field', () => {
    expect(formatExcludedExtensions(['js', 'exe'])).toBe('js, exe');
    expect(formatExcludedExtensions([])).toBe('');
    expect(formatExcludedExtensions(undefined)).toBe('');
    expect(parseExcludedExtensions(formatExcludedExtensions(['js', 'tar.gz']))).toEqual(['js', 'tar.gz']);
  });
});

describe('isExcludedExtension', () => {
  it('matches by basename suffix, case-insensitively', () => {
    expect(isExcludedExtension('scripts/app.js', ['js'])).toBe(true);
    expect(isExcludedExtension('scripts/APP.JS', ['js'])).toBe(true);
    expect(isExcludedExtension('notes/app.js.md', ['js'])).toBe(false);
  });

  it('excludes nothing when the list is empty or absent', () => {
    expect(isExcludedExtension('a.js', [])).toBe(false);
    expect(isExcludedExtension('a.js', undefined)).toBe(false);
  });

  it('leaves extensionless files and dotfiles alone', () => {
    // `.env` is a hidden FILE, not a file of type "env" — the hidden-file rule owns it.
    expect(isExcludedExtension('.env', ['env'])).toBe(false);
    expect(isExcludedExtension('secret/.env', ['env'])).toBe(false);
    expect(isExcludedExtension('README', ['md'])).toBe(false);
    expect(isExcludedExtension('notes/trailing.', [''])).toBe(false);
  });

  it('supports compound suffixes and the last-segment shorthand', () => {
    expect(isExcludedExtension('backup.tar.gz', ['tar.gz'])).toBe(true);
    expect(isExcludedExtension('backup.tar.gz', ['gz'])).toBe(true);
    expect(isExcludedExtension('backup.tar.gz', ['tar'])).toBe(false);
  });

  it('tolerates un-normalized entries from a hand-edited data.json', () => {
    expect(isExcludedExtension('a.js', ['*.JS'])).toBe(true);
    expect(isExcludedExtension('a.js', ['.js'])).toBe(true);
    expect(isExcludedExtension('a.js', [''])).toBe(false);
  });
});
