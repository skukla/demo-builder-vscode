---
id: EDS-7
kind: fix
area: eds
needs: []
value: low
status: backlog
---
# The two EDS service cards are one shell rendered twice

## Provenance

Found by the 2026-08-25 codebase sweep
(`.rptc/research/codebase-sweep-2026-08-25/sweep.md`), and it is the only real
extraction candidate that sweep produced. **Two independent scans point at the
same pair**, which is what lifts it above the usual noise:

- **jscpd**: `DaLiveServiceCard.tsx [71:8-85:12]` ↔ `GitHubServiceCard.tsx [62:2-76:5]`
  (14 lines), and `DaLiveServiceCard.tsx [239:8-252:2]` ↔
  `GitHubServiceCard.tsx [123:16-136:8]` (13 lines).
- **component-extraction**: both files appear in the `status-text` group.

Both files were opened and read. This is a verdict, not a scan hit.

## What is duplicated

The same service-card state machine, written twice:

| State | Both cards render |
|---|---|
| connected | `CheckmarkCircle` + `status-text`, with a `compact` variant that drops the detail line |
| error | `Alert` + `status-text-error`, plus a "Try Again" button |
| otherwise | a `service-action-button` |

Everything that differs is a **label or a callback**: `verifiedOrg` vs
`user.login`, `onSetup` vs `onConnect`, "Connect DA.live" vs "Connect GitHub",
and DA.live's extra `setupComplete` wording.

## Why it is worth fixing eventually

A fix to one card's error state does not reach the other. That is the shape this
repo has already been bitten by, and the reason the extract-at-two override
exists: *if the same behaviour has already been FIXED separately on two surfaces,
that is demonstrated drift and it extracts at two.*

Note that has NOT happened yet here — no divergent fix is on record. So this is
the Rule of Three case, not the override, and it is genuinely fine to leave.

## Why it was not fixed when found

It is in `features/eds/ui/components/`, which the work that ran the sweep
(Evaluation Mode) never opened. Chasing it would be scope creep. Both cards work;
the cost is a future edit, not a user.

## The right moment

**The next time anyone edits either card.** That is when extraction is cheap —
the file is already open, its behaviour is already in the reader's head, and the
consumer tests are already being run. Doing it cold means re-deriving all three
for no user-visible gain.

Sized for that moment: one shared component taking `{state, label, detail,
actionLabel, onAction, compact}`, two call sites, and the existing suites for
both cards should pass UNCHANGED — a behaviour-preserving refactor proves itself
by not moving its tests (the `ServiceGroupList` → `ConfigSection` precedent: 78
tests, zero edits).

## Kickoff prompt

```
/rptc:fix "Extract the shared service-card shell behind DaLiveServiceCard and GitHubServiceCard.
Read .rptc/backlog/2026-08-25-eds-service-cards-are-one-shell.md first — it has the exact
line ranges and what differs. Both cards' existing test suites must pass unchanged; if they
need editing, the refactor changed behaviour and that is the bug."
```
