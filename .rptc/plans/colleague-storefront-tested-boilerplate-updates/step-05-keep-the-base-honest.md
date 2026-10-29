# Step 05: keep the base honest

## What

The base must describe the code actually in the repository, or the next update replays a
change already applied.

| Event | `boilerplateBase.commit` |
|---|---|
| Reset | back to `project.demo.builtWith.lkg` (Reset returns the code to the colleague's head) |
| Change demo source | recomputed from the new source's `builtWith`, or removed |
| Save as demo package | written into the new package's `builtWith.lkg`, so the next colleague inherits the current base |
| The colleague's track brings in their own boilerplate update | D4: re-read, else leave |

## D4 (approved 2026-10-20: A where the file records a base, else B)

When the colleague updates their own storefront to a newer boilerplate and the SC takes
"Changes from …", the SC's code moves to a newer Adobe base without our record moving.

Options:

- **A. Re-read the base from the colleague's repository after each colleague-track update**,
  if their repository carries its description file with `builtWith`. Exact, but only works
  when the colleague's repository records it. Needs a check of where a v2 description file
  lives (in the repository, or only in the exported file).
- **B. Leave the base, and let the 3-way apply absorb the replay.** Adobe's change applied
  twice mostly applies cleanly or reports a conflict. Never silent damage, but noisy.
- **C. Hide the Adobe row after a colleague-track update until the SC resets.**
  Safe and simple, loses the feature where it matters.

Recommended: **A where the description file is in the repository, else B.** Owner,
2026-10-20: agreed, with a check of where the file lives.

### The check (2026-10-20)

- **It is in the repository.** "Save as demo package" commits `demo.demo-builder.json` to the
  root of the saver's storefront repository (`SHARED_DEMO_FILE_NAME`, `src/types/projectFile.ts`;
  written by `writeSharedDemoFile`, `demoPackage/sharedDemoFile.ts`), and Add reads it from
  there (`sharedDemoProbe.ts` `description()`). So A reads it at the commit the SC just took.
- **Its base moves only when the colleague saves again.** `builtWith.lkg` is filled at save
  time: for a shipped brand from the project's `lastSyncedCommit` (`demoPackageService.ts`
  `fromCatalog`), for a project built from an added demo from the record it was created with
  (`builtWithOf`). Nothing rewrites the file when the colleague takes an update. A colleague who
  updates and does not re-save leaves a stale base in the file, which is B's case: the replay
  goes through the 3-way apply and either applies cleanly or stops naming the files.
- **So the rule:** after a colleague-track apply, read the file at the new head; if its
  `builtWith.template` matches ours and its `lkg` is a commit of that template newer than the
  recorded base, take it; otherwise leave the base (B). Never move the base backwards.
- **Follow-up, not in this item:** the save path should write `boilerplateBase.commit` (once
  step 01 exists) rather than the creation record, which the table above already says for
  "Save as demo package". A colleague's file then stays exact for as long as they re-save.

## Tests

One per row of the table, asserting the recorded commit after each event.
