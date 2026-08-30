---
id: PL-27
kind: question
area: platform
needs: []
value: low
status: open
---

# Is any of our 37 skills doing a job a check should hold?

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

## Provenance

From auditing our agent-facing files against three t3.gg videos (2026-08-30).
The ordering is credited there to Lauren ("Potato"); its content matches what
this repo arrived at independently through the conventions programme, which is
part of why the expected answer is "we already do this".
