# Resolution of review template-deleted-files-windows

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: src/features/updates/services/templateMergeBase.ts, src/features/updates/services/clashAttribution.ts, tests/features/updates/services/clashAttribution.test.ts

2 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | low | Fit: the comment above the guard still names only quote break-out, but the guard now also refuses names cmd.exe would expand inside the quotes (%NAME%, !NAME!). | PROPOSE FIX | Fixed: the comment now says a name either shell would read as more than a name inside double quotes is not read, and points to safeInQuotes. The safeInQuotes comment also now says `!` expands only with delayed expansion on, per the reviewer's context note. |
| F2 | low | Correctness: no test covers the CR/LF part of safeInQuotes, and the cmd.exe characters are tested only through whoseEdits, so dropping \r\n from the pattern would pass the suite. | PROPOSE FIX | Fixed: the it.each now also sends 'a\nb.js', so dropping the line-break characters from the pattern fails the suite. |
