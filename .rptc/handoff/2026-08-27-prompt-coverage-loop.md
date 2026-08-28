# Prompt-coverage loop report — 2026-08-27 (night)

Owner-picked item: full-surface prompt coverage (AI-1q). Lane 2 — executable
to a supervised edge, and the edge arrived early: the dev host died during
the evening's post-merge reload and only F5 restarts it, so everything
RUNNABLE waits on one keypress. The loop shipped everything authorable and
designable instead. Branch `loop/2026-08-27-prompt-coverage`, two commits,
pushed.

## The short version

The skills half of the coverage item is fully authored and unblocked: all 34
promised skills now have battery prompts, and the measurement gate that the
item believed needed a supervised step turned out to be ALREADY SATISFIED —
today's host reloads migrated both skill bundles to the registrable v27
layout. The tier-2 write harness reached its design gate and deliberately
stopped there: reading the handlers surfaced a secrets-in-export hazard that
makes the harness safety-critical, and safety-critical rig code does not
ship unverifiable against a dead socket. One decision queued for you.

## Shipped (on the branch)

1. **31 skill-coverage prompts** — every entry in the skills baseline (14
   home-scope + 20 project-scope) now has a prompt whose route is through
   that skill, read-only by instruction, following the shipped convention
   (the prompt names the skill: this measures registration, not blind
   discovery). Home and project variants are deliberate: the two bundles
   come from DIFFERENT writers and both carried the pre-v27 flat-file bug.
   Validated by the coverage test and the scorer's 17/17 self-tests.
2. **The staleness correction**: the item said skill measurement "needs F5
   first" — bodea's manifest reads aiContextVersion 27 and both bundles are
   directory-layout on disk, so the activation sweep already delivered v27
   during today's reloads. The baseline's gate note now records that, and
   that entries still leave ONLY on a measured hit.
3. **The tier-2 harness design** (`battery/tier2-design.md`) — the model,
   the rejected alternatives, the choreography (snapshot → flip to scratch
   via the probe → run → restore-with-verification), and the finding that
   shaped it: `export_project_settings` includes SECRETS and acts on the
   CURRENT project, so flipping to the scratch project must be a harness
   step, never an agent step. Confirm-gated tools are excluded outright —
   headless runs have no consent channel.

## Handed off — exactly what remains

- **Press F5.** That restarts the dev host and unblocks: the 31 skill
  prompts (first real run answers the item's open question about headless
  skill loading), the two re-runnable positive controls, and all future
  battery work. Suggested first run:
  `node .rptc/plans/evaluation-mode/battery/run.mjs --only skill-diagnose,skill-datapack,skill-aem-block`
  — the three pre-existing prompts, now on v27, as the calibration batch
  before the 31 new ones.
- **Tier-2 harness implementation** — design ready, deliberately not built;
  needs a live host so its restore/abort mechanics can be verified as they
  are written.

## Filed / queued

- **select_org / select_project / select_workspace annotation** — your
  decision: their read-only annotation is a deliberate commented choice
  ("session targeting only… no safety gain in blocking"), but they write
  session state that persists across battery runs, which is why tier 1
  deferred them. Recommendation: KEEP the annotation (the comment's
  reasoning holds — nothing durable changes), and keep them permanently in
  the deferred queue with a tier-3-style named reason. The alternative —
  flipping to non-read-only — changes agent-visible semantics for three
  navigation tools to satisfy a measurement rig.

## Retracted / corrected

Nothing retracted. One item claim corrected (the F5-first gate, above) —
logged on the item before any work proceeded, per the staleness rule.

## Environment facts

- **The dev host is down** — it answered the 20:05 reload call, began
  reloading, never rebound its socket (ECONNREFUSED; no extension-development
  process). Everything socket-dependent is queued behind F5.
- caffeinate held the machine; no sessions expired during the loop.

## Your decisions

1. **Merge `loop/2026-08-27-prompt-coverage`?** Two commits: the prompts
   (pure battery data, validated) and the design doc.
2. **Press F5**, then say the word to run the skill batches.
3. **The select_* annotation** (recommendation above: keep, with a named
   permanent deferral).
