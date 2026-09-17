# QPM 0.34.5 — Library cleanup and SSH Device Manager

## Scope

This maintenance pass removes dormant routes and persisted content belonging to retired internal/proprietary catalogs without reintroducing those identifiers into the clean source tree. QPM's curated pack perimeter stays unchanged.

## Global pack migration

At extension activation, `QpmLibraryPackService` scans the QPM global `packs` directory before integrated packs are installed/upgraded. A dedicated obsolete pack is deleted. In a mixed user pack, only matching environments/libraries are removed and unrelated user content is preserved. Stale backup JSON files containing retired integrated content are deleted as well.

The migration recognizes historical identifiers through encoded marker parts. This allows one-way cleanup of existing installations while keeping the retired names out of QPM source, generated runtime and documentation.

## Embedded JC Lib level

- compatibility level: **0.8.38**
- C pack: **2.2.0**
- QPM-only Preprocessor pack: unchanged
- packs outside the curated QPM perimeter: not reintroduced

## SSH Device Manager

Command: `qpm.openSshDeviceManager`

Entry points:

- Command Palette;
- Platforms view title;
- Platforms tree action.

The webview can:

- list/edit simple OpenSSH `Host` aliases;
- show local hosts-file aliases;
- inspect the local ARP/neighbour cache;
- connect with `ssh`;
- inspect `ssh -G`;
- test key-only authentication;
- choose an identity file;
- generate an Ed25519 key pair;
- enroll a selected public key after confirmation.

Wildcard/multi-host blocks remain read-only. Private-key files stay on disk and are never stored in QPM global storage.

## Validation

- TypeScript compilation: pass
- generated JavaScript syntax: pass
- global-storage migration regression: pass
- SSH command contribution/registration: pass
- curated JC Lib hierarchy regression: pass
- embedded JC Lib parameterized-generation regression: pass
- semantic source/data/docs audit for retired catalog identifiers: pass
