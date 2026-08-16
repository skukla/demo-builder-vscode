# Phase 0 — Audit the external tools in the chain

**Numbered 0 because it changes the denominator of every other phase.** Everything else in this
program audits the 52 demo-builder tools. That is not the surface an agent sees.

## What actually ships into a project

`src/features/project-creation/config/ai-defaults.json` installs two external MCP servers into
the isolated `.demo-builder-mcp/` manifest, each behind a `requires` gate:

| id | package | gate | tools it advertises |
|---|---|---|---|
| `commerce-extensibility` | `@adobe-commerce/commerce-extensibility-tools` | `app-builder-tooling` | `aio-app-deploy`, `commerce-event-subscribe`, `search-commerce-docs`, `aio-app-dev`, `aio-app-use`, `aio-configure-global`, `aio-dev-invoke`, `aio-login`, `aio-where`, `onboard`, `upload-chat-history` |
| `playwright` | `@playwright/mcp` | `eds-storefront` | browser automation; drives three EDS skills |

Plus **session MCPs** the user adds themselves — `verify_ai_setup` inventories these separately
(`sessionMcps`), so the surface is not fully controlled by the extension at all.

## The finding: a direct architectural conflict

**The extension deliberately stopped writing the `aio` CLI's process-global console selection.
It then ships an MCP into the same project whose tools write exactly that state.**

The extension's model (`src/core/shell/orgContextEnv.ts`): org/project/workspace targeting is
per-operation, injected as `AIO_CONSOLE_*` env inside `withOrgContext(...)`, via an
AsyncLocalStorage. The global selection is treated as untrustworthy — quoting `:116-122`:

> "It does not mean 'no targeting' — it means the CLI falls back to its process-global
> `aio console where` selection, which the extension deliberately stopped writing (Phase 4a), so
> it holds whatever some earlier session **or another tool** left there. `deployMeshHeadless` ran
> unwrapped and deployed into a DELETED project for two days, reporting 'Unable to create a mesh.
> Check the mesh configuration file' while the config was fine (2026-08-03)."

The code already names "another tool" as a hazard. `commerce-extensibility` is that tool:

| External tool | What it does to shared state |
|---|---|
| `aio-configure-global` | writes the global config the extension stopped writing |
| `aio-app-use` | selects a workspace globally |
| `aio-where` | reports the global selection — an agent may treat it as ground truth |
| `aio-app-deploy` | deploys **using** that selection, while `deploy_integration` uses per-op targeting |

So one project can hold two tools that deploy an App Builder app with **different targeting
models**, and an agent has no way to know they disagree. The measured failure mode already
happened once, from a single unwrapped call inside the extension — an external tool writing the
global state is the same bug with a wider entrance.

**This is not a claim that the external MCP is wrong.** Its model is the normal `aio` one. The
conflict is that two models coexist in one project with nothing reconciling them.

## Static half — DONE 2026-08-16

Read from a real generated project's `.demo-builder-mcp/node_modules/`, not from the declaration.

### Inventory: 11 tools, and the version already drifted

`@adobe-commerce/commerce-extensibility-tools` — declared `^3.4.0`, **installed 3.5.0**. The
range floats, so the tool list is not pinned and can change without us.

`src/tools/`: `aio-app-deploy` · `aio-app-dev` · `aio-app-use` · `aio-configure-global` ·
`aio-dev-invoke` · `aio-login` · `aio-where` · `commerce-event-subscribe` · `onboard` ·
`search-commerce-docs` · `upload-chat-history`. Matches the declared description exactly.

### The conflict, confirmed at the command level

`aio-configure-global` builds and runs exactly the commands the extension abandoned:

```
select-org       → aio console org select <org>
select-project   → aio console project select <project>
select-workspace → aio console workspace select <workspace>
```

And its command runner sets **zero** `AIO_CONSOLE_*` env vars — so it uses the global model
exclusively, while the extension uses per-operation env targeting exclusively. The two models are
mutually invisible: neither can see what the other did.

### Overlap map

| External | Ours | Relationship |
|---|---|---|
| `aio-configure-global` | `select_org` / `select_project` / `select_workspace` | **Conflict** — writes global config vs sets an in-process store |
| `aio-where` | `get_current_project` | Reports the global selection; an agent may read it as truth |
| `aio-app-deploy` | `deploy_integration` | Same operation, different targeting model |
| `search-commerce-docs` | — | **Gap-filler.** May already answer what a docs knowledge-tool would; check before building one |

### Gating is NOT the lever

`projectNeedsAppBuilderTooling` returns true when the project has an **EDS storefront**
(`aiToolingGate.ts`), which is essentially every demo project. The gate reads as narrow and is
near-universal. Excluding the package would also remove `search-commerce-docs` and the whole
App Builder loop.

### What the fix is, and where it lives

The problem has two halves: Adobe's tool **writes** the shared setting, and the extension's own
commands **read** it when a caller forgets to pass a target. **We cannot stop the writing** — it
is Adobe's package on a floating range. The writing is only harmful because of the reading.

So the durable fix is on the reading side, and it is **NOT in this program** — it is extension
code. It was reported to the owning session as a defect (see below). Guidance is worth adding but
cannot be the primary fix: skills are advisory and nothing routes to them, so it reduces how
often the situation arises without making it impossible.

**A recommendation made here and withdrawn, recorded so it is not re-proposed:** "make untargeted
commands fail loudly". A guard already exists at the command seam and deliberately warns rather
than failing, because *"some call sites legitimately have no project yet"*
(`commandExecutor.ts:107-119`). The real defect is that its pattern list misses commands, not that
it warns. Do not propose failing until someone has counted how often it would fire.

### Live probe — ground truth, 2026-08-16

