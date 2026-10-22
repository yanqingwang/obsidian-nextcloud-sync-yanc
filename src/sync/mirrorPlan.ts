import { RemoteDirInfo, RemoteFileInfo } from '../types';

/**
 * Pull mirror (feature 045): pure classification of what a "mirror this device from the remote"
 * operation must download and delete, given an authoritative remote listing and the local state.
 *
 * Extracted as a pure function (like `massDeleteLimit`) so the mirror contract is unit-testable in
 * the a-layer without a live server. The SyncEngine wraps this with real I/O (getFiles/download/
 * trashFile) and StateDB reconciliation.
 *
 * Safety: this operation intentionally bypasses the mass-delete breaker's COUNT limit (the user
 * explicitly declared the remote authoritative). The remaining guard is listing completeness:
 * when the remote listing could not be fully obtained, `ok` is false and every list is empty, so
 * the caller performs zero deletions (spec 045 FR-009 / SC-005).
 */

/** One local file the mirror can see: its vault-relative path and current content hash. */
export interface LocalFileEntry {
  path: string;
  hash: string;
}

/** The mirror plan: what to download, what to delete, and how many were already in sync. */
export interface MirrorPlan {
  /** True iff the authoritative remote listing was obtained completely. False ⇒ do nothing. */
  ok: boolean;
  /** Reason when `ok` is false (surfaced to the user); null when ok. */
  reason: string | null;
  /** Remote files to download (missing locally or content differs). */
  downloads: RemoteFileInfo[];
  /** Local-only files to delete (present locally, absent from the remote listing). */
  deleteFiles: string[];
  /** Local-only folders to delete (empty folders included), sorted child→parent. */
  deleteDirs: string[];
  /** Count of remote files already identical locally (skipped, no transfer). */
  skipCount: number;
  /** The authoritative remote listing (kept for apply + StateDB reconciliation). */
  remoteFiles: RemoteFileInfo[];
  /** The authoritative remote folder listing (non-excluded applied at build). */
  remoteDirs: RemoteDirInfo[];
  /** Remote folders missing locally, to create shallowest-first. */
  createDirs: string[];
}

/** The outcome of applying a mirror plan. */
export interface MirrorResult {
  downloaded: number;
  deleted: number;
  skipped: number;
  createdDirs: number;
  errors: Array<{ path: string; message: string }>;
}

/**
 * Number of path segments — deeper paths have more. Used to sort folder deletions child→parent
 * so a parent is never removed before its children.
 */
function depth(path: string): number {
  return path.split('/').length;
}

/**
 * Build a {@link MirrorPlan} from an authoritative remote listing and the local state.
 *
 * @param remoteFiles  the COMPLETE remote file listing (from a real PROPFIND, no short-circuit)
 * @param localFiles   every local file the mirror may touch (path + content hash)
 * @param localDirs    every local folder the mirror may touch (vault-relative paths)
 * @param isExcluded   predicate for system/user exclusions (isSystemExcluded ∪ excluded folders)
 * @param listingOk    whether the remote listing was obtained completely (false ⇒ abort gate)
 * @param reason       optional reason to attach when listingOk is false
 * @param remoteDirs   the COMPLETE remote folder listing — the ONLY place empty remote folders are
 *                     visible; without it they would read as local-only and be planned for deletion
 */
export function buildMirrorPlan(
  remoteFiles: RemoteFileInfo[],
  localFiles: LocalFileEntry[],
  localDirs: string[],
  isExcluded: (path: string) => boolean,
  listingOk: boolean,
  reason: string | null = null,
  remoteDirs: RemoteDirInfo[] = [],
): MirrorPlan {
  // Abort gate: an incomplete/failed listing must never drive deletions.
  if (!listingOk) {
    return {
      ok: false,
      reason: reason ?? 'Remote listing could not be obtained; mirror aborted (no changes made).',
      downloads: [],
      deleteFiles: [],
      deleteDirs: [],
      skipCount: 0,
      remoteFiles: [],
      remoteDirs: [],
      createDirs: [],
    };
  }

  const remoteEligible = remoteFiles.filter((r) => !isExcluded(r.path));
  const remoteSet = new Set(remoteEligible.map((r) => r.path));
  const remoteDirSet = new Set(remoteDirs.map((d) => d.path).filter((p) => !isExcluded(p)));
  const localHashByPath = new Map(localFiles.map((f) => [f.path, f.hash]));

  const downloads: RemoteFileInfo[] = [];
  let skipCount = 0;
  for (const r of remoteEligible) {
    const localHash = localHashByPath.get(r.path);
    // Skip only when we can PROVE the content already matches: a server-computed checksum that
    // equals the local hash. Missing locally, unknown checksum, or mismatch ⇒ download (safe side:
    // the vault ends up matching the remote regardless).
    if (localHash != null && r.checksum != null && r.checksum === localHash) {
      skipCount++;
    } else {
      downloads.push(r);
    }
  }

  // Local-only files (present locally, not on the remote) → delete. Excluded paths are untouched.
  const deleteFiles = localFiles
    .map((f) => f.path)
    .filter((p) => !isExcluded(p) && !remoteSet.has(p));

  // Local-only folders → delete. A folder is kept iff some remote file lives under it OR the folder
  // itself exists on the remote (the remote folder listing covers EMPTY folders, which no file
  // listing can see — deleting such a folder would lose local content the user expects to keep).
  const remoteDirPrefixes = remoteEligible.map((r) => r.path);
  const remoteDirList = [...remoteDirSet];
  const deleteDirs = localDirs
    .filter((d) => {
      if (isExcluded(d)) return false;
      if (remoteDirSet.has(d)) return false;
      if (remoteDirPrefixes.some((rp) => rp === d || rp.startsWith(d + '/'))) return false;
      // A remote folder nested under this one also proves the remote has it.
      if (remoteDirList.some((rd) => rd.startsWith(d + '/'))) return false;
      return true;
    })
    // child→parent so a parent folder is never removed before its children
    .sort((a, b) => depth(b) - depth(a));

  // Remote folders missing locally → create (shallowest first so parents exist before children).
  const localDirSet = new Set(localDirs);
  const createDirs = [...remoteDirSet]
    .filter((d) => !localDirSet.has(d))
    .sort((a, b) => depth(a) - depth(b));

  return {
    ok: true,
    reason: null,
    downloads,
    deleteFiles,
    deleteDirs,
    skipCount,
    remoteFiles,
    remoteDirs,
    createDirs,
  };
}
