---
id: PL-56b
kind: chore
area: platform
parent: PL-56
needs: [PL-56d]
value: low
status: gated
---

# Portability: delete what is already dead

Filed 2026-09-11 from `.rptc/research/project-import-export/research.md` ("Dead"). Runs
first and alone; nothing waits on it, and nothing here is soft-deprecated afterwards.

- `ImportResult` (was in `src/types/settingsFile.ts`): zero references. Deleted in `6817f5486`.
- `SettingsFile.additionalConsoleApis`: typed and read, never written by any producer; the
  manifest write was retired 2026-08-23. The read fallback in `useWizardState.ts:228` goes
  with it once no v1 file can carry it (check the migration in [[PL-56a]] first).
- `installedBlockLibraries` on the export: emitted, never persisted, never read back
  (in-memory only). Two tests pin the emission; they go too.
- NOT dead: `sourceDescription`, plumbed through four files to one debug line. [[PL-56d]]'s
  import banner is its first real consumer; leave it.

## Shipped so far

- 2026-10-03  Done 2026-10-03 in part: ImportResult deleted, installedBlockLibraries no longer exported or typed on SettingsFile (two emission tests replaced by one asserting absence); additionalConsoleApis STAYS — the compiler shows the v1 reader and the wizard's edit/import fallback still read it, and import-from-file still hands v1 files straight to the wizard (readProjectFile has no production caller yet).
- 2026-10-03  Reconciled 2026-10-03 (second pass): 6817f5486 deleted ImportResult and installedBlockLibraries; additionalConsoleApis stays while the version-1 reader still reads it, so the rest waits on PL-56d.
- 2026-10-03  Remainder 2026-10-03, uncommitted on loop/2026-10-03-night2-a: the wizard's additionalConsoleApis fallback is deleted (integrationStateFromSettings reads componentApiPicks only; a v1 file's flat list is folded on read). additionalConsoleApis STAYS on SettingsFile, now documented as the read-only version-1 type, because the migration reads it to keep v1 picks. SETTINGS_FILE_VERSION, parseSettingsFile, isValidSettingsFile, isNewerVersion deleted.
- 2026-10-03  docs(backlog): PL-56b cites a deleted type by name, not a dead line (`e5f0bd434`)