Connected to the running extension's UDS socket directly (same JSON-RPC the
`mcpToolProbe` uses: `initialize` → `tools/list`). No pasting, no test harness.

| | |
|---|---|
| Tools exposed | **52** — matches the source sweep exactly, validating the inventory |
| name + description | **7,348 chars ≈ 1,837 tokens** |
| datapack tools present | **0** — confirms this host is a develop baseline, not the integration build |

The datapack check is the tree-provenance test: `>0` means the running host has
`feature/data-installer` merged and its numbers must not be mixed with develop's. Run it before
trusting any live measurement.

### The real surface is ~129 tools, not 52

| Server | Tools | Source |
|---|---|---|
| demo-builder | 52 | live probe |
| commerce-extensibility | 11 | `src/tools/` in the installed 3.5.0 package |
| playwright | 66 declared, **23 exposed** | README vs live probe |
| **Total** | see the measured table under "Runtime half" — 86 or 92 by build | |

These are three separate MCP servers the client loads together; only demo-builder comes through
the socket above. **The 66 figure below was superseded by the live probe — Playwright exposes 23.**

### REOPENED: "tool-surface size is not a cost"

That claim was withdrawn earlier on a measurement of ~1,175 tokens. **Both halves of it were
wrong:**

1. The figure was low. Grepping `description:` literals in source missed tool names and parameter
   descriptions — the live schema is **1,837 tokens**, not 1,175.
2. It counted demo-builder only, which is **40% of the surface an agent actually carries**.

So the withdrawal is itself withdrawn. Per-task tool scoping is **undecided again**, and the
honest number is unknown until the Playwright subset question below is answered. Do not cite
either the 1,175 or the "not a cost" conclusion.

### Still unmeasured

**Whether Playwright exposes all 66 tools or a configured subset.** 66 is its README's full list;
the count depends on config. This does not come through the demo-builder socket — it needs the
client's view, which `verify_ai_setup` provides by spawning each server and inventorying it.
That is the last open item in this phase.

## Runtime half — DONE 2026-08-16

Called `verify_ai_setup` over the socket and diffed it against `tools/list`.

### Playwright exposes 23, not 66

66 is its README's full catalog; **23 are actually enabled**. The ~129 upper bound was wrong.

### The two ground-truth sources agree

`tools/list` and `verify_ai_setup`'s `inventory.mcps[]` returned identical demo-builder tool
sets — same count, zero name differences. Either can be trusted for the demo-builder half.

### The real surface, by build

| Server | develop baseline | integration build |
|---|---|---|
| demo-builder | 52 | 58 (+6 datapack) |
| commerce-extensibility | 11 | 11 |
| playwright | 23 | 23 |
| **Total** | **86** | **92** |

`verify_ai_setup`'s own response is **18,778 chars ≈ 4,695 tokens** — confirming it as the single
largest response on the surface, and the top target for phase 2.

### MEASUREMENT HAZARD: the socket is last-writer-wins, and it moved mid-audit

**Two probes of the same socket path, two minutes apart, returned different tool sets** — 52 with
no datapack tools at 15:42, then 58 with six at 15:44, after the socket was rebound at 15:44 by a
different extension host.

This is `.rptc/backlog/mcp-window-and-project-binding.md` reproduced live. That item records
*"Not reproduced live; preconditions stated from code"* — **it can now be marked reproduced**: the
socket name is `sha256(projects-root)`, identical across windows, and the last host to start
silently rebinds it.

**Consequence for anyone measuring this surface:** always run the tree-provenance check in the
same probe as the measurement, never before or after it. A number and its provenance must come
from one connection, because the host can change between two.

```
datapack tools present  →  integration build (feature/data-installer merged)
datapack tools absent   →  develop baseline
```

## What the audit must answer

1. **Overlap** — which external tools duplicate a demo-builder tool? Candidates by name:
   `aio-login` vs `sign_in`; `aio-where` vs `get_current_project` + `select_org/project/workspace`;
   `aio-app-deploy` vs `deploy_integration`. For each: do they agree, and which should an agent prefer?
2. **Conflict** — which external tools write state the extension assumes it owns? The
   `aio-configure-global` / `aio-app-use` case above is confirmed; the rest is unaudited.
3. **Gap-filling** — which external tools cover something demo-builder lacks, so no new tool is
   needed? `search-commerce-docs` may already answer questions a knowledge tool would.
4. **The real surface size** — 52 demo-builder + ~11 commerce-extensibility + Playwright's set +
   whatever the user added. The measured "1,175 tokens of descriptions" covers demo-builder ONLY;
   the true figure is unmeasured and the withdrawn tool-scoping argument may deserve re-examining
   at the true number.
5. **Guidance** — does any skill or AGENTS.md section tell an agent which of two overlapping tools
   to reach for? If not, the choice is arbitrary.

## Method

- `ai-defaults.json` is the declaration; `verify_ai_setup`'s `inventory.mcps[]` is the runtime
  truth, since it spawns each server and lists its tools. Use both and record differences.
- The external packages live in a generated project's `.demo-builder-mcp/node_modules/`, not in
  this repo — so this audit needs a real project, or the package sources read directly.
- Playwright's tool list is unmeasured here. Do not estimate it; read it.

## Why it is phase 0

Phases 1–2 add and reshape demo-builder tools. If an external tool already covers a gap, phase 1
builds something redundant; if an external tool conflicts, phase 2 polishes one side of a
contradiction. Both are cheaper to know first, and this audit is reading rather than building.

## Constraint

**Do not "fix" the conflict by wrapping or replacing the external MCP.** It is Adobe's package on
a version range (`^3.4.0`); its tools change without us. The output of this phase is a decision
about **guidance and gating** — which tools an agent is told to prefer, and whether a `requires`
gate should exclude one — not a code change to someone else's server.
