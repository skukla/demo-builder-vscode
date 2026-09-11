---
id: PL-55
kind: chore
area: platform
needs: []
value: high
status: built
parent: PL-30
---

# Two architectural domains have no convention at all — one of them is a non-negotiable

Owner, 2026-09-10: *"I thought our original architecture program had architectural
conventions that we hadn't even started."* Checked, and that is right.

## What is missing

The handbook states **112 conventions, all 112 enforced**, which reads as complete.
It is not complete — it is complete *for the domains it covers*. Counted by section:

```
  39  §7  the user interface
  31  §9  tests
  14  §10 what stops this drifting
  10  §3  code gets what it needs handed to it
   4  §2  code grouped by what it does      4  §8  agents are a second door
   3  §4  behaviour is data                 3  §6  the two halves talk by message
   2  §1  two programs                      2  §5  what survives between calls
```

**Re-verified 2026-09-10, later the same day (count refreshed from 109 to 112).**
Three conventions landed between filing and pickup — builtin-namespace mocks and the
CSS-baseline push gate into §9, VSIX contents into §10 — and NONE of them touches
either domain below, so both claims hold. Checked rather than assumed, because a
"this returns zero" claim is exactly the kind that rots:

- **error handling: still 0** in both the handbook and the generated index, for
  `error type`, `domain error`, `granular catch`, `error class`, `DemoBuilderError`.
- **reversibility: still 0 conventions.** A broader search (`reversib`, `undone`,
  `undo`, `counterpart`, `uninstall`, `undeploy`) returns 5 handbook lines, and
  reading all five is what makes this a finding rather than a count: two are inside
  the `confirm: true` agent-tool convention this item already named and excluded, and
  the other three use "undo/undone" incidentally inside conventions about erased types
  and about restoring jest spies. No convention requires a reversal to exist.
- Positive controls fired as they did at filing: cascade layers 19 handbook lines,
  dependency injection 5. The search was aimed correctly.

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

## Design — reversibility, decided 2026-09-10 before any code

**What entity is this.** Not a new one. The thing being ruled is a CAPABILITY —
specifically a capability as exposed on the agent surface, which is the one surface in
this repo that is fully enumerable. Every MCP tool is declared in exactly two ways
(`tool: '...'` descriptor rows, and `server.registerTool('...')` hand-registrations),
so "every capability" is a list a script can build. The human surface has no equivalent
registry: a button is a React element, and there is no file that names them all.

**What owns it and where it lives.** A shrink-only ledger plus a `tests/sop/` enforcer —
the established pattern here, the same shape as the god-file and cast ledgers. The
ledger holds one row per create-shaped tool; the row either NAMES the reversal or
carries a reason none exists. That directly implements the words CLAUDE.md already
uses: "ship with their reversal ... or they state plainly why reversal is impossible."

**Alternatives rejected.**

- *A naming rule* (`create_x` implies `delete_x`) — measured and wrong. Of ten tools it
  flags as unpaired, at least three are reversible under a different verb:
  `deploy_mesh` is undone by `delete_mesh`, `deploy_integration` by
  `remove_integration` (which "undeploys it remotely"), `publish_page` by `delete_page`
  ("Unpublish and delete"). A rule that fires on those teaches people to ignore it.
- *An eslint rule* — it cannot see across files to know whether a reversal exists.
- *Checking the human surface too* — no registry to read; deferred rather than guessed.

**Measured today, both registration paths, with controls.** 100 tools. 15 create-shaped.
The first count said 48 and was wrong: it read only descriptor rows, and the control
(`get_auth_status`, hand-registered) failed, which is what caught it.

**Which decisions are product intent — NOT taken unattended.** Whether a given gap
SHOULD be closed is a capability decision. Recording that it is open, and forcing the
next create-shaped tool to answer, is not. So the ledger seeds honest `reason` rows for
the open ones and they go to the walkthrough queue:

