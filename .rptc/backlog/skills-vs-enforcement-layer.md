---
id: PL-27
kind: question
area: platform
needs: []
value: low
status: open
---

# Is any of our 37 skills doing a job a check should hold?

> **Answered 2026-08-30: yes, one — `gate` — and it had already failed twice.**
> Fixed the same day (`npm run gate`). Kept `open` because a question closes on
> evidence and this one should be re-asked at the next release cut; the answer is
> recorded below so it is not re-derived.

The escalation order this repo already follows says: eliminate a problem in the
architecture if you can; failing that make it a lint rule, a test, or CI; only
then write a rule or a skill; a human last. On that ordering a skill is a safety
net — the layer you land on when the two below it cannot hold the thing.

We own 37 skills, 5,277 lines. The question is whether any of them is sitting at
the skill layer for a job a check could hold instead.

## Filed as a question, not a chore, deliberately

There is no "done" here. It closes when the answer is evidence, and the honest
prior is that **most of them are correctly placed**:

- The convention programme already did this work in the right direction — 56 of
  62 conventions have an enforcer, and the four hand-maintained indexes became
  generated ones.
- Much of what the skills carry is knowledge no test can express: which Adobe
  documentation corpus answers which kind of question; that a DELETE against the
  Helix API is checked against `fstab.yaml`; that `aem.live` rejects
  percent-encoded paths. A test cannot hold a routing table for external
  services.

So the expected finding is "few or none", and the value of asking is mostly that
the answer gets recorded rather than re-litigated.

## Where to actually look

Skills that describe a **procedure over our own code** are the candidates, since
that is what a check can see:

- `reuse-first` — already half-enforced by the `30-reuse-first.rule` PreToolUse
  hook. Does the prose half add anything the hook cannot?
- `decompose-god-file` — the size thresholds it exists to fix are already
  measured by the SOP scans. Is the skill the fix, or a duplicate of the finding?
- `gate` — cited 69 times, by far the most-used. Is any part of it a step a
  script should run rather than an agent should remember?

Skills that encode **external reality** (`adobe-docs-lookup`,
`eds-publish-and-config`, `eds-dropin-vendoring`, `adobe-org-context`,
`debug-log-triage`) are out of scope. Nothing in CI can check a claim about
someone else's service.

## Do not confuse this with deletion

A skill that is correctly placed but never invoked is a `tool-verdicts` /
[[PL-25]] question about routing and wording, not an argument for removing it.
Two different findings; keep them apart.

## The answer (2026-08-30)

**One skill, and it was the most-used one.** `gate` — 32 invocations across 54
transcripts, cited 69 times in the repo — carried its pre-push sequence as SIX
shell commands listed for a human to run by hand. No script ran them together.

A list of six is a memory test, and the record shows it being failed twice:

- **2026-07-30**, already written into CLAUDE.md: the dream run found a whole
  feature delivered after someone hand-ran a scoped lint and skipped `gate` §6's
  whole-repo lint, which CI enforces.
- **2026-08-30**, found while answering this item: the session doing the auditing
  had run three of the six all day — jest, tsc, lint — and never
  `typecheck:tests`, `validate:tsc-blindspots`, or the dead-code scan. All three
  passed when finally run, which is exactly why nobody noticed.

Both times the skipped steps would have passed. That is the shape of this defect:
silent until the day it is not.

**Fixed:** `npm run gate` runs all six in order and stops at the first failure. The
skill now points at the script and keeps the steps as a readable table, and
`tooling-registry.test.ts` pins the table's row count to the script's step count,
so adding a seventh step fails until the skill names it.

### The prediction was wrong, and how it was wrong is the useful part

This item was filed expecting "few or none", on the reasoning that the conventions
programme had already pushed the enforceable rules down a layer. That was right
about the RULES and blind to the PROCEDURES. The examples it proposed all survived:

- `reuse-first` — the hook fires on file creation; the prose holds the judgement
  about whether two things are the same job, which no hook can make.
- `decompose-god-file` — the scans FIND oversized files; the skill is the fix.
  Finding and fixing are different jobs and only one is checkable.
- The external-reality skills (`adobe-docs-lookup`, `eds-publish-and-config`,
  `adobe-org-context`) were correctly ruled out of scope: nothing in CI can check
  a claim about someone else's service.

The candidate nobody suspected was the one everybody runs. **Look for a skill whose
body is an ordered list of commands** — that is the shape that should be a script,
and being well-used makes it more urgent, not less.

## Provenance

From auditing our agent-facing files against three t3.gg videos (2026-08-30).
The ordering is credited there to Lauren ("Potato"); its content matches what
this repo arrived at independently through the conventions programme, which is
part of why the expected answer is "we already do this".

## Shipped so far

- 2026-08-30  feat(gate): make the six-step pre-push sequence a script, not a memory test (`77a781bd4`)
