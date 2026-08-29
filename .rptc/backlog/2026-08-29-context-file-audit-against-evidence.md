---
id: AI-8
kind: question
area: ai
needs: []
value: high
status: backlog
title: Audit every CLAUDE.md and the shipped AGENTS.md against the evidence — the answer may be "delete most of it"
---

# Audit our context files against what the research actually says

Owner-requested 2026-08-29: review two sources on managing `AGENTS.md` /
`CLAUDE.md`, audit our own files against them, then apply the same standard to
the files the extension SHIPS to users.

**Filed as a `question`, not a `fix`, because the sources do not agree with the
premise that these files should be improved. One of them argues most of them
should be deleted, and cites a study.** The audit could reasonably conclude that
our best move is to delete two thirds of what we have, and that outcome needs
the owner's ruling rather than an agent's.

## The sources

Both transcripts were pulled 2026-08-29 and the findings below are from them
directly, not from summaries.

**1. "Delete your CLAUDE.md (and your AGENT.md too)"** — Theo (t3.gg), 29 min,
Feb 2026. <https://youtu.be/GcNu6wrLTJc>
Cites <https://arxiv.org/abs/2602.11988>, <https://arxiv.org/pdf/2602.12670>,
and an HN thread. **Read the papers directly as part of this work — a video is a
secondary source.**

**2. "My AGENTS.md & SKILLS.md Breakdown (Don't copy them)"** — Theo, 51 min,
Aug 2026. <https://youtu.be/e1snsuY4lTI>

## What the study reportedly measured

Coding agents on real GitHub issues, three conditions — developer-written
context file, none, and LLM-generated:

| condition | effect on task completion |
|---|---|
| developer-written file | **+4%** |
| LLM-generated file | **−3%** |
| either | **+20% cost**, more exploration/testing/reasoning |

Its own recommendation: *"omitting LLM-generated context files for the time
being, contrary to agent developers' recommendations, and including only minimal
requirements, like specific tooling to use with a repository."*

A hand-run comparison in the video matched: same question, same repo, **1m11s
without the file vs 1m29s with it**.

## The claims worth testing against our repo

From source 1 (skeptical):

- **"If the info's in the code base, it probably doesn't need to be in the agent
  MD."** Models are good at finding things; a generated file mostly restates
  what a walk would have found in a minute.
- **Everything in context biases behaviour.** Mentioning a legacy dependency
  made the agent reach for it wrongly — the "don't think about pink elephants"
  effect. Volume is not free.
- **Fix the codebase, not the file.** The hierarchy for a misbehaving agent
  starts with the code, the tooling and the feedback systems; the context file
  is a "band-aid" for when those have failed.
- **These files go stale and then actively hurt** — outdated structure sends
  files to the wrong places.
- **The "surprise" instruction as a harvesting device**: tell agents to flag
  anything surprising, then use what they flag to FIX THE CODEBASE. He merges
  under a fifth of what they propose and treats the rest as a bug report about
  the repo.

From source 2 (constructive, and it partly contradicts the first):

- **Own the file; do not `/init` it.** Rules should come from watching agents
  repeat the same mistake, not from a generated survey.
- **A skill's `description` is TRIGGER KEYWORDS, not an explanation.** It is
  always in context even when the skill is not used, so it should say WHEN to
  pull the skill in. Getting the keywords right let him split one skill into two.
- **Concrete examples beat prose rules** — he pasted a real bad PR title as the
  counter-example.
- **Audit agent transcripts** to find what to add.

## Our exposure, measured 2026-08-29

**Development-facing:** 12 `CLAUDE.md` files, **3,344 lines**. No `AGENTS.md`.

    341  ./CLAUDE.md                     570  ./src/commands/CLAUDE.md
    530  ./src/core/CLAUDE.md            478  ./src/features/CLAUDE.md
    334  ./src/features/sidebar/         245  ./src/CLAUDE.md
    239  ./src/features/projects-dashboard/
    149  ./src/core/ui/hooks/            129  ./docs/architecture/
    127  ./.rptc/                        126  ./docs/
     76  ./src/core/ui/components/

