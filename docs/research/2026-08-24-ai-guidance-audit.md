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

## WATCHED — is what comes back checked? (NOT a runtime cap: ceilings are
##           test-time regression alarms; RESPONSE_CEILINGS is imported in tests/ only)

  watched (ceiling or explicit exemption)  93 of 103  (90%)
    ├─ ceiling ASSERTED against a payload  21   <- the only tier that BREAKS a build
    ├─ ceiling recorded, never exercised   33   (documentation, not a guard)
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

### 2. Tools are WATCHED, not bounded — and the watching has three tiers

**Correction (2026-08-24, after this report's first draft).** The first draft said
"90% bounded". That overstates what exists, in two ways, and the distinction
matters more than the percentage.

**Nothing caps a response at runtime.** `RESPONSE_CEILINGS` is imported in
`tests/` only — never in `src/`. No tool truncates its own output. Exceeding a
ceiling fails a TEST; a user never sees a capped response. Actual runtime bounding
is a separate and much smaller set of mechanisms: page-size limits
(`DEFAULT_LIST_LIMIT` = 100 rows) and stripping fields the agent cannot act on.
Those shrink payloads. Ceilings only notice when one regrows.

**And a recorded ceiling is not the same as an exercised one.** The table's own
header says the numbers are "asserted where the tool is already driven by a test" —
if no test produces a response, there is nothing to compare against.

| Tier | Count | What is actually true |
|---|---|---|
| Measured AND asserted (`expectWithinCeiling`) | 21 | A regrowth breaks the build |
| Ceiling recorded, never exercised | 33 | Documentation, not a guard |
| Exempt by construction | 39 | Fixed short status, justified per tool |
| Neither — now tracked as IOUs | 10 | The gap closed 2026-08-24 |

So the load-bearing enforcement covers **21 of 103 tools**, not 93. The other 82
are documented, justified, or newly tracked — all better than nothing, none of them
a guard.

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

### 4. How the numbers were chosen (and a retracted criticism)

Each ceiling is a **live measurement plus headroom** — taken 2026-08-16 against a
real Adobe org, a real Data Installer and a real storefront — or, for tools driven
only by fixtures, the fixture size plus headroom. Every entry carries a `why`
string saying which.

A blanket rule was tried and rejected with evidence, which is why the numbers vary
so widely: "responses must be small" called `read_page` returning a 12KB page a
failure when the page IS the answer, and called `list_console_apis`' 16% saving a
failure when 16% was all that existed. The stated intent — "a ceiling is a
regression alarm, not a target: it should fire when a payload changes shape, not
when a project has one more block in it" — is why they look generous.

**Retracted:** this report's first draft said `get_component_config`'s 40,000-byte
ceiling "may be justified; nothing in the record says it was chosen rather than
defaulted." Wrong — the `why` field states it plainly: *"returns a config file
verbatim — the file IS the answer."* It was decided. The criticism came from not
reading the field.

### 5. The denominator is ours to set

We install 55 external tools beside our 103: `commerce-extensibility` (11),
`playwright` (23, third-party and opt-out), `dropins` (21). So an agent's catalog
is roughly 158 tools, about a third of which we did not write but did choose. Each
external entry is gated (`app-builder-tooling`, `eds-storefront`), so a project
carries only what its shape needs — the right design. But the guarded-tool problem
is real and now enforced: three of `commerce-extensibility`'s tools desync the org
selection, which is why the PreToolUse guard exists.

## What this suggests, in order

1. **Close the 33 recorded-but-unexercised ceilings, and the 10 IOUs, the same
   way** — see "How to measure the rest" below. This is the real gap: 82 of 103
   tools have no test that ever compares a payload to a number.
2. **Prefer passive capture over speculative calls.** Nineteen tools mutate state
   and eight take no required arguments, so enumerate-and-call is unsafe by
   standing rule. The measurement has to come from runs that were going to happen
   anyway.
3. **Protect the always-on/on-demand split.** The temptation when guidance fails is
   to move it into `AGENTS.md` where it is always present. That trades a 5,200-token
   floor for a larger one on every call. Prefer a skill, or a tool that returns the
   answer.
4. **Re-run this before and after any guidance change** — the point of a script
   rather than a one-off reading.

## How to measure the rest

The 82 unexercised tools split by what it costs to produce a real response.

**Read-only tools — measurable today, safely.** `mcp-live-probe` calls the RUNNING
server over its socket and reports a tool's real response and token cost. That is
the authoritative instrument, and it is already the documented counterpart to
`mcp-tool-authoring`. The work is a probe pass, not new machinery.

**Mutating tools — cannot be called to measure them.** The standing rule is
explicit: never call a destructive tool to measure it, and never enumerate-and-call
with `{}` (19 tools mutate state ungated, 8 take no required arguments). A probe
pass structurally cannot reach these.

**The proposal for both: capture sizes passively from real runs.**
`withToolLogging` in `inExtensionMcpServer.ts` already wraps EVERY tool on both
registration paths, and already holds the result in hand — it logs the tool name,
the arg KEYS (never values, which can carry secrets) and the duration. It does not
log the response size. Recording `Buffer.byteLength(JSON.stringify(result))` there
would measure every tool anyone actually runs, including the destructive ones, at
zero risk and without a single speculative call. A dogfooding session would then
pay down the list as a side effect of being used.

Two constraints if this is built: log the SIZE only, never the payload (the same
reason args are logged as keys), and keep it behind the existing debug channel so
it costs nothing in normal operation.
