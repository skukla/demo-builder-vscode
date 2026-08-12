# AI surface coverage — tools and skills against Demo Builder features

**Status:** planned, not started
**Created:** 2026-08-12
**Slug:** `ai-surface-coverage`

## Goal

Make the agent-facing surface a deliberate API rather than an accumulation. Two questions,
answered per feature and then kept answered:

1. **Capability** — which of this feature's handlers can an agent reach, which cannot, and
   for each one that cannot, is that a decision or an oversight?
2. **Guidance** — does an agent know *when* to reach for them? A tool nothing routes to is
   discoverable only by luck.

## Why now

A first-pass audit (2026-08-12) measured the surface as **58 tools / 14 skills** and found
the two halves badly out of proportion:

| | Tools | Skills |
|---|---|---|
| Spread | 11 of 13 functional features have at least one | 9 of 14 are EDS storefront authoring |
| Largest un-guided cluster | `authentication` — 8 tools | 0 skills |
| Read/write asymmetry | `data-installer` — 6 reads | 0 actions |
| No surface at all | `prerequisites` — 0 tools | 0 skills |

Composition verified against the registration sites: 26 descriptor tools + 23 in domain
modules + 9 file-based = 58, matching what the AI Capabilities modal reports.

The audit also exposed a sharper framing. "Does this feature have tools?" is the wrong
question. The answerable one is **"which headless-safe handlers exist and are not
exposed?"** — mechanically checkable, because a descriptor row is ~10 lines over an
existing handler.

## What the first pass could NOT establish

A second research pass replaced the first pass's disagreeing regexes with a brace-matching
parser and a join whose control passed — every descriptor row's `type` resolved to a real
handler key in all five maps. Full write-up:
`.rptc/research/ai-surface-coverage/research.md`.

| Map | Handlers | Exposed by descriptor | No descriptor row |
|---|---|---|---|
| `dashboardHandlers` | 35 | 10 | 25 |
| `edsHandlers` | 15 | 2 | 13 |
| `aiHandlers` | 7 | 5 | 2 |
| `dataInstallerHandlers` | 6 | 6 | 0 |
| `meshHandlers` | 4 | 3 | 1 |

**Two corrections that change what steps 01–02 must do:**

1. **Most of the 41 is not a gap.** Reading the handlers rather than counting them splits
   them three ways: UI navigation (correctly never exposed), fire-and-forget dispatchers
   (unsafe to expose), and capability already reachable through one of the 32 tools
   registered outside the descriptor tables. Coverage must be judged against all 58 tools,
   not the 26 rows.
2. **There is a second disqualifier.** `mcp-tool-authoring` states the bar as
   headless-safety. A handler can be perfectly headless and still be unexposable because
   its return value carries the DISPATCH, not the OUTCOME — `handleSyncStorefront` is two
   lines that run a VS Code command and return `{ success: true }`. Exposing one of those
   gives an agent a tool that cannot fail, which is worse than no tool.

## Scope

**In:** every handler map reachable from a feature; the descriptor tables; the generated
skill bundle; `diagnose-demo`'s routing table.

**Out:**

- **`data-installer` actions.** The read/write asymmetry is real — `OPERATION_MODE`
  (`import | export | delete | validate`) is defined and used only to describe and filter
  READS — but Stage 2 owns it and another session owns that feature. Report, don't touch.
- **`prerequisites` tooling**, until step 06 decides whether it should exist at all.
- Anything under `src/features/data-installer/`.

## Method

Steps 01–02 are analysis and produce a committed artefact plus an enforcing test. Steps
03–07 act on what they find. The analysis is not throwaway: step 02's exclusion list is
what makes step 01's gate possible, and the gate is what stops this audit needing to be
redone in six months.

## Steps

| Step | What | Kind |
|---|---|---|
| 01 | Inventory every handler: exposed, not exposed, headless-safe | analysis + gate |
| 02 | Classify each unexposed handler: expose or never, with a reason | judgment |
| 03 | Expose the qualifying READ tools | TDD |
| 04 | Expose the qualifying ACTION tools | TDD |
| 05 | Org-context skill for generated projects | TDD + bundle |
| 06 | Mesh skill, and the prerequisites decision | TDD + bundle |
| 07 | Routing: `diagnose-demo` reaches the new surface | TDD + bundle |

## Gates that apply throughout

From `mcp-tool-authoring`:

- Descriptor-exposed handlers must be **headless-safe** — no panel dependence for the
  result, no modals, no `vscode.window` prompts on the happy path.
- **No writes hiding in reads.** A read tool must not call anything that creates on miss
  (`list_console_apis` derives `managed` from the persisted union for exactly this reason).
- Destructive actions carry `confirm: true`.
- Adobe-touching tools reuse the existing guard chains; never inline an org check.
- `dashboardHandlersMap.test.ts` pins an exact handler count — bump it with its arithmetic
  comment.
- Tool name and one-line description are the agent's search surface under deferred loading.

From `ai-context-authoring`:

- **`AI_CONTEXT_VERSION` (`src/core/constants.ts`) must be hand-bumped** on ANY change to
  generated content — a skill template counts. Without it, existing projects never learn
  the bundle changed: no badge, no prompt, silent staleness. Steps 05–07 each touch
  generated content.
- The tooling gate has **four seams** (`mcpConfigWriter.buildMcpConfig`,
  `aiDefaultsInstaller.installAiDefaultsMcpTools`, `componentInstallationOrchestrator`,
  `aiHandlers.handleRegenerateAiFiles`). Change all or none.
- `skillsWriter.test.ts` pins an exact skill-file count; a new conditional skill needs
  positive AND negative (bare-project) cases.
- **Regenerate parity:** anything creation writes, Regenerate must reproduce for a project
  that gains the qualifying component later.

Docs to sync on bundle changes: `src/features/ai/README.md`, `src/features/CLAUDE.md`,
`docs/systems/mcp-server.md`.

## Risks

**Exposing handlers that only look headless-safe.** A handler that reads fine in isolation
may depend on panel state through a service. Step 02 requires reading each handler, not
grepping it — the same discipline that separated real from imagined duplication on
2026-08-05.

**Skill bloat.** Every skill added is context every agent pays for on every project. Two
new skills against 14 is defensible; a skill per feature is not. Steps 05–06 add two and
step 07 adds none — it makes existing routing reach further.

**Bundle staleness.** Skills freeze per project. Everything steps 05–07 add reaches
existing projects only through an `AI_CONTEXT_VERSION` bump, and that bump re-prompts every
user — `.127` and `.128` both generated support questions doing so. Land 05–07 together,
bump once.

## Source

First-pass audit is in this conversation, not yet a document. If it should outlive the
session, promote it to `.rptc/research/ai-surface-coverage/research.md` before starting.
