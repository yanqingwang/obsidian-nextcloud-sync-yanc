// The session-history store is the only place that remembers which past syncs failed, so its two
// data-safety properties are asserted directly rather than through the dialog that displays it:
//   1. it keeps a bounded, newest-first roll-up (the dialog's "last N" claim must be true), and
//   2. a crash between removing the target and renaming the tmp file must not lose the store —
//      the same G4-1 guarantee LocalAdapter.atomicWrite makes, and the reason load() falls back to
//      a surviving tmp file.
import { SyncSessionHistoryStore } from '../../../src/data/SyncSessionHistoryStore';
import { SyncSessionSummary } from '../../../src/types';

function summary(over: Partial<SyncSessionSummary> = {}): SyncSessionSummary {
  return {
    startedAt: 1, completedAt: 2, uploadedCount: 0, downloadedCount: 0, deletedCount: 0,
    mergedCount: 0, conflictedCount: 0, errorCount: 0, retriedFiles: [], errors: [], ...over,
  };
}

/** In-memory DataAdapter good enough for this store: exists/read/write/remove/rename. */
function makeAdapter(initial: Record<string, string> = {}, opts: { failRename?: boolean } = {}) {
  const files = new Map<string, string>(Object.entries(initial));
  const adapter = {
    exists: jest.fn(async (p: string) => files.has(p)),
    read: jest.fn(async (p: string) => files.get(p) as string),
    write: jest.fn(async (p: string, data: string) => { files.set(p, data); }),
    remove: jest.fn(async (p: string) => { files.delete(p); }),
    rename: jest.fn(async (from: string, to: string) => {
      if (opts.failRename) throw new Error('rename failed (simulated crash)');
      files.set(to, files.get(from) as string);
      files.delete(from);
    }),
  };
  return { adapter, files };
}

const PLUGIN_DIR = '.obsidian';
const FILE = `${PLUGIN_DIR}/sync-session-history.json`;
const TMP = `${FILE}.tmp`;

describe('SyncSessionHistoryStore', () => {
  it('records a completed session and returns it newest-first', async () => {
    const { adapter } = makeAdapter();
    const store = new SyncSessionHistoryStore(adapter as never, PLUGIN_DIR);
    await store.load();
    store.record(summary({ uploadedCount: 3 }));
    expect(store.getRecent()).toHaveLength(1);
    expect(store.getRecent()[0].uploadedCount).toBe(3);
  });

  it('ignores a session that never completed', async () => {
    // A cancelled sync has completedAt === null; recording it would show a phantom "in progress"
    // row that never resolves in the dialog.
    const { adapter } = makeAdapter();
    const store = new SyncSessionHistoryStore(adapter as never, PLUGIN_DIR);
    await store.load();
    store.record(summary({ completedAt: null }));
    expect(store.getRecent()).toEqual([]);
  });

  it('keeps only the most recent 5 sessions, newest first', async () => {
    const { adapter } = makeAdapter();
    const store = new SyncSessionHistoryStore(adapter as never, PLUGIN_DIR);
    await store.load();
    for (let i = 1; i <= 8; i++) store.record(summary({ uploadedCount: i }));
    const recent = store.getRecent();
    expect(recent).toHaveLength(5);
    expect(recent.map((s) => s.uploadedCount)).toEqual([8, 7, 6, 5, 4]);
  });

  it('survives a save/load round-trip', async () => {
    const { adapter } = makeAdapter();
    const store = new SyncSessionHistoryStore(adapter as never, PLUGIN_DIR);
    await store.load();
    store.record(summary({ errorCount: 1, errors: [{ path: 'a.md', message: 'boom' }] }));
    await store.save();

    const reloaded = new SyncSessionHistoryStore(adapter as never, PLUGIN_DIR);
    await reloaded.load();
    expect(reloaded.getRecent()[0].errors[0].message).toBe('boom');
  });

  it('keeps the tmp copy when rename fails after the target was removed (G4-1)', async () => {
    // The failure window this closes: remove(target) succeeded, rename(tmp) then failed. The tmp
    // file is now the only copy of the history. Deleting it (as the pre-fix version did) would
    // leave the user with no record of which syncs failed, and no way to recover it.
    const { adapter, files } = makeAdapter({ [FILE]: '[]' }, { failRename: true });
    const store = new SyncSessionHistoryStore(adapter as never, PLUGIN_DIR);
    await store.load();
    store.record(summary({ errorCount: 1, errors: [{ path: 'a.md', message: 'boom' }] }));

    await expect(store.save()).rejects.toThrow('rename failed');
    expect(files.has(TMP)).toBe(true);
  });

  it('recovers from a surviving tmp file after a crash between remove and rename (G4-2)', async () => {
    const { adapter, files } = makeAdapter({ [TMP]: JSON.stringify([summary({ uploadedCount: 9 })]) });
    const store = new SyncSessionHistoryStore(adapter as never, PLUGIN_DIR);
    await store.load();
    expect(store.getRecent()[0].uploadedCount).toBe(9);
    // The recovered tmp is promoted back to the real file so the next save is not a recovery again.
    expect(files.has(FILE)).toBe(true);
  });

  it('starts empty rather than throwing on a corrupt file', async () => {
    const { adapter } = makeAdapter({ [FILE]: 'not json' });
    const store = new SyncSessionHistoryStore(adapter as never, PLUGIN_DIR);
    await expect(store.load()).resolves.toBeUndefined();
    expect(store.getRecent()).toEqual([]);
  });
});
