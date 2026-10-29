# Step 04: one rule for "is this still as we left it?"

Status: **done** 2026-10-29, not yet committed. First piece of the capture work (owner, 2026-10-27).

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

## What was built (2026-10-29)

- **The rule:** `decideOwnedChange({ recorded, current, wanted })` in
  `src/core/utils/ownedChange.ts`. The three are fingerprints (any string; `undefined` means no
  record, nothing there, or wanted gone). It answers one of seven: the five above
  (`create`, `update`, `leave-edited`, `remove`, `leave-not-ours`) plus the two "nothing to do"
  answers the callers already had: `unchanged` (still as we left it and already what is wanted;
  ADR-013 skips the disk write) and `gone` (nothing there and nothing wanted). Order: nothing
  there decides first, then no record, then a moved fingerprint, then what is wanted. Tests:
  `tests/core/utils/ownedChange.test.ts`.
- **The hash:** `sha256(text)` in `src/core/utils/sha256.ts`, utf-8, lowercase hex, the same
  digest every recorded hash was made with. Tests: `tests/core/utils/sha256.test.ts`.
- **Moved onto the rule:** `generatedFileWriter.ts` (`write` and `remove`; its two policies stay
  in the file: a write treats `leave-not-ours` as unmodified once, and a removal passes today's
  template as the proof when there is no record), `ownedPages.ts` (`removeOwnedPage`), and
  `categoryTemplate.ts` (`ensureCategoryTemplate`, the create side of the same pages; it keeps an
  existing template on `update`, because the record is hashed from a read after the write).
  Their suites ran with no edits: 59 suites, 935 tests before and after.
- **Moved onto the hash:** the three named, plus a fourth the plan missed,
  `aiSetupVerifier.ts`, which hashes the same AI-bundle files against the same `aiFileHashes`.
- **Left on purpose:** `authoredCategoryPages.ts` and `catalogMenuService.ts` compare one page's
  hash with its record (an equality, not the decision); `mcpSocketPath.ts` and
  `toolTraceRecorder.ts` hash names into short ids, not content.
- The two mutation-ledger rows for `generatedFileWriter.ts` named code that is gone, so they were
  removed (`scripts/mutation-equivalents.ledger.json`).

**For step 05:** a thing that was recorded and has since been deleted answers `create`, as
ADR-013 always did. If a pack install should treat an SC's deletion in the Admin as an edit, the
caller checks `recorded !== undefined` on a `create` itself. An edit that happens to equal what is
now wanted still answers `leave-edited`.
