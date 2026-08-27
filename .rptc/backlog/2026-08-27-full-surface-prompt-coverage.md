---
id: AI-1q
kind: feature
area: ai
parent: AI-1
needs: []
value: high
status: active
---

# Every tool and skill the modal promises gets a prompt that proves it

Asked by the owner 2026-08-27: *"run enough prompts such that every expected
tool and skill from the supported list of AI tools per project that we show in
the modal is properly represented."* The AI Capabilities modal promises a
surface per project shape; nothing verifies the promise tool by tool. The
mechanic already exists — `unprompted-baseline.json` (93 tools) is the ratchet,
and `toolPromptCoverage.test.ts` keeps it honest. This plan drives it to a
NAMED FLOOR, not to zero, because "represented" cannot mean the same thing for
a read and for `delete_adobe_project`.

## The four tiers

**Tier 1 — reads (~44 tools callable without force).** One prompt each, expected
tool declared, run live. A miss is not a failed prompt — it is a discoverability
finding about the tool. This tier is fully automatable overnight: draft from the
tool description + corpus, run, classify, keep. ~28 prompts to write beyond
today's 16.

**Tier 2 — writes safe on a scratch resource** (project-local: config, prompts,
pin/rename, datapack validation…). Needs a disposable scratch project and a
per-run allowlist extension — the battery's readonly allowlist currently makes
every write attempt INVALID by design. Build the scratch-project harness first;
until then these stay in the baseline.

**Tier 3 — writes that touch live cloud** (deploys, publishes, GitHub/Adobe/
DA.live create/delete). NEVER exercised unattended. Represented instead by
handler tests + descriptor/consent checks, and — only with the owner present —
supervised journey runs. These are the permanent floor, each named in the
baseline with its reason.

**Tier 4 — third-party servers** (Dropins 20, Playwright 24, App Builder MCP
11). Job-level coverage, not tool-level: we measure that OUR surface routes an
agent to them (a prompt whose correct route is `list_slots`; the site-scraping
skills that drive Playwright), not the internals of tools we do not ship.
Tool-per-tool prompts for generic browser primitives would measure Microsoft's
code, not ours.

## Skills are covered the same way

A skill is represented when a prompt exists whose correct route is THROUGH that
skill, and the transcript shows it loaded. Add `expectSkill` to the prompt
schema and a parallel skills baseline (14 Demo Builder + 6 storefront + 7
starter-kit). Open question: confirm headless `claude -p` runs load project
skills the same way interactive sessions do before trusting the measurement.

## The per-shape dimension

The modal's promise is per PROJECT SHAPE. Today's rig measures one shape
(bodea: EDS + ACCS). Headless, PaaS, and mesh-bearing shapes change which tools
apply — `filterStepsForStack`, the gates. Phase for later: scratch projects per
shape, cloud resources required, owner present.

## Done looks like

- `unprompted-baseline.json` reduced to tier-3 entries only, each with a
  stated reason — the baseline becomes documentation of the floor
- a skills baseline at zero for the current shape
- the battery runnable as a full-coverage sweep at release cuts

Filed 2026-08-27, folded into the overnight loop as its standing work queue:
tier 1 is tonight's task after the orientation prompts verify.
