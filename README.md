# Nextcloud sync YANC

[English](#english) | [中文](#中文)

---

## English

> [!NOTE]
> Nextcloud sync YANC is an independent Obsidian plugin, originally based on
> [obsidian-nextcloudsync](https://github.com/siosig/obsidian-nextcloudsync) by Daisuke ITO (MIT).
> It has been developed independently since 1.2.2: mobile/Android login resilience, a two-stage
> connection test, sync session history, folder/extension exclusion rules, sync-only folder
> whitelists, lazy attachment sync, and mass-delete safety breakers.
>
> It publishes under its own plugin id, `nextcloud-sync-yanc`, separate from the original
> `nextcloud-sync`. **If you installed a copy before 1.1.1 under the old `nextcloud-sync` id,
> uninstall that copy first**, or the two will fight over the same folder.
>
> **Report issues here:** [yanqingwang/obsidian-nextcloud-sync-yanc](https://github.com/yanqingwang/obsidian-nextcloud-sync-yanc/issues)

**Good news for anyone working across multiple desktops and mobile devices.**

The only cost you pay is waiting for the initial Vault index to complete on first install. From that moment on, you get:

- **Your writing is never lost** — the merge logic keeps your Vault in a clean, consistent state even when the same note is edited on multiple devices at once.
- **Sync fades into the background** — Nextcloud's fast differential sync means you'll stop noticing sync time altogether.
- **Works beyond Nextcloud too** — with slightly reduced features, it works against any standard WebDAV server as well.

---

Bidirectional sync between your Obsidian Vault and Nextcloud — built **specifically for Nextcloud**, not just generic WebDAV.

Most "WebDAV sync" plugins treat the server as a dumb file store: they compare modification times, copy files, and hope for the best. **Nextcloud Sync** instead talks to Nextcloud's own APIs (Capabilities, file IDs, checksums, versions, locking, Login Flow v2) to make syncing *safe*, *fast*, and *frictionless* — while still degrading gracefully to plain WebDAV when those APIs aren't available.

> A Japanese translation is available at [`README.ja.md`](README.ja.md).

---

## 💬 Your feedback shapes this plugin

This plugin is still young and some behaviour can be rough around the edges. **Please tell me what you run into — it genuinely helps.** Whether something broke, something's missing, or you just have a thought after using it, I'd love to hear from you (impressions especially make my day!):

- 🐛 **Report a bug** → [GitHub Issues](https://github.com/yanqingwang/obsidian-nextcloud-sync-yanc/issues)
- 🙋‍♂️ **Request a feature / share your impressions** → [GitHub Discussions](https://github.com/yanqingwang/obsidian-nextcloud-sync-yanc/discussions)

---

> ⚠️ **Heads-up: settings are being streamlined.** Over the next few days, options with little practical value will be progressively removed so the plugin stays simple and hard to misconfigure. Sensible behaviour is derived automatically instead. If a setting you used to see is gone, that is intentional — the plugin now picks the right value for you.

---

## What's new in 1.2.3

- **Fixed: Mirror from remote could delete empty folders that exist on the server** — planning now lists remote folders too, recreates missing folders (including empty ones) shallowest-first, and never removes a folder the server still has.
- **Fixed: a failed local deletion was counted as deleted** — the mirror now distinguishes deleted/absent/ignored/failed, keeps tracking for failures so the leftover file is not re-uploaded on the next sync, and saves the converged state before it finishes.

## What's new in 1.2.2

- **Exclude underscore-prefixed names** — two opt-in toggles in **Settings → Excluded folders** drop `_draft.md`-style files and `_inbox/`-style folders. Both are OFF by default, because underscore names are often real content.
- **File type exclusions** — a comma-separated extension list (`js, exe, *.dmg`) keeps matching files out of the sync in both directions, with an optional *Delete excluded types from server* cleanup.
- **Sync only folders** — a whitelist; when non-empty, only files under those folders are synced.
- **Lazy attachment sync** — attachments in configured folders are indexed but downloaded only when a note that embeds them is opened.
- **Fixed: excluded-type server cleanup did not run** when the root ETag was unchanged — the full scan now forces a real listing so the purge actually sees every server-side file.

For the full version history of every release, see the **[changelog](CHANGELOG.md)**.

---

## Why Nextcloud-specific? (vs. generic WebDAV)

| Concern | Generic WebDAV plugin | **Nextcloud Sync** |
|---------|-----------------------|--------------------|
| Change detection | Modification time (clock-skew prone, false re-uploads) | **Content hash** + Nextcloud `sync-token` / checksums capability for true differential sync |
| Rename / move | Delete + re-create (loses history, re-downloads everywhere) | **File-ID (`OC-FileId`) tracking** — a rename stays a rename on every device, history preserved |
| Deletion safety | Hard delete | Routed through the **Nextcloud trashbin** — recoverable, never an irreversible `DELETE` |
| Setup | Manual app-password copy & paste | **Login Flow v2** — approve in the browser, credentials are issued and stored automatically |
| Large files | Skipped or fail on a single `PUT` | **Chunked upload** — split, resumable, checksum-verified |
| Concurrent edits | Hope nobody else writes | **Optimistic concurrency** — every update carries an `If-Match` precondition, so a remote changed by another device is turned into a conflict (no lost update) without locking round trips |
| Recovery from mistakes | None (your copy is all you have) | **Server version history** — browse and restore any past revision from inside Obsidian |
| Server unavailable | Cryptic errors / partial writes | **Maintenance-mode detection** (`/status.php`) and parsed Nextcloud error messages |
| Capability awareness | None | **Capabilities probing** (`/ocs/.../capabilities`) — features light up only when the server supports them (Progressive Enhancement) |

If you point it at a non-Nextcloud WebDAV server, it automatically disables the Nextcloud-only features and falls back to standard recursive WebDAV sync — so it still works, just without the extras.

---

## Features

### Core sync
- **Bidirectional sync** between Obsidian and Nextcloud.
- **Hash-based differential sync** — only changed files are transferred (no full rescans), so a 1,000-file Vault settles in seconds.
- **Atomic writes** — a download interrupted mid-transfer never leaves a half-written or 0-byte file in your Vault.
- **Rename / move tracking** via Nextcloud file IDs — moving a note doesn't re-upload it everywhere.
- **Trashbin deletes** — remote deletions use the Nextcloud trashbin (recoverable). When a deletion is applied to your local Vault, it follows **your Obsidian "Deleted files" setting** (system trash / move to `.trash` / permanently delete) rather than forcing one behavior; folders and files outside the Vault's tracked notes (e.g. config-folder files) are handled too.
- **Per-Vault configuration** — each Vault can target a different Nextcloud server / account without state bleeding between them.
- **Excluded folders** — register Vault-relative folders that are never synced (neither uploaded nor downloaded, and never created on the server). Useful for version-control or tooling folders such as `.git`, and for large media you keep device-local. Matching is a folder-prefix match at a folder boundary, so `Attachments` excludes `Attachments/` and everything under it but not `Attachments-old`. Add or remove entries under **Settings → Excluded folders** (type a path or use the folder picker). Dotfolders (`.git`, the config-folder `plugins/`, the plugin's own state) are already excluded automatically; this list is an additive layer on top.
- **File type exclusions** — a comma-separated list such as `js, exe, *.dmg` keeps matching files out of the sync in both directions (case-insensitive suffix match). Optionally, *Delete excluded types from server* also removes them from the server so they stop accumulating; local copies are never touched.
- **Sync only folders** — the opposite of Excluded folders: when the whitelist is non-empty, only files under those folders are synced. Empty (the default) syncs the whole vault.
- **Lazy attachment sync** — files in the configured attachment folders are indexed but not downloaded until a note that embeds them is opened, so a small vault can reference a large remote attachment collection. New or edited local attachments are still uploaded.
- **Exclude underscore-prefixed names** — opt-in toggles for `_draft.md`-style files and `_inbox/`-style folders (OFF by default, since underscore names are often real content).
- **Periodic auto-sync** with a configurable interval (set to `0` for manual-only), plus a **Sync now** command.
- **Sync on file change (watch mode)** — optionally sync immediately after you create, edit, delete, or rename a file **or folder** (file edits are debounced ~2s after you stop typing; deletes, renames and folder operations propagate right away). The status bar shows when a change is being pushed. Toggle on/off in settings; works alongside the periodic interval. Desktop only.
- **Resilient retries** — failed files are skipped, queued, and retried next sync with exponential backoff; a dropped Wi-Fi connection resumes automatically.
- **Standard WebDAV fallback** — works against any WebDAV server (recursive), Nextcloud features auto-disabled.
- **Filter the sync-status dialog by status** — the status dialog has a checkbox row (Uploaded, Downloaded, Deleted, Merged, Conflicted, Local wins, Remote wins, Error) so you can focus on, say, only conflicts. All on by default; your selection is saved and persists across Obsidian restarts, and applies to every section.
- **Compare a file with its remote version** — right-click any file in the explorer (on mobile: long-press, or run the *Compare with remote* command) to open a popup comparing local vs remote modification time, checksum (with a match/mismatch badge), and a line diff. On narrow screens the diff stacks vertically. Resolve the difference right there with **push** (overwrite remote with local) or **pull** (overwrite local with remote), each behind a confirmation.
- **Per-device logging** — one opt-in log file, `nextcloud-debug_<device>.txt`, written to the vault root and named per device so multiple devices never overwrite one another (another device's log can even sync into this vault for side-by-side comparison). Each line is timestamped and carries the plugin version, and a full settings snapshot is written when logging turns on; every sync operation is recorded. Useful for troubleshooting on mobile where there's no console. Note: Obsidian hides `.txt` files unless *Settings → Files & Links → Detect all file extensions* is on, and they never appear in Quick Switcher — you can also open the file from your OS or Nextcloud. Turn logging off and delete the file when finished.
- **Reset the Vault index** *(Settings → Maintenance)* — clear this device's sync tracking index back to its first-install state (behind a confirmation) so the next sync re-scans everything. No Vault or remote files are deleted; use it to recover from inconsistent sync state.
- **Mirror from remote** *(Settings → Maintenance)* — force this device's vault to exactly match the remote: download everything the remote has and delete local files/folders the remote lacks (honoring your Obsidian trash setting, so removals are recoverable). A confirmation shows how many files will be downloaded and deleted first; unsynced local changes are discarded. It bypasses the mass-delete safety limit (you have explicitly declared the remote authoritative) but aborts without deleting anything if the remote listing can't be fully read. Handy for making a device follow the remote after migrating from another sync tool.

### Conflict safety (never lose content)
- **A strategy per file type.** You pick **which extensions are "auto merge files"** (markdown, text and common code extensions by default) and a conflict strategy for each side: an **Auto merge file strategy** and an **Other file strategy** (everything else — images, PDFs, config JSON). Every conflict is always decided — there is no hold/error mode.
- **Merge** (`reconcile-text` / diff3, the default for auto merge files) integrates edits in different regions, including YAML frontmatter when the two sides changed non-overlapping lines. A text conflict is written as conflict markers; a non-text file is left untouched and flagged (never corrupted with markers).
- **Deterministic strategies** for anything else: **Latest modified** (keep the newer side — the default for other files), **Biggest size** (keep the larger), **Local wins**, or **Remote wins**. A size/mtime tie is left untouched and re-evaluated on the next sync. Keep Nextcloud version history on so an overwritten side is recoverable; *Compare with remote* lets you resolve any file by hand.
- **Conflict badge** in the status bar showing the count of unresolved conflicts (clears to normal at zero; pairs well with a `#conflict` tag search).

### Nextcloud power features
- **Login Flow v2** — set up with a browser approval instead of manually issuing and pasting an app password. Credentials are stored in Obsidian's secret credentials store, **never in plain text** in `data.json`.
- **Server version history** — for the active note, list every revision the server holds (newest first) and restore any of them atomically, with confirmation. The restored content syncs back cleanly without triggering an infinite conflict loop.
- **Chunked upload** — large attachments (images, PDFs, audio) above the chunk threshold are split and uploaded resumably; interrupted uploads never publish a partial file, and completion is checksum-verified. A separate absolute `maxFileSizeMB` cap guards memory in **both directions** — oversized files are skipped on upload *and* on download (the download size is taken from the server's PROPFIND, so the body is never fetched).
- **Lost-update safety without locking** — every update carries an always-on `If-Match` precondition: a remote changed by another client returns 412, which the engine turns into a conflict (download remote + resolve). This replaces per-file WebDAV LOCK/UNLOCK round trips, so server-side file locking is intentionally never used.

---

## Mobile (iOS / Android)

Mobile is supported, with a few platform-aware differences (desktop behaviour is unchanged):

- **Automatic sync is off by default on mobile.** The OS suspends background timers, so periodic auto-sync and "sync on file change" are disabled (greyed out). What runs instead: **Sync on startup**, on by default on every platform (since 0.7.11), which syncs a few seconds after the app opens; **sync on returning to the app** (since 1.0.2), which covers the case where Obsidian was left running in the background rather than restarted, and runs at most once every five minutes; and **Sync now** whenever you want it.
- **Large files are skipped on mobile** in **both directions (upload and download)** above the "Maximum file size" limit (set `0` for unlimited) to avoid out-of-memory crashes; skips are reported.
- **No progress UI on mobile** — only error notices are shown.
- **Network concurrency** is configurable; its first-run default is derived from the device's available memory — uniformly on desktop and mobile, with no platform-specific branch: **16** with 8 GB of RAM or more, **8** at 4 GB or more, **4** below that, and **3** when the device doesn't report its memory (common on mobile). Transfers run with bounded parallelism — capped both by this count and by a total in-flight-bytes budget (smaller on mobile) so large files can't exhaust memory — and uploads to the same folder are serialized to avoid server lock contention.
- **Sync on Wi-Fi only** skips on cellular (Android/desktop). **Not available on iOS** (no network-type API), where the toggle is disabled.
- **Sync now shows a result notice on mobile** (uploads / downloads / conflicts, or "already up to date") since there's no status bar. Tapping it while not signed in stays disabled, and the settings screen shows a clear "not signed in yet" banner.
- **Sync and Mirror from remote are two taps.** Obsidian mobile draws no ribbon bar, so a plugin icon never appears in place — but the app republishes every ribbon action under **Open menu** (the last item on the navigation bar), where you'll find **Sync with Nextcloud** and **Mirror from remote**. For one tap instead of two, pin a command to the mobile toolbar: **Settings → Mobile → Manage toolbar options**, scroll to **Add global command**, and add **Sync now**, **Open sync status** or **Mirror from remote**. **Open sync status** opens the dialog holding both actions plus the last session's activity. Mirror from remote always shows its confirmation, with the file counts, before anything is downloaded or deleted.
- Debug mode (diagnostic log) is available on mobile and does not change syncing.

## Requirements

- **Obsidian** `1.13.0` or later. Desktop (Electron) and mobile (iOS / Android) are supported. **This is a change in 1.0.0** — earlier releases required `1.11.4`. The settings tab now uses Obsidian's declarative settings API, which is what makes the plugin's settings findable in Obsidian's own settings search; that API arrived in `1.13.0`, and below it the settings screen would come up empty. Obsidian will not offer 1.0.0 to older installs, so they stay on `0.7.44` until they update Obsidian.
- **Nextcloud** Hub 26 "Winter" (server `33`) or later is **recommended** for the Nextcloud-specific features. Older Nextcloud servers are no longer blocked — they still connect and sync, but the settings screen shows a recommendation banner and some features may degrade. Plain WebDAV servers fall back to core sync.
- A Nextcloud account. You can authenticate with **Login Flow v2** (recommended) or a manually issued **app password** (never your main password).

---

## Installation

### From the Community Plugins browser

Search for **Nextcloud sync YANC** in **Settings → Community plugins → Browse**.

### From this fork's releases (manual)

1. Open the [releases page](https://github.com/yanqingwang/obsidian-nextcloud-sync-yanc/releases) and
   download the assets for the version you want: `main.js`, `manifest.json`, `styles.css`.
2. Copy them into `<YourVault>/.obsidian/plugins/nextcloud-sync-yanc/`.
   The folder name **must** be `nextcloud-sync-yanc` — it is the manifest `id`, and Obsidian will not
   load a plugin whose folder name does not match.
3. Reload Obsidian and enable **Nextcloud sync YANC** under **Settings → Community plugins**.

On **Android**, Obsidian has no "install from zip" option, so copy the three files into the vault's
`.obsidian/plugins/nextcloud-sync-yanc/` folder over a file manager or sync client, then restart
Obsidian.

### Via BRAT (auto-updates)

Install [BRAT](https://github.com/TomBraun/obsidian-brat), then add this repository
(`yanqingwang/obsidian-nextcloud-sync-yanc`) as a beta plugin. BRAT installs from the latest release
and notifies you when a newer one is published.

### Upstream, not this fork

The original plugin by Daisuke ITO is listed separately as **Nextcloud Sync**
([siosig/obsidian-nextcloudsync](https://github.com/siosig/obsidian-nextcloudsync)). Installing that
one gives you upstream 1.0.8, which does **not** include this fork's Android login resilience or
connection test. The two use different plugin ids, so both can be installed at once.

### Manual installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest
   [GitHub Release](https://github.com/yanqingwang/obsidian-nextcloud-sync-yanc/releases).
2. Copy them into `<YourVault>/.obsidian/plugins/nextcloud-sync-yanc/`.
3. Reload Obsidian and enable **Nextcloud sync YANC** under **Settings → Community plugins**.

---

## Getting started

1. Open **Settings → Nextcloud Sync**.
2. Enter your **Server URL** — the full WebDAV endpoint, `https://<host>/remote.php/dav/files/<user>/`,
   **not just the host**. Entering only `https://cloud.example.com` fails with **HTTP 405**. `<user>` is your
   Nextcloud user ID (usually not your email). You may append a subfolder (e.g. `.../<user>/Documents`) to
   sync there instead of at the account root.
3. Authenticate:
   - **Recommended:** click **Login with browser** (Login Flow v2), approve in the browser, and credentials are filled in and stored automatically; **or**
   - enter your **username** and a manually issued **app password**.
4. (Optional) Adjust the auto-sync interval, **Sync on file change** (watch mode), and auto-merge options.
5. Run the **Sync now** command (or wait for the periodic sync). The first run performs a full scan of your Vault and the remote, then transfers what's needed; subsequent syncs are incremental.

Your Vault is synced into a folder named after the Vault on the Nextcloud side, keeping multiple Vaults cleanly separated.

### Adding a second device

The plugin syncs a Vault that is already open in Obsidian — it does not open a Nextcloud folder as a Vault. So a second device does not browse to the remote; it starts with its own Vault that happens to carry the same name:

1. On the second device, **create a new, empty Vault** and give it **exactly the same name** as the first one. That name *is* the remote folder, matched character for character including case — `My Notes` and `my notes` are two separate folders on the server.
2. Install and enable Nextcloud Sync in that Vault, enter the **same Server URL**, and authenticate.
3. Run **Sync now**. The first run downloads the existing Vault into the new one.

To confirm both devices agree, compare the read-only **Sync target (WebDAV)** row in **Settings → Nextcloud Sync**: it shows the effective remote path (Server URL plus Vault folder). If that line reads identically on both devices, they point at the same place.

On Obsidian mobile, this means **Create new vault** — not *Set up Obsidian Sync*, which is Obsidian's own paid service, and not *Open folder as vault*, which only opens a folder already present in the phone's storage.

If the Vault on the second device is **not** empty, back it up first. The first sync reconciles both sides, so notes already there are uploaded as well as downloaded.

---

## FAQ

**Can I use a scoped Nextcloud Public Link Share instead of granting full account access?**

Yes. If you'd rather not hand the plugin an app password with full account access, you can share a single directory as a **Public Link Share with username/password** on the Nextcloud side, then point the plugin at it:

- **Server URL:** `https://<host>/public.php/webdav/`
- **Username:** the share token (the part of the share link after `/s/`)
- **App password:** the share's password

One point of confusion here: when you click **Link…** to store the app password, you're asked for an **ID** and a **value**. The **ID is a local storage key inside Obsidian's encrypted Secret Storage — it is never sent to the server**, so it can be anything (e.g. `default`); it's restricted to lowercase letters/digits/dashes because that's an Obsidian platform constraint, not something this plugin controls. The actual share password goes in the **value**, which accepts any characters. Put the share token in the **Username** field, not in the ID field.

Note: version history / restore and chunked upload are optional convenience features layered on top of core sync; they haven't been verified against Public Link Share endpoints and may not work there. Basic upload/download sync is unaffected.

---

**I got `HTTP 423 (PUT)` or `HTTP 423 (DELETE)` — what does that mean?**

A 423 means the file is locked on the Nextcloud **server** side, not by this plugin. It can happen either from one of the four force-resolve choices in Sync Status (Use remote / Use local / Latest modified / Biggest size) or during a normal background sync. A common cause is a lock left behind by the Nextcloud Text web editor: opening a file there takes out a lock with no timeout, and if the browser tab or session ends uncleanly the lock can leak and stay in place indefinitely. It can also be a genuine lock held by someone actively editing the same file elsewhere.

When the server reports a lock owner, the plugin's notice and Sync Status result listing now show that owner instead of the previous bare "HTTP 423 (PUT)" message with no explanation.

This plugin does not resolve the lock automatically and has no in-app "unlock" action — releasing a lock without knowing its origin risks overwriting someone else's in-progress edit. To resolve it, close the session or tab holding the lock (e.g. the Nextcloud Text editor tab), or ask a server administrator to clear it if it's genuinely leaked or stuck.

---

## Enabling Nextcloud server-side features

One power feature depends on a server-side Nextcloud app. It only needs to be enabled **once by a Nextcloud administrator**. The plugin detects it through the capabilities API — if the app is missing, the feature simply stays inactive (no error).

> **Lost-update safety needs no setting.** The plugin always sends an `If-Match` precondition on upload, so a file changed on the server by another client is turned into a conflict instead of being silently overwritten — there is no File Locking toggle to configure.

### Version history

Server-side versions come from the built-in **Versions** app (app ID `files_versions`), which is **enabled by default** on a standard Nextcloud install — usually nothing to do.

- If it was disabled, re-enable it: **Apps → Versions → Enable**, or:
  ```bash
  sudo -u www-data php /var/www/nextcloud/occ app:enable files_versions
  ```
- Versions are created automatically as files change; browse and restore them with the **Show version history** command in Obsidian.
- A note must have been changed on the server at least once for prior revisions to exist. Retention is configured server-side by the admin (`versions_retention_obligation` in `config.php`).

### Other settings worth checking

These are not strictly required, but on self-hosted instances they often need attention for smooth, reliable syncing. All are server-side (admin) settings.

- **Trusted domains** — the host you connect to must be listed in `trusted_domains` in `config.php`, otherwise the server rejects requests. Add your domain/IP if needed.
- **HTTPS & reverse proxy (important for Login Flow v2)** — behind a reverse proxy, set `overwriteprotocol => 'https'`, `overwritehost`, `overwrite.cli.url`, and `trusted_proxies` correctly. If these are wrong, the URLs returned by Login Flow v2 (and downloads) can point to the wrong scheme/host and fail. Always use an `https://` server URL in the plugin.
- **Upload size limits (for chunked upload / large attachments)** — raise PHP `upload_max_filesize` and `post_max_size`, and the web-server body limit (nginx `client_max_body_size`, e.g. `0` or a large value). Chunked upload sends small chunks, but the final assembly and very large files still hit these limits.
- **Request timeouts** — for large vaults or big files, increase PHP `max_execution_time` and php-fpm / web-server timeouts (e.g. nginx `fastcgi_read_timeout`). The plugin uses a fixed 30-second network timeout.
- **Brute-force protection** — Nextcloud throttles repeated requests from one IP and can return HTTP 429, especially when several devices sync from the same network or after auth errors. If you hit this, whitelist the network in **Administration settings → Security**, or set `auth.bruteforce.protection.enabled`/the IP allow-list in `config.php`.
- **Background jobs (cron)** — configure Nextcloud's recommended **Cron** background-job mode so version cleanup and other maintenance run reliably.
- **App passwords & two-factor auth** — never use your main account password; if 2FA is enabled an app password is mandatory. Login Flow v2 issues one for you automatically.
- **Checksums (optional, recommended)** — the plugin prefers Nextcloud's `oc:checksums` (SHA-256) for change detection and automatically falls back to ETag when they aren't present, so no configuration is required; leaving Nextcloud's default checksum support enabled gives the most accurate detection.

---

## Settings defaults

The settings screen is intentionally minimal: only Server URL, sign-in, Sync folder,
Sync interval, Wi-Fi only, Excluded folders, the config-folder toggles, and an
*Enable logging* switch are shown. Every other option was removed and is now a fixed
value or derived automatically from your platform. They are documented here so you
always know what the plugin is doing.

### Editable settings (initial values)

These are the options you can change. Most start the same on both platforms; a few differ on first run.

| Setting | Desktop | Mobile |
|---|---|---|
| Server URL / Username / App password | empty | empty |
| Sync interval | 15 min | 15 min (disabled — use *Sync now* or *Sync on startup*) |
| Sync on Wi-Fi only | off | on |
| Sync config folder (master) | off | off |
| └ Bookmarks / Other settings | on / on | on / on |
| Auto merge file types | md, txt, cpp, py, c, h, hpp, rs, go, ts, js, java, sh | same |
| Auto merge file strategy | Merge | Merge |
| Other file strategy | Latest modified | Latest modified |
| Enable logging | off | off |
| Excluded folders | empty | empty |

> The config-folder category toggles (Bookmarks, Other settings) only take effect once the master *Sync config folder* is on.

### Fixed values (all platforms)

| Setting | Value |
|---|---|
| Network timeout | 30 seconds |
| Startup sync delay | 1 second (`0` = no startup sync) |
| Chunk threshold | 50 MB (desktop) / 20 MB (mobile) |
| Chunked upload | on |
| Bulk upload | on |
| File locking | off — `If-Match` preconditions provide lost-update safety |
| Max conflict regions | 0 (no region-count fallback) |
| Compare with remote | on (desktop and mobile) |
| Log folder | vault root |
| Device name | auto (`<platform>-<deviceId>`) |

### Platform-derived values

| Setting | Desktop | Mobile |
|---|---|---|
| Sync on file change | on | off |
| Maximum file size | unlimited (`0`) | 20 MB |
| Network concurrency | auto from RAM (≈ 16 on 8 GB+) | ≈ 3 |

---

## How it works (in brief)

On connect, the plugin probes `/status.php` (maintenance mode) and `/ocs/v1.php/cloud/capabilities` to learn the server version and which features (`checksums`, `files locking`, …) are available. It then maintains a **per-device state database** — a snapshot of every file's path, content hash, and remote file ID at the last successful sync. Each sync diffs the current state against that snapshot and the server's `sync-token`, transferring only what changed. Every Nextcloud-specific behavior is gated behind capability detection, so the same plugin works against a full Nextcloud Hub and a bare WebDAV server alike (**Progressive Enhancement**).

---

## Testing & reliability

Sync correctness is guarded by an extensive automated test suite: **hundreds of fast pure-logic tests** (run on every change) plus **live end-to-end suites that drive two devices against a real Nextcloud server**, including exhaustive option-combination matrices for conflict resolution and multi-device convergence.

These tests exist specifically to prevent sync-inconsistency states — **data loss, endless re-uploading/re-downloading, a remote change that never reaches the local copy, or a local change that never reaches the remote**. Even so, no test suite can cover every possible case, and unintended behavior can never be entirely ruled out. **If you ever run into such a situation, please don't hesitate to [open an issue](https://github.com/yanqingwang/obsidian-nextcloud-sync-yanc/issues) — it will be addressed as quickly as possible.**

---

## Privacy & security

- **This plugin collects no telemetry whatsoever.** No usage data, analytics, or crash reports are gathered or sent anywhere; the only network traffic is the sync between your vault and your own Nextcloud/WebDAV server.
- App passwords / credentials are kept in Obsidian's **secret credentials store**, never written in plain text to `data.json`.
- Your **main account password is never used or stored** — only app passwords (issued manually or via Login Flow v2).
- All network traffic uses Obsidian's `requestUrl` API.
- The Obsidian config folder (`.obsidian/`) is excluded from sync by default — only your notes and other vault files are synced. You can opt in to syncing selected parts of it via **Sync config folder** (see below). **Community plugins (`.obsidian/plugins/`) and the plugin's own sync-state database are never synced**, regardless of settings — they hold executable code and device-specific state, which is unsafe to overwrite across devices.

---

## Limitations

- **End-to-end encryption (E2EE)** relies on the HTTPS transport layer; the plugin does not add a redundant encryption layer of its own. This is a deliberate trade-off favouring maximum transport security and performance.
- **Config folder sync is opt-in.** Enable **Sync config folder** in settings to sync `.obsidian/` config across devices, chosen with two toggles: **Bookmarks** and **Other settings** (appearance, themes & snippets, hotkeys, and core-plugin settings). **Community plugins and the plugin's own sync-state database are never synced** (executable code / device-specific state). A synced change to core-plugin settings may require an Obsidian restart on the other device to take effect.
- Designed primarily for Markdown / text Vaults; single files in the hundreds-of-MB range are beyond the v1 design target.
- Keep the Vault on local storage — don't double-manage it with another cloud sync (e.g. iCloud Drive) at the same time.
- Nextcloud-specific features require a compatible server version; older or non-Nextcloud servers transparently fall back to core WebDAV sync.

---

## Contributing & feedback

Bug reports and ideas are genuinely welcome. The plugin is still maturing, and most of what has been fixed so far came from someone taking the time to describe what they saw.

- 🐛 **Report a bug** → [GitHub Issues](https://github.com/yanqingwang/obsidian-nextcloud-sync-yanc/issues)
- 🙋‍♂️ **Request a feature / share your impressions** → [GitHub Discussions](https://github.com/yanqingwang/obsidian-nextcloud-sync-yanc/discussions)

**Please open an issue or a discussion rather than sending a pull request.** A PR that arrives unannounced is read as input and valued as such, but it is unlikely to be merged as it stands. This is a single-maintainer project with a deliberate design policy — user-facing options are kept deliberately few, and behaviour is pinned by a specification that the test suite checks against — so whether a change fits depends on decisions that are not visible from the code alone, and on what is already in flight. Judging that after the code is written is harder than agreeing on the approach beforehand, and it wastes your effort whenever the answer turns out to be no. Describe what you want to change and why; if it fits, the approach can be settled before you write anything.

---

## Development

```bash
npm install
npm run dev    # watch and rebuild main.js
npm run build  # type-check and create the production bundle
npm test       # fast pure-logic test suites
```

Release assets are `main.js`, `manifest.json`, and `styles.css`.

---

## Feedback

- GitHub Issues: <https://github.com/yanqingwang/obsidian-nextcloud-sync-yanc/issues>
- Email: **289631530@qq.com**

When reporting a problem, please include your Obsidian version, plugin version, and a screenshot or a short description of the expected result.

---

## License

[MIT](LICENSE) — originally by Daisuke ITO; maintained as Nextcloud sync YANC by yanqingwang.

---

## 中文

Obsidian 与 Nextcloud 之间的双向同步插件，**专门为 Nextcloud 打造**，而不只是一个通用 WebDAV 客户端。

多数「WebDAV 同步」插件只把服务器当成一个文件仓库：比较修改时间、复制文件，然后祈祷不出问题。本插件会调用 Nextcloud 自己的 API（Capabilities、文件 ID、校验和、版本、锁定、Login Flow v2），让同步更安全、更快、更省心；当服务器不支持这些能力时，会自动降级为标准 WebDAV 同步。

> 本插件是独立项目，最初基于 Daisuke ITO 的 [obsidian-nextcloudsync](https://github.com/siosig/obsidian-nextcloudsync)（MIT）。自 1.2.2 起独立发展，插件 id 为 `nextcloud-sync-yanc`。**如果你在 1.1.1 之前安装过旧 id `nextcloud-sync` 的版本，请先卸载旧版**，否则两份插件会争抢同一个目录。

### 1.2.3 修复

- **「从远端镜像」不会再误删远端存在的空文件夹**：计划阶段现在会同时拉取远端目录列表，本地缺失的文件夹（含空文件夹）按层级由浅到深创建，远端仍存在的本地文件夹一律保留。
- **本地删除失败不再被计为已删除**：删除结果区分为已删除 / 本就不存在 / 已忽略 / 失败；失败的条目会保留追踪，避免下次同步把残留文件当作新文件重新上传，同时镜像结束前会保存收敛后的同步状态。

### 主要功能

**核心同步**
- 基于内容哈希的增量同步，只传输发生变化的文件。
- 原子写入：中途中断的下载不会在库里留下半截文件或 0 字节文件。
- 通过 Nextcloud 文件 ID 跟踪重命名/移动，移动笔记不会让所有设备重新上传。
- 远端删除走 Nextcloud 回收站（可恢复）；本地删除遵循 Obsidian 自己的「删除文件」设置。
- 每个库独立配置，多库之间状态互不干扰。
- 排除规则：排除文件夹、排除文件类型（如 `js, exe, *.dmg`）、仅在指定文件夹同步、按下划线前缀排除（默认关闭）。
- 按需同步附件：配置的附件目录只建立索引，打开引用它的笔记时才下载。
- 定时自动同步、手动「立即同步」，以及可选的「文件变更时同步」（仅桌面端）。
- 「同步状态」对话框支持按状态过滤；任意文件可右键「与远端比较」，并直接推送或拉取。
- 「从远端镜像」：把本机库强制对齐远端（下载远端全部内容，删除远端没有的本地文件/文件夹，删除走 Obsidian 回收站）。执行前会显示数量确认。
- 每设备独立日志、重置本地索引等维护工具。

**冲突安全（不丢内容）**
- 按扩展名区分「可自动合并文件」与「其他文件」，各自选择冲突策略。
- 默认对文本使用 diff3 合并（不同区域的编辑会合并，包括 YAML frontmatter）；无法合并的文本写入冲突标记，非文本文件绝不写入标记。
- 其他文件可选「较新者优先」「较大者优先」「本地优先」「远端优先」；状态栏显示未解决的冲突数。
- 每次上传都带 `If-Match` 前置条件：别处改过的远端文件会变成冲突，而不是被静默覆盖。

**Nextcloud 增强**
- Login Flow v2 浏览器授权登录；凭据存放在 Obsidian 密钥库，不以明文写入 `data.json`。
- 服务器版本历史：可在 Obsidian 内浏览并恢复任意历史版本。
- 大文件分块上传（可续传、校验和验证），并设有双向的最大文件大小上限。
- 维护模式检测、Nextcloud 错误信息解析、能力探测（渐进增强）。

### 移动端（iOS / Android）

- 移动端默认关闭自动同步（系统会挂起后台定时器），改用「启动时同步」「回到应用时同步」和手动「立即同步」。
- 大文件在上下行两个方向都会按上限跳过，避免内存不足崩溃。
- 移动端没有状态栏，同步结果以通知展示。
- 移动端不显示 ribbon 栏：两个操作都能在导航栏「打开菜单」中找到；也可以把「立即同步」「同步状态」「从远端镜像」固定到移动工具栏。

### 系统要求

- **Obsidian** `1.13.0` 或更高版本；支持桌面端（Electron）与移动端（iOS / Android）。
- 推荐 **Nextcloud** Hub 26（server `33`）或更高版本；更老的 Nextcloud 仍可连接并同步，但部分能力会降级。标准 WebDAV 服务器可回退到核心同步。
- 一个 Nextcloud 账号，可用 **Login Flow v2** 登录，或使用手动创建的应用密码（不要使用主密码）。

### 安装

#### 从第三方插件市场安装

在 **设置 → 第三方插件 → 浏览** 中搜索 **Nextcloud sync YANC**。

#### 手动安装

1. 从 [Releases](https://github.com/yanqingwang/obsidian-nextcloud-sync-yanc/releases) 下载所需版本的 `main.js`、`manifest.json`、`styles.css`。
2. 放入 `<你的库>/.obsidian/plugins/nextcloud-sync-yanc/`。文件夹名必须是 `nextcloud-sync-yanc`（即 manifest 的 `id`），否则 Obsidian 不会加载。
3. 重新加载 Obsidian，在 **设置 → 第三方插件** 中启用 **Nextcloud sync YANC**。

Android 没有「从 zip 安装」，用文件管理器或同步客户端把三个文件放入上述目录后重启 Obsidian 即可。

#### 通过 BRAT 自动更新

安装 [BRAT](https://github.com/TomBraun/obsidian-brat)，把仓库 `yanqingwang/obsidian-nextcloud-sync-yanc` 添加为 beta 插件。

### 使用

1. 打开 **设置 → Nextcloud Sync**。
2. 填写 **服务器地址**：完整的 WebDAV 端点 `https://<主机>/remote.php/dav/files/<用户名>/`，**不能只填主机名**（只填 `https://cloud.example.com` 会报 HTTP 405）。可以追加子文件夹，把同步范围限制在某个目录。
3. 登录：推荐 **浏览器登录**（Login Flow v2）；或填写用户名 + 手动创建的应用密码。
4. 按需调整同步间隔、文件变更时同步、自动合并设置。
5. 执行 **立即同步**，或等待定时同步。首次会做全量扫描，之后为增量同步。

库会被同步到 Nextcloud 上以库名命名的文件夹。

#### 添加第二台设备

1. 在新设备上**新建一个空库**，名称与第一台**完全一致**（包括大小写）。
2. 安装并启用插件，填写**相同的服务器地址**并登录。
3. 执行 **立即同步**，首次会把远端内容下载下来。

可在 **设置 → Nextcloud Sync** 的 **同步目标（WebDAV）** 只读行核对两台设备是否指向同一位置。请先备份新设备上已有的内容。

### 常见问题

**能否用受限的公开链接分享代替完整账号的应用密码？**

可以。在 Nextcloud 上把单个目录创建为**带用户名/密码的公开链接分享**，然后：

- **服务器地址**：`https://<主机>/public.php/webdav/`
- **用户名**：分享令牌（分享链接 `/s/` 之后的部分）
- **应用密码**：该分享的密码

点击 **关联…** 保存应用密码时填写的「ID」只是 Obsidian 本地密钥库中的键名，永远不会发给服务器，可以随意填写（如 `default`）；真正的分享密码填在「值」里。

**出现 `HTTP 423` 是什么原因？**

423 表示文件在 Nextcloud **服务器端**被锁定，不是插件加的锁。常见原因是 Nextcloud Text 网页编辑器留下的锁（没有超时，异常关闭标签页后可能一直存在），也可能是别人正在编辑同一文件。插件不会自动解锁（盲目解锁可能覆盖他人正在进行的编辑）：请关闭持有锁的会话，或让管理员清理。

### 设置默认值

设置页刻意保持精简：只显示服务器地址、登录、同步文件夹、同步间隔、仅 Wi-Fi、排除文件夹、配置文件夹开关和日志开关，其余选项为固定值或按平台自动推导。

| 设置 | 桌面端 | 移动端 |
|---|---|---|
| 同步间隔 | 15 分钟 | 15 分钟（禁用，用「立即同步」或「启动时同步」） |
| 仅 Wi-Fi 同步 | 关 | 开 |
| 同步配置文件夹 | 关 | 关 |
| 可自动合并的文件类型 | md, txt, cpp, py, c, h, hpp, rs, go, ts, js, java, sh | 同上 |
| 可自动合并文件策略 | 合并 | 合并 |
| 其他文件策略 | 较新者优先 | 较新者优先 |
| 启用日志 | 关 | 关 |

固定值：网络超时 30 秒、分块阈值 50 MB（桌面）/ 20 MB（移动）、分块上传开启；丢失更新保护由 `If-Match` 提供，不使用文件锁定。

按平台推导：文件变更时同步（桌面开 / 移动关）、最大文件大小（桌面不限 / 移动 20 MB）、网络并发（按可用内存自动推导，约 16 / 8 / 4 / 3）。

### 隐私与安全

- 不收集任何遥测数据；唯一的网络流量就是与你自己服务器之间的同步。
- 凭据存放在 Obsidian 的密钥库，不会以明文写入 `data.json`；从不使用也不存储主密码。
- `.obsidian/` 默认不同步；社区插件目录与插件自己的同步状态库**永远不同步**。

### 开发

```bash
npm install
npm run dev    # 监听并重新构建 main.js
npm run build  # 类型检查并生成生产构建
npm test       # 快速纯逻辑测试
```

发布资源为 `main.js`、`manifest.json` 和 `styles.css`。

### 反馈

- GitHub Issues：<https://github.com/yanqingwang/obsidian-nextcloud-sync-yanc/issues>
- 邮箱：**289631530@qq.com**

反馈问题时，请尽量附上 Obsidian 版本、插件版本，以及截图或预期结果说明。

### 许可证

[MIT](LICENSE) —— 原始作者 Daisuke ITO，现以 Nextcloud sync YANC 分支由 yanqingwang 维护。

---

[English](#english) | [中文](#中文)