- `install_prerequisite` — should uninstalling Node / the aio CLI be a thing at all?
- `create_adobe_workspace` — `delete_adobe_project` exists; the workspace has no delete.
- `add_console_apis` — subscription is a full-union PUT, so removal means PUT-without,
  which no tool exposes.
- `connect_dalive` — a sign-in, not a created resource; is it even in scope?
- `start_datapack_export` — writes into a SHARED datapack; reversal is not obviously
  defined.

## Step 3 done — the re-count, and it found a THIRD gap

This item's own step 3 was "re-count by section and see whether any other domain is
thin for the same reason". Done by its own stated method: compare the conventions
against the five never-compromise properties in CLAUDE.md, which is the only
independent list of what this codebase says it cares about.

| Never-compromise property | Conventions |
|---|---|
| 1. Whatever can be done can be undone | **1** — written by this item |
| 2. A user's own edits are never overwritten | **0** |
| 3. Existing projects keep working | 1 (the AI-bundle four-seam rule) |
| 4. This repository is public | 8 |
| 5. Cloud operations are real and consequential | 1 (the `confirm: true` gate) |

**Property 2 has nothing, and it is the most user-consequential of the five.** The
extension writes files into projects that people then edit by hand. CLAUDE.md states
the mechanism and, in its last sentence, states a checkable rule: "Every
generated-bundle write goes through the ADR-013 hash-and-skip seam
(`generatedFileWriter.ts`) ... A writer that calls `writeFile` directly has quietly
opted out of that."

Filed separately rather than absorbed here — this item is named for two domains and
has closed both, and a third deserves its own record. See [[PL-56]].

## Shipped so far

- 2026-09-10  Filed after a full program pass; the gap is recorded in
  `.rptc/research/2026-09-10-program-worklist/`
- 2026-09-10  docs(backlog): PL-55 — reversibility and error handling have no convention at all (`30e5b1bdf`)
- 2026-09-11  Staleness check at pickup: count refreshed 109->112 (three conventions landed since filing, none in either domain); both zero-claims re-verified by reading the 5 reversibility hits, not counting them; controls fired
- 2026-09-11  Reversibility domain CLOSED as a rule: convention 113 + tests/sop/reversibility-ledger.test.ts over a 15-row ledger (9 paired, 6 reasoned, ceiling pinned). Six product decisions to the walkthrough. Error handling still open.
- 2026-09-11  Error-handling domain closed: convention 114 (a domain error lives with its domain; core/errors legacy, shrink-only ratchet at 4) + 3 dead classes deleted + the architecture doc corrected. PL-55's 'zero conventions' claim corrected — error SHAPE was already ruled by Pattern B.
- 2026-09-11  fix(tooling): the convention proofs actually run now — they were registered and unrun (`2407c7962`)
- 2026-09-11  feat(tooling): four more convention proofs — and two were wrong before they were right (`497313e9d`)
- 2026-09-11  feat(tooling): convention proofs attribute, and seven more are proven (`5b1683427`)
- 2026-09-11  feat(tooling): proofs for test-enforced conventions — the half hook rules already had (`7f98641f3`)
- 2026-09-11  docs(handbook): the tool-failure rule is a convention now, not just code (`513fd9b0d`)
- 2026-09-11  feat(mcp): a failed tool call reports that it failed (`610c30c9c`)
- 2026-09-11  docs(plan): the error research as three conventions to develop against (`e3a28b15e`)
- 2026-09-11  docs(plan): error strategy revised with sourced research (`8babd76ad`)
- 2026-09-11  docs(plan): a proposal for the error strategy, measured not assumed (`ea723bd28`)
- 2026-09-11  fix(sop): two reversibility gaps were not gaps — the reversal already existed (`87eac7dd0`)
- 2026-09-11  docs(backlog): PL-55 built, both domains ruled; PL-56 filed from its step 3 (`c67c6faa6`)
- 2026-09-11  refactor(errors): the central hierarchy was half dead — delete it and rule the rest (`d505ffe34`)
- 2026-09-11  feat(sop): reversibility is a rule now, not just a stated principle (`e96d07915`)
