# Step 04: one rule for "is this still as we left it?"

Status: **to do**, first piece of the capture work (owner, 2026-10-27).

It is already written twice: `generatedFileWriter.ts` (ADR-013, files in a project) and
`ownedPages.ts` (DA.live category pages, hashed from a read after the write). Commerce objects are
the third, so the rule becomes one pure function in `src/core/utils/` (owner, 2026-10-27; four
features use it): given what was recorded, what is there now and what is wanted, answer create,
update, leave (changed by someone else), remove, or leave (not provably ours).

- The rule only answers "still as we left it, or changed?". Each caller decides what to do with a
  change (step 05, "What an SC sees"): the ERP restores and reports; packs and setup-guide fixes
  keep it and report.
- Each caller keeps its own read and write.
- The two existing copies move onto it with **their tests unchanged**, which is the proof nothing
  moved.
- The sha-256 helper, written three times (`generatedFileWriter.ts`, `ownedPages.ts`,
  `envFileWatcherService.ts`), becomes one.
