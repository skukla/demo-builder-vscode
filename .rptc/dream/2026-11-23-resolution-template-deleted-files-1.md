# Resolution of review template-deleted-files-1

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: src/features/updates/services/templateMergeBase.ts, tests/features/updates/services/templateMergeBase.test.ts, tests/features/updates/services/templateSyncService-plumbing.test.ts, tests/features/updates/services/templateSyncService.testUtils.ts

4 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | medium | Correctness: planDeletions lists deletions with no pathspec, so a deletion of a preserved or never-applied file the storefront changed now stops the update. | PROPOSE FIX | Fixed: pathspecFor() builds one exclude pathspec, used by the deletion listing and the patch; a real-git test shows a template deleting a changed fstab.yaml no longer stops the update. |
| F2 | medium | Correctness: a deletion clash is returned as an ordinary conflict, so the SC is offered Fix with AI, which always fails for it, and the message never says the template deletes the file. | PROPOSE FIX | Fixed: a deleted-and-edited file is a plain failure, not a clash, so Fix with AI is not offered; the line says the template deletes the file and to keep or delete it by hand, then update again. |
| F3 | medium | Correctness: file names from the template are interpolated into double-quoted shell commands without the break-out guard. | PROPOSE FIX | Fixed: names matching the house guard stop the update and are never put in a command; names listed with core.quotePath=false. A real-git test with a $(touch ...) name proves nothing runs, and fails with the guard planted out. |
| F4 | low | Correctness: the local-copy branch has no test. | PROPOSE FIX | Fixed: a real-git test drives applyChangeKeepingConflicts and shows the Universal Editor file kept and the rest applied. |
