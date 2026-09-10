---
id: PL-36
kind: fix
area: prerequisites
value: med
status: backlog
needs: []
---

# The third Node-version sort in installHandler is untested

`installHandler.ts` sorts Node versions numerically in three places. Two have
tests, added by the mutation work on 2026-09-01. The third does not:

```ts
const targetVersions = installableVersions.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
```

Replacing it with a bare `.sort()` leaves all eleven installHandler suites green
(measured 2026-09-02 by the clone-ledger probe).

## Why it matters

This is the same defect the second sort's test exists to prevent, one line
further down. As text, `'8'` sorts after `'20'`. `targetVersions` is handed to
`executeInstallSteps`, which runs the install steps in that order — and the
repo's own note on the sibling sort records that **the last version installed is
the one made the system default**. A text sort therefore leaves the wrong Node
as default, silently.

## Why it is filed rather than fixed

An attempt to cover it from `installHandler-nodeVersions.test.ts` failed on a
wrong assumption: `targetVersions` does NOT reach `getInstallSteps` — that call
receives the REQUIRED versions. It reaches `executeInstallSteps`, so the
observable is which install commands run, per version, in what order.

Writing the test therefore means either asserting the command sequence, or
reaching `resolveTargetVersions` directly. Both are reasonable; neither is a
two-line addition, and guessing at it once already produced a failing test.

The path also needs `getInstalledNodeVersions` mocked, which only
`installHandler-plugins.test.ts` currently does — so the test may belong there
rather than in the nodeVersions suite.
