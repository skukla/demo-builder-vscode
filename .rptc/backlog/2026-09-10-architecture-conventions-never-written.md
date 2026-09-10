---
id: PL-55
kind: chore
area: platform
needs: []
value: high
status: backlog
parent: PL-30
---

# Two architectural domains have no convention at all — one of them is a non-negotiable

Owner, 2026-09-10: *"I thought our original architecture program had architectural
conventions that we hadn't even started."* Checked, and that is right.

## What is missing

The handbook states **109 conventions, all 109 enforced**, which reads as complete.
It is not complete — it is complete *for the domains it covers*. Counted by section:

```
  39  §7  the user interface
  29  §9  tests
  13  §10 what stops this drifting
  10  §3  code gets what it needs handed to it
   4  §2  code grouped by what it does      4  §8  agents are a second door
   3  §4  behaviour is data                 3  §6  the two halves talk by message
   2  §1  two programs                      2  §5  what survives between calls
```

Sixty-eight of the 109 are UI and tests — the two tracks that actually ran. The
architecture half of track 4 produced seven ADRs and roughly 28 conventions, and two
domains got none:

### 1. Reversibility — ZERO, and it is non-negotiable #1

`CLAUDE.md` states it first, in the section listing what this extension never
compromises on:

> **Whatever can be done can be undone.** New capabilities ship with their reversal —
> create↔delete, deploy↔undeploy, install↔uninstall — or they state plainly why
> reversal is impossible. **A thing that cannot be undone is a finding.**

There is no handbook convention for it and nothing checks it. The single
reversibility-adjacent convention that exists is about something else: it requires an
agent tool to take `confirm: true` when its effect is hard to walk back — that GATES
an irreversible action rather than requiring the reversal to exist.

So the rule most loudly stated in the file loaded into every session is the one with
no enforcement, while `!important` in a stylesheet has three.

[[PL-52]]-adjacent in spirit: the reversibility goal is also recorded in the memory
file `project_idempotency_goal.md` — "SC activities must be reversible; journeys
round-trip to zero". Two statements of the same principle, neither of them a rule.

### 2. Error handling — ZERO

The global SOP names it: domain-specific error types, granular catches,
`finally`/`using`/`defer` for cleanup. `src/core/errors/` exists and holds the domain
error classes. No convention states any of it, and `error type`, `domain error`,
`granular catch` and `error class` return **zero** lines from both the handbook and
the generated conventions index.

Checked with two positive controls — cascade layers (17 handbook lines) and
dependency injection (4) — so the search was aimed correctly.

## Why this was invisible

"109 conventions, all enforced" is a completeness-shaped number that measures
something else: how many of the rules we WROTE DOWN are checked. It says nothing
about which rules were never written. That is the same shape as the god-file finding
on the same day — a stated rule with no cadence — and the same shape as the four-track
table claiming tracks were "not started" when they had built the handbook.

**A convention count cannot report its own gaps.** Something has to compare the rules
against an independent list of what the codebase actually cares about, and the only
such list is the five non-negotiables in CLAUDE.md plus the global quality SOP.

## What to do

1. **Reversibility first** — it is a stated non-negotiable and it is checkable in at
   least one direction: a create/deploy/install capability should have a
   delete/undeploy/uninstall counterpart. `appBuilderComponentRunner` already pairs
   add with remove; [[AB-7]] is a live defect in exactly this area (remove reports
   success while leaving deployed code running), which is what an unenforced principle
   looks like in production.
2. **Error handling second** — start by reading `src/core/errors/` and stating what is
   already true, rather than inventing a policy.
3. Then re-count by section and see whether any other domain is thin for the same
   reason rather than because it is genuinely small.

## Shipped so far

- 2026-09-10  Filed after a full program pass; the gap is recorded in
  `.rptc/research/2026-09-10-program-worklist/`
- 2026-09-10  docs(backlog): PL-55 — reversibility and error handling have no convention at all (`30e5b1bdf`)
