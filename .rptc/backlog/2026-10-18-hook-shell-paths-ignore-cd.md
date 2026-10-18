---
id: PL-83
kind: fix
area: platform
needs: []
value: low
status: backlog
---

# The hooks resolve a shell edit's path against the wrong folder when the command starts with `cd`

The PreToolUse router re-runs the path rules for files a Bash command writes
(`.claude/hooks/router.sh`, the block after "THEN THE SHELL WRITES"). It joins each
path `writtenPaths.py` extracts to the router's own working directory:

```bash
evaluate "$synth" "$CMD" "$PWD/$written" "$CONTENT" || exit 2
```

`$PWD` is the folder the session started in. A command that begins
`cd <worktree> && python3 - <<'EOF' … open('src/…')` writes a file in the worktree,
but the rule is evaluated against the same relative path in the session's folder.
`writtenPaths.py` has no notion of `cd`.

## Seen 2026-10-18

Session started in the main checkout (`demo-builder-vscode/`, branch
`loop/2026-09-30-erp-programme`); work happened in the
`demo-builder-vscode.worktrees/feature/erp-integration` worktree. An edit to
`src/features/updates/services/templateSyncService.ts` through a heredoc'd python
drew rule 49's notice: "This file is 426 lines, over the 400-line limit". The
worktree's file was 293 lines; the MAIN checkout's copy, on another branch, is the
426-line one. The notice led to a split being asked for and then abandoned once the
file was measured.

## What it costs

Every path-keyed rule (god-file, the skill routers, css-baseline, reuse-first) can
fire on the wrong file or stay silent on the right one, for any shell edit made
inside a worktree from a session rooted elsewhere. The unattended loop and the
worktree-setup skill both make that the normal case.

## Fix, roughly

Have `writtenPaths.py` track a leading `cd <dir>` (and `cd <dir> &&` chains) and emit
absolute paths; have the router use an absolute path as given and join only relative
ones. Prove it in `writtenPaths.proof.sh` with a `cd`-prefixed command whose relative
path exists in both folders at different sizes.

## Shipped so far

- 2026-10-18  docs(backlog): EDS-53 built; PL-83 records the hooks resolving shell paths in the wrong folder (`a93155cb4`)
