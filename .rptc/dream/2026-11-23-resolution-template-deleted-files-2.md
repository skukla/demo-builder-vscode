# Resolution of review template-deleted-files-2

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: src/features/updates/services/templateMergeBase.ts, tests/features/updates/services/templateMergeBase.test.ts, tests/features/updates/services/templateSyncService-plumbing.test.ts, tests/features/updates/services/templateSyncService.testUtils.ts

4 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | medium | Correctness: the stop message offers 'Keep or delete them by hand', but keeping the edited file can never get the update through. | PROPOSE FIX | Fixed: the line says to delete the file (saving a copy first) or put it back as the template had it, then update again; the test pins it. |
| F2 | low | Correctness: a template-deleted file with an unsafe name blocks every future update even after deletion, and the message wrongly says the storefront changed it. | PROPOSE FIX | Fixed more simply: every template file name now goes into a command single-quoted (shellWord), so no name can expand and none needs a special branch; presence is read from ls-files -z with no name in a command. Tests: a changed $(...)-named file stops naming it (fails with the old quoting planted back), and once removed it is skipped and the update succeeds. |
| F3 | low | Correctness: the 'no command ran' check looks in the wrong folder and can never fail. | PROPOSE FIX | Fixed: the misleading marker check is gone; the remaining assertion is the one that fails when the quoting is broken. |
| F4 | low | Correctness: skipped names go into :(exclude) patterns where *, ? and [ act as wildcards. | PROPOSE FIX | Fixed: skipped names are excluded as :(exclude,literal), single-quoted. |
