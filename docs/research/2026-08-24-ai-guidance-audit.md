# AI guidance audit — what we tell agents, and what it costs

**Measured 2026-08-24 on develop @ beta.141.** Reproduce with
`node scripts/measure-ai-guidance.mjs` (add `--full` for per-item tables).

`ai-coverage-scan` answers "can an agent REACH the feature?". This answers what
that scan structurally cannot: **what does our guidance cost, and is it bounded?**
A feature reachable through a tool is still unusable if reading its answer costs
more context than the work.

Token figures are chars/4 estimates, not a tokenizer. They are for comparing items
against each other and tracking drift. For an authoritative single-tool number,
use `mcp-live-probe` against the running server.

## The measurement

```
# AI guidance surface

## ALWAYS-ON — carried before the agent does anything

  generated AGENTS.md        ~1,640 tok  (mean of 2 real project file(s))
  skill descriptions         ~1,118 tok  (15 skills, listing only)
  tool descriptions          ~2,458 tok  (103 tools)
  ────────────────────────────────────
  subtotal                   ~5,216 tok  (excludes tool input SCHEMAS, which the
                                        catalog also carries — use mcp-live-probe for the true figure)

## ON-DEMAND — paid only when used

  skill bodies               ~18,227 tok total, load on invocation
  heaviest skill             ~2,572 tok  (diagnose-demo)

## BOUNDEDNESS — is what comes back capped?

  covered (ceiling or explicit exemption)  93 of 103  (90%)
    ├─ measured ceiling                    54
    └─ exempt by construction              39
  NEITHER                                  10

  by registration path — this is where the enforcement gap lives:
    descriptor tools    46, uncovered 0  (a test enforces this path)
    directly registered 57, uncovered 10  (NOTHING enforces this path)
  median ceiling                  3,000 B
  largest single ceiling          40,000 B  ~10,000 tok  (get_component_config)

## DENOMINATOR — external MCPs the extension installs alongside ours

  commerce-extensibility   thirdParty=false gate=app-builder-tooling
  playwright               thirdParty=true  gate=eds-storefront
  dropins                  thirdParty=false gate=eds-storefront

control: 103 tools, 15 skills, 54 ceilings, 3 external entries, 2 AGENTS.md read
```

## Findings

### 1. The always-on cost is small and well-split — about 5,200 tokens

Everything an agent carries before doing any work: the generated `AGENTS.md`
(~1,640), every skill's one-line description (~1,118 for 15 skills), and the tool
catalog's descriptions (~2,458 for 103 tools). Skill BODIES — 18,227 tokens, more
than three times the entire always-on surface — load only on invocation.

**That split is the single best efficiency property we have, and it is worth
protecting.** Guidance that would be prohibitive as standing context is affordable
because the agent pays for a skill only when it opens one. The median tool
description is 20 tokens, which is the right size for a routing decision.

The figure excludes tool input SCHEMAS, which the catalog also carries. A live
probe is the way to get the true catalog number; treat ~5,200 as a floor.

### 2. Boundedness is 90%, not the ~50% a naive count reports

93 of 103 tools are covered: 54 by a measured response ceiling, 39 by an explicit
per-tool exemption for responses that are a fixed short status by construction.
Counting ceilings alone reports ~52% and is simply wrong — this audit's own first
run made that mistake before the exemptions were read.

### 3. THE FINDING: the ceiling rule is enforced for one of two registration paths

Tools arrive two ways. Descriptor rows (46) go through a test that demands a
ceiling, an exemption, or an explicit IOU — **0 uncovered**. Directly-registered
tools (57 — the `*Tools.ts` modules and `registerProjectTools` in
`src/mcp-server.ts`) went through nothing, and **10 had neither a ceiling nor an
exemption**: `apply_updates`, `create_project`, `delete_project`, `edit_project`,
`get_settings`, `open_url`, `open_view`, `reset_eds_project`, `set_setting`,
`sign_in`.

**This is the same shape as the bug the response-envelope guard shipped with** —
its first version scanned one directory and missed ten tools in `src/mcp-server.ts`.
A guard that covers one registration path reads as full coverage and is not.

Closed 2026-08-24 by extending `responseSize.test.ts` to walk the direct path too.
The ten are listed as IOUs rather than given invented ceilings: several return
progress/summary payloads whose real size only a live run produces, and a number
guessed from a stub records a size production never emits. Promote each as an F5
pass exercises it. Shrinking that list is the work; adding to it silently is the rot.

### 4. One ceiling is worth questioning

`get_component_config` is capped at 40,000 bytes — about 10,000 tokens, roughly
twice the entire always-on guidance surface, for one call. It may be justified;
nothing in the record says it was chosen rather than defaulted.

### 5. The denominator is ours to set

We install 55 external tools beside our 103: `commerce-extensibility` (11),
`playwright` (23, third-party and opt-out), `dropins` (21). So an agent's catalog
is roughly 158 tools, about a third of which we did not write but did choose. Each
external entry is gated (`app-builder-tooling`, `eds-storefront`), so a project
carries only what its shape needs — the right design. But the guarded-tool problem
is real and now enforced: three of `commerce-extensibility`'s tools desync the org
selection, which is why the PreToolUse guard exists.

## What this suggests, in order

1. **Pay down the 10 IOUs** during normal F5 work. Cheap, and it closes the last
   unwatched corner of the response surface.
2. **Re-examine `get_component_config`'s 40,000-byte ceiling** — decide it rather
   than inherit it.
3. **Protect the always-on/on-demand split.** The temptation when guidance fails is
   to move it into `AGENTS.md` where it is always present. That trades a 5,200-token
   floor for a larger one on every call. Prefer a skill, or a tool that returns the
   answer.
4. **Re-run this before and after any guidance change** — the point of a script
   rather than a one-off reading.
