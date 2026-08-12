# AI surface coverage — tools and skills against Demo Builder features

**Date:** 2026-08-12
**Method:** source measurement (no agents). Two passes; the second corrected the first.
**Feeds:** `.rptc/plans/ai-surface-coverage/`

## Summary

The agent-facing surface is **58 tools and 14 skills**. Capability is broad; guidance is
narrow and lopsided toward EDS. The sharper finding came from the second pass: "unexposed
handler" is not one thing, and a naive sweep to expose them would ship tools that always
report success.

## Established counts

| Fact | Value | How verified |
|---|---|---|
| Tools | 58 | 26 descriptor + 23 domain-module + 9 file-based; matches the AI Capabilities modal |
| Skills | 14 | `DEMO_BUILDER_ALWAYS_ON_SKILLS` (13) + `extend-app-builder-app` (conditional) |
| Handlers across the 5 feature maps | 67 | brace-matching parser, shape-agnostic |
| Handlers exposed by a descriptor row | 26 | join on each row's `type`, control passed |

**Control:** every descriptor row's `type` resolved to a real handler key in all five maps —
zero unmatched. That is what makes the join trustworthy.

## Per-map inventory

| Map | Handlers | Exposed by descriptor | Not exposed |
|---|---|---|---|
| `dashboardHandlers` | 35 | 10 | 25 |
| `edsHandlers` | 15 | 2 | 13 |
| `aiHandlers` | 7 | 5 | 2 |
| `dataInstallerHandlers` | 6 | 6 | 0 |
| `meshHandlers` | 4 | 3 | 1 |

## Finding 1 — "unexposed" splits into three categories, and only one is a gap

Reading the unexposed handlers rather than counting them:

**(a) UI navigation — correctly never exposed.** `openBrowser`, `openLiveSite`, `openDaLive`,
`openAdminPanel`, `configure`, `navigateBack`, `openIntegrations`, `showProjectDashboard`,
`editProject`. These move a human around a webview. The general case is already covered by
the `open_view` tool.

**(b) Fire-and-forget dispatchers — actively unsafe to expose.** These return
`{ success: true }` meaning the command was **dispatched**, not that it succeeded.
`handleSyncStorefront` is the clearest: its entire body is
`await vscode.commands.executeCommand('demoBuilder.syncStorefront')`. `handleRefreshBlockLibrary`
states the contract in its own docstring — the pipeline runs asynchronously and reports
through VS Code notifications, which an agent never sees.

Exposing one of these gives an agent a tool that cannot fail. That is worse than no tool: it
reports success while the work may not have run.

**(c) Genuine capability, reachable by a different code path.** The work exists as a bespoke
tool module rather than a descriptor row over the handler:

| Handler (unexposed) | Tool that does the work |
|---|---|
| `syncStorefront` | `sync_storefront` (file-based — real git add/commit/push, real result) |
| `republishContent` | `republish` (storefrontTools) |
| `deleteProject` | `delete_project` |
| `resetProject` | `reset_eds_project` |
| `get-github-repos` | `list_github_repos` |
| `reAuthenticate` / `switchOrg` | `sign_in` / `select_org` |

So the agent surface and the handler surface overlap without matching. **Coverage cannot be
computed from the descriptor tables alone** — 32 of the 58 tools are registered elsewhere.

Sometimes the pairing is deliberate and documented: `get_store_structure` (panel-free, returns
its result directly) versus the wizard's `discover-store-structure` (answers the same question
for a form the user is still filling in, reporting through `sendMessage`). That docstring is
the model for how such a pair should be justified.

## Finding 2 — the disqualifier the first pass missed

`mcp-tool-authoring` states the bar as headless-safety: no panel dependence for the result,
no modals, no prompts. Category (b) shows a second, independent test:

> **Does the return value carry the OUTCOME, or only the dispatch?**

A handler can be perfectly headless — no panel, no modal — and still be unexposable because
it returns before the work finishes. Panel-dependence and outcome-fidelity are different
questions, and only the first was written down.

## Finding 3 — skills are an EDS-authoring library

Nine of fourteen are scrape / map / refine / register workflows. The rest of the product has
tools and no guidance:

| Cluster | Tools | Skills |
|---|---|---|
| authentication | 8 | **0** |
| data-installer | 6 (read only) | **0** |
| mesh | 3 | 0 dedicated (3 skills mention it in passing) |
| updates | 1 | 0 |
| prerequisites | **0** | 0 |

The `authentication` gap is the sharpest: this repo carries an `adobe-org-context` skill for
developers, written because org handling is the most error-prone area in the codebase.
Generated projects ship eight org-shaped tools and no equivalent.

