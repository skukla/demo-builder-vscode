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

## Runtime half — NOT DONE

Needs a running extension host:

- **Playwright's tool list is unmeasured.** Read it; do not estimate.
- **Reconcile the declaration against `verify_ai_setup`'s `inventory.mcps[]`**, which spawns each
  server and lists what it really exposes.
- **The true surface size.** The measured ~1,175 tokens of descriptions covers demo-builder only.
  Until the real figure exists, the withdrawn tool-scoping argument stays withdrawn but unsettled.

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
