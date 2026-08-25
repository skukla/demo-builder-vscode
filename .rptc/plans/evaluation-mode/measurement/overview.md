# Sub-plan — Measurement: the held-out set, and proof the feature helps

**Parent:** `.rptc/plans/evaluation-mode/` (steps 01–09).
**Blocks:** step 09 — suggestions written by Claude must not be tuned on the
prompts they are judged by.
**Status:** planned, not started.

## Why this is a SUB-PLAN and not a step

It was drafted as step 08 and promoted on 2026-08-25, on the same test that
moved OpenTelemetry off the parent plan: a step changes code, and this does not
stop there.

Three things a step would hide:

1. **It is a METHODOLOGY, not a feature.** k=3, cold and warm reported
   separately, null cells kept as controls, the tool surface recorded beside
   every result. Get any of those wrong and the numbers look fine and mean
   nothing — which is exactly what happened to the original six prompts.
2. **It has a recurring, real cost.** Every battery run is N paid agent runs.
   Who runs it, how often, and against which build are operational questions
   with an owner, not implementation details.
3. **It needs NEW MATERIAL from outside the code** — held-out prompts written
   from real producer asks. Nobody can generate those from the repository, and
   inventing them defeats the entire point of holding them out.

## The operational questions to settle

Answer these before writing the runner, because each changes its shape:

- **When does it run?** Release cuts is the obvious answer (the `dream` and
  `codebase-sweep` skills already run there), but each battery run costs money,
  so "every cut" may be too often.
- **Against which build?** A comparison needs two, and the tool surface must be
  recorded with each or the delta is meaningless.
- **Where do results live** so a comparison six months later is still possible?
  Not in a session scratchpad — that is how the first six prompts were lost.
- **Who writes the held-out prompts**, and from what? Real producer asks, which
  means asking producers.

## Ships

A fixed battery that can be run on demand, and a number that says whether the
extension is getting better or worse for agents.

## Two jobs, one battery

1. **A HELD-OUT set** — prompts the suggestion loop is never tuned against. This
   is what stops step 09 overfitting, and the research this plan follows keeps
   one for exactly that purpose.
2. **A regression measure for US.** Run the battery before and after a change to
   the tool surface, and the delta says whether the change helped agents or hurt
   them. Today that is done by hand and the numbers are not comparable between
   runs.

## The material already exists — do NOT reconstruct it

`.rptc/plans/evaluation-mode/battery/` holds `run.mjs`, the 43-name allowlist,
and five prompts recorded VERBATIM. That directory exists because the original
six prompts were lost and the follow-up A/B had to reconstruct them, which made
its absolute figures incomparable to the numbers it was comparing against. Read
its README before touching anything here; every trap in it was paid for.

The load-bearing ones:

- **Persist prompts WITH results**, or the next comparison can only compare
  against itself.
- **Record the tool surface too** — build string from `serverInfo`, tool count,
  the allowlist used. A comparison across builds is meaningless without it.
- **k=1 is not enough for a token claim.** Use k=3, and report cold and warm
  separately: cache state alone swung one prompt 55,236 → 8,959.
- **Keep the null cells.** `components`, `auth` and `datapacks` are controls —
  they are what made a small-n result credible, because they moved <1% while the
  targeted ones dropped 25–57%.
- **Cost is not effect.** Two runs with near-identical billable tokens cost $0.34
  and $0.11 purely because one wrote cache and the other read it.
- **Restore what the run mutates.** `run.mjs` overwrites the developer's home
  `AGENTS.md` and does not put it back. Fix that as part of productising it.

## What a "prompt" here actually is

Worth stating plainly, because the term did real damage in the 2026-08-25 review:
it is **an ordinary thing a producer would type into the chat**. Nothing
specialised about its form.

    Set up a Bodea demo with B2B turned on.
    Why aren't my product pages loading?
    Add the catalog integration to this project.

The battery is a fixed list of those. Run the list, record what each costs and
how many steps it takes, and the numbers are a baseline. Run the same list after
changing the extension and the difference says whether agents got a better or
worse deal.