## Finding 4 — data-installer is read-only to agents

Six read tools, zero actions. The action vocabulary already exists — `OPERATION_MODE`
enumerates `import | export | delete | validate` — and is used only to describe and filter
reads. Stage 2 territory, owned elsewhere. Recorded, not acted on.

## Finding 5 — prerequisites has no surface at all

The only functional feature with zero tools and zero skills. Visible today as the one row in
`diagnose-demo` that dead-ends: "Project will not start" routes to the Debug Logs channel
rather than a tool, because no tool exists.

## Appendix — the 41 handlers with no descriptor row

Derived from the corrected parse (26/26 rows, zero row→handler mismatches). This is step
02's worklist; each name needs a disposition and a reason. Grouped by the categories in
Finding 1, as a **starting hypothesis only** — every one still has to be read, because
`handleSyncStorefront` looks substantial from its name and is two lines.

**`dashboardHandlers` (25)**

- *Likely navigation:* `openBrowser`, `openLiveSite`, `openDaLive`, `openAdminPanel`,
  `openDevConsole`, `openIntegrations`, `navigateBack`, `showProjectDashboard`, `configure`,
  `editProject`
- *Likely fire-and-forget:* `syncStorefront` (confirmed), `refreshBlockLibrary` (confirmed
  by its own docstring), `restartDemo`, `republishContent`, `resetProject`
- *Likely covered elsewhere:* `deleteProject` → `delete_project`, `deployMesh` →
  `deploy_mesh`, `reAuthenticate` → `sign_in`, `switchOrg` → `select_org`, `setConsoleApis`
  → `add_console_apis`, `exportProject` → `export_project_settings`
- *Unclassified — read these first:* `requestStatus`, `addAppBuilderComponent`,
  `renameAppBuilderComponent`, `setProjectDestination`

**`edsHandlers` (13)** — `check-github-auth`, `github-oauth`, `github-change-account`,
`get-github-repos`, `create-github-repo`, `check-dalive-auth`, `open-dalive-login`,
`store-dalive-token`, `store-dalive-token-with-org`, `clear-dalive-auth`,
`discover-store-structure`, `storefront-setup-start`, `storefront-setup-cancel`

Mostly OAuth/token-capture steps that are interactive by nature, plus the wizard's
`discover-store-structure` (deliberately paired with `get_store_structure`) and the
storefront-setup lifecycle. `get-github-repos` has a `list_github_repos` equivalent.

**`aiHandlers` (2)** — `openInClaude`, `copyAiPrompt`. Both act on the user's editor or
clipboard; neither is meaningful to an agent.

**`meshHandlers` (1)** — `ensure-mesh-api-subscribed`. The one genuinely unclassified
capability outside `dashboardHandlers`. Read it early: it may be the mesh gap worth closing.

## Method notes — what went wrong and what fixed it

**Two regex probes disagreed** (`dataInstallerHandlers` 6 then 0, `aiHandlers` 5 then 7). The
maps use two key shapes — quoted `'check-mesh':` and bare `requestStatus:` — and each probe
matched one. Fixed by a brace-matching parser that reads the object literal and takes
depth-1 keys regardless of shape.

**A join window truncated one row.** Matching `tool → map → type` within 400 characters
missed `export_project_settings`, whose `includeSecrets` schema pushes the fields apart. Found
by diffing captured tool names against all `tool:` literals — i.e. by a control, not by
reading the output.

The first response to that was to patch the count by hand (9 → 10) and note the bug. That
was not a fix: every unexposed LIST was still derived from the broken parse, so the data
behind the corrected number had never been regenerated. Replaced with a brace-matching
parser that reads each descriptor object whole, making field distance irrelevant. The re-run
produced 26/26 rows and zero row→handler mismatches, and confirmed the hand-patched table
happened to be right — which could not have been known without re-running. The appendix
above is the output of the corrected parse, not the broken one.

**`process.argv[1]` is the script path, not the first argument.** Fixed at the time.

All three produced plausible output. None was visible without a second source, and the first
was not actually resolved by being written down.

## Recommendations

1. **Org-context skill for generated projects** — 8 tools, 0 guidance, highest value per word.
2. **Mesh skill** — small tool count but `check_mesh` reports two states that agents conflate.
3. **Decide prerequisites deliberately** — a read tool for checking, human-only for installing,
   and either way stop `diagnose-demo` dead-ending.
4. **Audit category (c) pairs** — where a capability exists as both a handler and a bespoke
   tool, confirm the split is deliberate and documented, as `get_store_structure` is.
5. **Do not sweep category (b)** — fire-and-forget handlers must stay unexposed, and the
   reason belongs in the exclusion list so nobody re-proposes them.
