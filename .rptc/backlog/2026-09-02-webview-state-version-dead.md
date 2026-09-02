---
id: PL-37
kind: chore
area: platform
value: low
status: backlog
needs: []
---

# The webview handshake's `stateVersion` is write-only

`WebviewCommunicationManager` keeps a `stateVersion` counter, ships it in the
`__handshake_complete__` payload, and exposes `incrementStateVersion()` and
`getStateVersion()`. Nothing reads any of it.

Measured 2026-09-02 with a positive control (a term known present returned 203
hits, so the search worked): `stateVersion` appears **four times in `src/`, all
inside the manager itself** — the private field, the payload line, the
increment, and the getter. No caller anywhere.

`WebviewClient.ts` handles `__handshake_complete__` and does not read the
payload's `stateVersion`.

## How it surfaced

The clone-ledger probe. Replacing the payload line with a literal `0` left both
communication suites green — which is correct, because no behaviour depends on
it. A survived mutation on a field nothing reads is the signature of dead code,
not of a missing test.

## What to do

Delete the field, the payload entry, and both methods, per the repo's rule that
obsolete things are removed rather than left accepted-but-ignored.

Two things to check first, which is why this is filed rather than done in a
test-cleanup pass:

- **Test doubles reference it.** Several suites' communication fakes include
  `incrementStateVersion` and `getStateVersion`; those go with it.
- **It crosses a boundary.** The payload shape is part of the handshake
  contract, so removing a field means confirming no webview build in the wild
  reads it — the extension and webviews ship together, so this should be safe,
  but it deserves the check rather than the assumption.

Filed rather than fixed because it is production code reached from a test loop,
and deleting a protocol field is not a de-duplication.
