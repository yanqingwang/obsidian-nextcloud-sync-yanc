import { DataAdapter } from 'obsidian';
import { SyncSessionSummary } from '../types';

const TMP_SUFFIX = '.tmp';
/** Number of recent sync sessions to keep. */
const MAX_SESSIONS = 5;

/**
 * Persisted log of recent sync session summaries (last 5).
 * Backs the "Sync History" section of the sync status dialog.
 */
export class SyncSessionHistoryStore {
  private sessions: SyncSessionSummary[] = [];
  private readonly filePath: string;
  private readonly tmpPath: string;
  private saveChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly adapter: DataAdapter,
    pluginDir: string,
  ) {
    this.filePath = `${pluginDir}/sync-session-history.json`;
    this.tmpPath = this.filePath + TMP_SUFFIX;
  }

  async load(): Promise<void> {
    try {
      let readPath = this.filePath;
      let recoveredFromTmp = false;
      if (!(await this.adapter.exists(readPath))) {
        if (!(await this.adapter.exists(this.tmpPath))) return;
        readPath = this.tmpPath;
        recoveredFromTmp = true;
      }
      const raw = await this.adapter.read(readPath);
      const parsed = JSON.parse(raw) as unknown;
      this.sessions = Array.isArray(parsed) ? (parsed as SyncSessionSummary[]) : [];
      // Keep only the last MAX_SESSIONS
      if (this.sessions.length > MAX_SESSIONS) {
        this.sessions = this.sessions.slice(-MAX_SESSIONS);
      }
      if (recoveredFromTmp) {
        await this.adapter.rename(this.tmpPath, this.filePath).catch(() => undefined);
      }
    } catch {
      console.warn('[SyncSessionHistoryStore] Failed to parse session history; starting empty');
      this.sessions = [];
    }
  }

  /** Add a completed session summary. Keeps only the last MAX_SESSIONS. */
  record(summary: SyncSessionSummary): void {
    // Only record completed sessions
    if (summary.completedAt === null) return;
    this.sessions.push(summary);
    // Keep only the last MAX_SESSIONS
    if (this.sessions.length > MAX_SESSIONS) {
      this.sessions = this.sessions.slice(-MAX_SESSIONS);
    }
  }

  /** Get recent sessions, newest first. */
  getRecent(): SyncSessionSummary[] {
    return [...this.sessions].reverse();
  }

  save(): Promise<void> {
    const run = this.saveChain.then(() => this.doSave());
    this.saveChain = run.catch(() => {});
    return run;
  }

  private async doSave(): Promise<void> {
    const json = JSON.stringify(this.sessions);
    await this.adapter.write(this.tmpPath, json);
    let targetRemoved = false;
    try {
      if (await this.adapter.exists(this.filePath)) {
        await this.adapter.remove(this.filePath);
        targetRemoved = true;
      }
      await this.adapter.rename(this.tmpPath, this.filePath);
    } catch (err) {
      // Same guarantee as LocalAdapter.atomicWrite (G4-1): once the target has been removed, the tmp
      // file is the only surviving copy of the new history, so it must be left in place for load() to
      // recover from. Deleting it here would turn a failed rename into total loss of the store —
      // and this file holds the only record of which syncs failed, which is the one thing a user
      // debugging a flaky connection needs.
      if (!targetRemoved && await this.adapter.exists(this.tmpPath)) {
        await this.adapter.remove(this.tmpPath);
      }
      throw err;
    }
  }
}