**"Held out" means one specific thing.** If a suggestion system is built and then
measured against the same prompts it was tuned on, it will look excellent —
because it was fitted to them. The held-out list is prompts the system has never
been measured against, so an improvement there is an improvement rather than a
fit.

Concretely: **five to build against, five different ones nobody touches until we
are claiming it works.**

## Split the battery

The five recorded prompts in `../battery/` are the TUNING set. The held-out set
must be prompts step 09 never sees.

**ANSWERED 2026-08-25 (owner): both — mine the existing chats AND map the tasks
from the extension's code.** That turned out to be the right instruction for a
reason nobody predicted, below.

Mark the split in this directory as a FILE, not an intention, so a later change
cannot quietly merge the two sets.

### What the transcripts actually contain (surveyed 2026-08-25)

37 sessions run inside demo projects, 70 distinct asks. **Almost none of them
exercise the extension's tool surface.** The overwhelming majority are Commerce
consulting — GraphQL queries, catalog shapes, Postman collections, which category
has which products, what a partner needs to integrate. The handful that touch
Demo Builder at all are orientation and sign-in:

    We're in a new home now. Please use the demo builder mcp to find out which project.
    run the Demo Builder sign_in tool with provider dalive.
    To be clear, that's the DEMO BUILDER project. Run the skill to rehome yourself.
    I've now created the full project. Should be headless-paas.

**This is a finding, not an obstacle**, and it is worth more than the battery it
was collected for. A surface of 104 tools is barely being asked for. Two readings,
and they need different fixes:

- Producers do not KNOW the tools exist → a discoverability problem, and no
  amount of prompt efficiency helps.
- The tools do not match what producers actually need → a surface problem, and
  the efficiency work is aimed at the wrong thing.

Either way it belongs in front of whoever decides what to build next, which is
why it is **filed as its own item rather than left here**:
[`2026-08-25-agents-barely-use-the-tool-surface.md`](../../../backlog/2026-08-25-agents-barely-use-the-tool-surface.md).
It carries the survey, both readings, the cheap checks that tell them apart, and
the caveats that weaken it. A finding about the whole tool surface does not
belong inside a sub-plan about batteries — nobody would read it there.

### So the two sources do different jobs

- **Transcripts give REALISM, not coverage.** They fix phrasing — real asks are
  terse, contextual, and often refer to things by nickname ("Leah's instance",
  "the headless project"). Invented prompts are always tidier than real ones, and
  a battery of tidy prompts measures a surface nobody is using.
- **The code gives COVERAGE, not realism.** The task map below is the frame; each
  group needs at least one prompt or that area of the extension is unmeasured.

Write the held-out prompts from the task map, phrased the way the transcripts
phrase things. Neither source alone is enough, which is what the owner's
"both" was for.

### The task map (from the code, 2026-08-25)

104 tools, grouped as a producer would recognise them. Every group needs at least
one prompt in the battery, and the split says which set it goes in.

| Task | Tools |
|---|---|
| Start a project | 7 |
| Find my way around | 8 |
| Sign in / Adobe setup | 11 |
| Run the demo | 3 |
| Mesh & integrations | 11 |
| Storefront & content | 17 |
| Blocks | 6 |
| Sample data | 14 |
| Store structure | 2 |
| Config & settings | 19 |
| AI bundle | 6 |

The five existing tuning prompts cover **Find my way around**, **Sign in** and
**Sample data**. Everything else is currently unmeasured — which is the concrete
gap this sub-plan closes.

## Where it runs

Behind a command, using the step-03 service so a battery run is just N
evaluations. Not on a schedule and not in CI: each prompt is a real paid agent
run, and background re-runs are already on the "deliberately not building" list
for that reason.

## Tests

- The runner reads its prompts from the recorded file rather than from anything
  inline — the exact failure the battery directory exists to prevent.
- A run records the tool surface alongside its results.
- The held-out set and the tuning set cannot overlap; assert on the two files.

## Done when

The battery runs from a command, writes results that name their prompts and their
tool surface, and the held-out split is a file rather than an intention.
