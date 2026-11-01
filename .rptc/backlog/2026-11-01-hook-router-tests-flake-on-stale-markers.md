---
id: PL-86
kind: fix
area: platform
needs: []
value: med
status: active
---

# The hook router's tests flake: old once-per-session markers survive and collide

<!-- Do NOT template this body. Items vary because the work varies; the
     provenance, the measurements and the caveats are what make an item useful
     months later. The frontmatter carries the structure so the prose need not. -->

Filed 2026-11-01 (the owner: "yes and fix"), after a docs-only push was refused on four
`tests/hooks/router.test.ts` cases (reuse-first, webview-test, two adobe-docs) that had passed a
minute earlier and passed again on retry.

**Cause, verified.** A once-per-session rule drops a marker at
`${TMPDIR}/.dbv-<rule>-<session>` and stays quiet once it exists (`.claude/hooks/router.sh:194-198`).
The suite names each test's session `router-test-<pid>-<n>` and shares the real TMPDIR, and nothing
deletes the markers. Process ids are reused, so a later run with the same pid and counter finds a
marker an old run left and the rule "does not fire". Measured on the owner's machine: 4,439
leftover `router-test` markers (21,842 hook markers in all).

**Fix.** The suite runs the router with a private TMPDIR made for the run and removed after it,
so no marker from any other run can be seen; a control plants one in the real TMPDIR and asserts
the rule still fires. The 25 rule proofs (`.claude/hooks/rules/*.proof.sh`) and the written-paths
probe now make their own temp folder the same way and remove it on exit, so a hand-run proof
leaves nothing behind either. Measured after: a full `tests/hooks` run creates no marker in the
shared temp folder (a deliberately planted one is found by the same count), and the 4,439 stale
test markers were deleted.

## Shipped so far

- 2026-10-31  fix(test): the hook router's tests no longer flake on markers old runs left (`92000b0ee`)
- 2026-10-31  fix(hooks): every rule proof and the probe keep their markers to themselves (`175976d61`)
