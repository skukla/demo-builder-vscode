# Resolution of review template-deleted-files

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: src/features/updates/services/templateMergeBase.ts, tests/features/updates/services/templateMergeBase.test.ts, tests/features/updates/services/templateSyncService-plumbing.test.ts, tests/features/updates/services/templateSyncService.testUtils.ts

4 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | medium | Request: the unsafe-name stop tells the SC to delete or rename the file on GitHub, but neither can ever let the update through, because the unsafe check at line 112 runs before the storefront-has-file check and the recorded base does not move, so only a reset works. | PROPOSE FIX | Fixed: the unsafe-name message now offers only a reset ('Reset the storefront to take this update'), with a comment saying why; both unsafe-name tests pin the new text. |
| F2 | low | Correctness: the unsafe-name message always says 'Delete it' even when several unsafe names are listed, unlike the clash message's it/them switch. | PROPOSE FIX | Fixed: the unsafe message no longer says 'Delete it'; 'whose name' switches to 'whose names' for several files. |
| F3 | low | Correctness: no test protects the literal-exclude behaviour for skipped names with glob characters, the ls-files and -z diff-tree failure throws, or the plural clash message. | PROPOSE FIX | Added a real-git test with a removed file named '?.txt': the update succeeds and the template's change to A.txt still lands. Control: with `literal` removed the test fails (1 failed). The ls-files and listing failure throws and the plural clash wording stay untested; they are one-line branches beside tested siblings. |
| F4 | low | Fit: new lines exceed the 100-character line limit in the global guidelines, though older lines in the same file already do and the repo eslint does not enforce it. | PROPOSE FIX | Wrapped the constant (line 55) and the stop messages. The other new long lines (the pathspec, listing and compare lines, 101-115 chars) follow the file's existing habit, which eslint does not enforce, and are left. |
