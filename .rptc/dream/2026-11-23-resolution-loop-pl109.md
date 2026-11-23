# Resolution of review loop-pl109

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: .claude/skills/rptc-hygiene-scan/scan.sh

4 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | medium | Correctness: the backlog evidence line raises StopIteration when an item's banner is `**Status**: complete` with no ✅/❌/shipped/landed/implemented/retired in its first 12 lines, which stops the python run and loses all later DECLARES DONE lines and section 3's backlog control line. | PROPOSE FIX | Fixed: the evidence line is printed only when one matches, as the grep it replaced printed none. Planted a backlog item whose banner is '> **Status**: Complete': it is reported DECLARES DONE, the section's control line still prints, and stderr is empty. |
| F2 | medium | Correctness: section 6 looks items up by os.path.join(rptc,'backlog',name), but git log --name-only prints repo-root-relative paths, so an absolute or ./-prefixed RPTC_DIR matches nothing and the section reports CHECK BROKEN where the old per-file git log worked. | PROPOSE FIX | Fixed: git runs from inside the backlog folder and each name has the folder's own prefix (git rev-parse --show-prefix) taken off, so items are keyed by their own names. Section 6 is identical for the default, an absolute path and ./.rptc. --relative was tried first and dropped: with --cc it stopped listing the merge that last touched one item. |
| F3 | low | Correctness: the git log output is read with default core.quotePath, so a backlog filename with non-ASCII characters comes back quoted, never matches its key, and silently drops out of section 6. | PROPOSE FIX | Fixed: the folder log runs with -c core.quotePath=false. |
| F4 | low | Fit: the header says the script has four labelled sections but it prints seven; this was there before the change. | PROPOSE FIX | Fixed: the header lists all seven sections and says why each reads its files in one process. SKILL.md's 'Six sections' is outside this change's scope and left as found. |