**Shipped to users:** `agentsMdSections.ts` has **16 section builders** producing
a **13.7 KB `AGENTS.md`** in every generated project, plus a `CLAUDE.md` that is
one line (`see @AGENTS.md`). Sections today: Project Overview, How to Change
Things, Remote Endpoints, Querying Commerce, Storefront, PDP Routing, Component
Repositories, Adobe I/O Project, App Builder Integrations, Adding Adobe API
Access, Your MCP Servers, …

**The shipped half is the higher-stakes half.** Every user of the extension gets
it, they did not choose it, and if the study is right we are imposing a ~20% cost
increase and a possible accuracy penalty on all of them.

## The honest tension, which the audit must not paper over

Our root `CLAUDE.md` is **not** a generated survey. Almost every rule in it was
written after a specific incident and cites it — the zsh glob quoting that caused
two false all-clears, the `2>&1 > file` redirect that produced empty jest output,
the four production no-ops from casts at call boundaries. That is exactly the
"steer away from repeated mistakes" the sources ENDORSE.

So the finding is unlikely to be "delete it all". It is more likely to be a split:

- **Incident-derived steering** — probably earns its place
- **Structural description** ("here are the directories, here are the scripts")
  — probably does not; the model finds it faster than we can keep it true
- **Anything restating what `package.json`, the file tree or the types already
  say** — probably actively harmful

And a caveat the audit must state rather than assume away: **the study measured
single-issue SWE-bench-style task completion.** Our heaviest use is long
multi-turn sessions with deep repo-specific knowledge, which is a different
regime. That does not make the study wrong; it makes "does this generalise to us"
a question to answer, not skip.

## The work

1. **Read the two arXiv papers directly.** The videos are secondary. Establish
   what was actually measured, on what models, and where it does and does not
   generalise.
2. **Classify every line of the 3,344** into incident-derived steering /
   structural description / restatement of discoverable fact. The middle and last
   categories are the candidates for deletion.
3. **Test it.** We can measure rather than argue: pick a handful of representative
   tasks, run them with the current files and with a trimmed set, compare
   completion and cost. That mirrors the study's method on our own repo, and this
   session has already shown that measuring beats reasoning.
4. **Audit the SHIPPED `AGENTS.md`** to the same standard, and hardest — 16
   section builders, every one of which is content we impose on users. Which
   sections tell an agent something it could not find in the project in a minute?
5. **Audit the skill descriptions** against source 2's rule: are they trigger
   keywords or explanations? **34 project skills**, and every description is in
   context on every turn whether the skill is used or not. `gate`'s is 68 words
   and explains what the skill DOES; source 2 argues that space should be spent
   on when to reach for it. Worth measuring the total first — 34 descriptions at
   that length is a standing cost paid on every request. **Measured: 13,520
   characters, roughly 3,400 tokens, present on every single turn** — before any
   CLAUDE.md, before the prompt, before any file is read.
6. **Rule on the "surprise" instruction** — whether to add it to the shipped
   `AGENTS.md` as a harvesting device for improving the extension itself.

## Done when

The owner has ruled on what stays, the dev-facing files reflect it, the shipped
generator reflects it, and `AI_CONTEXT_VERSION` is bumped so existing projects
pick up the change (see `.claude/skills/ai-context-authoring` — the four gate
seams and the bump discipline).

## Related

- `ai-context-authoring` — how to change the generated bundle without stranding
  existing projects
- AI-1q and the evaluation battery — the existing instrument for measuring
  whether the agent surface actually works; the natural place to run step 3
- `tests/templates/ai-bundle-coherence.test.ts` — the static half of bundle
  checking, which will need updating if sections are removed
