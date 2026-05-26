# MCP Sync Gap Audit

**Captured**: 2026-05-20
**Origin**: `/rptc:research` session investigating whether the Demo Builder MCP gives Claude the right context for locally-built projects, and what sync gaps exist between local storefront, custom block libraries, and their GitHub remotes.
**Status**: Research deliverable. Findings feed into AI Layer Pivot Cycle B (new Steps 6e–6h) and Cycle A.2 follow-up cleanup.

---

## Context

The AI Layer Pivot plan promises a "30-minute storefront" experience matching the user's `te-eds-mock` example: open Claude Code in a generated project, AI edits a block, user sees the result. This audit asked two questions:

1. Does the Demo Builder MCP give Claude correct local-project context?
2. Where are the sync gaps between local storefront, custom block libraries, and their GitHub remotes?

The audit dispatched three parallel research agents (MCP context resolution, block library sync model, GitHub remote sync) and synthesized findings into a unified gap inventory.

---

## Part 1: MCP Context Resolution (Confirmed Working)

The MCP gives Claude correct context **on the machine where the project was built** and as long as the storefront directory exists locally. Resolved facts:

- Storefront path: `~/.demo-builder/projects/<name>/components/eds-storefront/` (NOT `<name>/storefront/` — earlier plan iterations had this wrong)
- MCP reads `.demo-builder.json` manifest, extracts `componentInstances['eds-storefront'].path`, validates with realpath-based traversal protection
- `PROJECTS_DIR` defaults to `~/.demo-builder/projects` with `DEMO_BUILDER_PROJECTS_DIR` env override
- All seven MCP tools work against the resolved storefront path

**Key code paths**:
- `src/mcp-server.ts:48-75` — project name + path resolution
- `src/mcp-server.ts:178-186` — storefront path lookup from manifest
- `src/mcp-server.ts:261-288` — `sync_storefront` git operations
- `src/core/state/projectFileLoader.ts:127-153` — component discovery loop
- `src/core/constants.ts:18` — `EDS_STOREFRONT = 'eds-storefront'`

---

## Part 2: Block Library Sync Model (Surprising Findings)

**User's hypothesis confirmed: block libraries are NOT locally cloned anywhere.** Demo Builder reads library files from GitHub via API and pushes them into the storefront repo via the Git Tree API in a single atomic commit. No local clone of any library source exists on disk.

Three places the same block code can live and drift independently:

| Location | What it is | Drift risk |
|---|---|---|
| Library source repo on GitHub | Owned by library author (Adobe or 3rd party) | Updates here don't propagate (G5) |
| Storefront repo on GitHub | The copy installed during project creation | Drifts from library source |
| Local storefront clone | What MCP and PostToolUse hook see | Drifts from storefront's GitHub when not pushed (G3, G4) |

Key code paths:
- `src/features/eds/services/blockCollectionHelpers.ts:62-264` — atomic-tree-commit install (no local clone)
- `src/features/eds/services/storefrontSetupPhase2.ts:140-172` — unified built-in / custom processing
- `src/features/updates/commands/updateExecutor.ts:287-330` — broken update apply (advances `commitSha` without re-copying files)
- `src/types/blockLibraries.ts:31-46` — `InstalledBlockLibrary` data model

The AI agent's view of "the block" is always the divorced storefront copy. `list_blocks` and `get_block_source` query the storefront's local clone exclusively — no library-source awareness.

---

## Part 3: GitHub Remote Sync (Multiple Gaps)

The most significant gap chain runs from "AI edits a file" through "Helix publishes it":

1. Demo Builder generates a GitHub repo from a template (CitiSignal etc.) during project creation
2. The user's GitHub account owns the repo; auth is via the user's OAuth token from the GitHub App flow
3. Local↔remote sync has three pathways:
   - **MCP `sync_storefront` tool** — manual, AI-driven, does `git add -A && git commit && git push`
   - **PostToolUse Claude Code hook** — auto-fires after `Write`/`Edit` tool calls, runs the same git sequence with commit message `"AI: sync files"`
   - **`configSyncService.syncConfigToRemote`** — for `config.json` only, during republish

But: **`git push` is where the chain ends for storefront content.** Helix only sees changes on the `.aem.page` preview URL when the user explicitly runs Republish or Helix's GitHub webhook fires. There's no automatic preview/publish trigger after AI pushes. The `configSyncService` path already wires `previewPage()` + `publishPage()` for `config.json` — the equivalent isn't done for storefront edits.

Key code paths:
- `src/features/eds/services/githubRepoOperations.ts:75-118` — `createFromTemplate`
- `src/features/eds/services/githubRepoOperations.ts:422-458` — `cloneRepository` (only called by template creation, not project restore)
- `src/features/eds/services/storefrontRepublishService.ts:198-215` — config.json + Helix publish chain
- `src/features/eds/services/helixService.ts:910` — `previewAndPublishPage` chain
- `src/features/project-creation/services/mcpConfigWriter.ts:217,226-253` — PostToolUse hook (with fragility)

---

## The Gap Inventory

| # | Gap | File:line | Severity | Plan action |
|---|---|---|---|---|
| **G1** | Helix preview/publish not triggered after AI pushes to storefront | `mcp-server.ts:286`, `mcpConfigWriter.ts:251` | **Critical** | Cycle B Step 6e |
| **G2** | `sync_storefront` uses ambient git creds, not `GitHubTokenService` | `mcp-server.ts:286` | **Critical** | Cycle B Step 6f |
| **G3** | PostToolUse hook silently disabled by spaces in project path | `mcpConfigWriter.ts:217,226-230` | **Critical** | Cycle B Step 6g |
| **G4** | `$CLAUDE_TOOL_INPUT` parsing unverified; failures invisible | `mcpConfigWriter.ts:235-247` | **Critical** | Cycle B Step 6g |
| **G5** | Block library "update" doesn't actually update files | `updateExecutor.ts:287-330` | **High** | Cycle B Step 6h |
| **G6** | No reverse promote path despite AGENTS.md claiming there is one | `aiContextWriter.ts:254` vs no implementation | **Medium** | Cycle A.2 follow-up (drop the false promise) |
| **G7** | `sync_content` MCP tool referenced in docs but doesn't exist | AGENTS.md + skills vs `mcp-server.ts:351-419` | **Medium** | Cycle A.2 follow-up (drop the reference) |
| **G8** | No fresh-machine clone-from-remote recovery | (absent) | **Low** | Defer to Cycle D / later |
| **G9** | No drift detection (uncommitted/unpushed/remote-ahead) | (absent) | **Low** | Defer; AI Configuration tab Status row could surface in Cycle D |

---

## Critical Gaps in Detail

### G1 — Helix publish not triggered after AI pushes

**Problem**: After `sync_storefront` or the PostToolUse hook runs `git push`, the storefront's `.aem.page` preview URL doesn't update until Helix's GitHub webhook fires (unreliable timing) or the user explicitly runs Republish. The "AI edits → user sees the result" loop never closes.

**Fix**: Extend `sync_storefront` to chain `previewAndPublishPage` (from `helixService.ts:910`) after a successful `git push`. Same chain `configSyncService.syncConfigToRemote` already uses. The PostToolUse hook can also call into this path via a Demo Builder CLI helper, or — simpler — rely on `sync_storefront` as the public sync entry point and let the hook auto-commit only.

**Cost**: ~30 lines in `mcp-server.ts` + `helixService` integration. Existing primitives.

### G2 — `sync_storefront` ambient credentials

**Problem**: `git push` from the MCP relies on whatever credentials happen to be configured. If the user re-clones without the embedded token, or the token expires, push fails silently from the AI's perspective.

**Fix**: Before `git push`, fetch a fresh token from `GitHubTokenService.getToken()` (same pattern Demo Builder uses elsewhere) and inject it into the remote URL via `injectTokenIntoUrl`. Or set up a temporary `GIT_ASKPASS` script. Either approach reuses existing GitHub auth infrastructure.

**Cost**: ~15 lines in `mcp-server.ts`. Existing `GitHubTokenService`.

### G3 + G4 — PostToolUse hook fragility

**Problem**: Two interrelated fragility points:
- `SHELL_METACHAR_RE` rejects paths with whitespace → macOS users with `~/Documents/My Projects/...` get no hook installed at all
- The grep/sed parser for `$CLAUDE_TOOL_INPUT` is fragile and unverified against Claude Code's actual hook env-var format

**Fix**: Two coordinated changes:
- Replace `grep`/`sed` with `jq` (proper JSON parser). Bundle jq detection like other dependencies, or use a fallback chain (jq → python3 → grep/sed).
- Allow paths with spaces by using proper shell quoting. The metachar regex should reject injection characters (`"`, `` ` ``, `$`, `;`, etc.) but accept spaces.
- Surface failures: write an error to a log file in the project directory that the AI Configuration tab can detect and display.

**Cost**: ~40 lines across `mcpConfigWriter.ts` + a tiny log helper. Verification spike for `$CLAUDE_TOOL_INPUT` format (Claude Code docs or experimentation).

### G5 — Block library updates lie

**Problem**: `performAddonUpdates` advances `installedBlockLibraries[i].commitSha` to mark a library "updated" but never re-runs `installBlockCollections` to pull new block files. The state lies — the storefront's `blocks/` directory still has the old content.

**Fix**: Inside `performAddonUpdates`, after detecting an update is available, call `installBlockCollections` (the same atomic-tree-commit install path used during project creation). This pulls new files from the library source and commits them to the storefront repo. Only then update the recorded `commitSha`.

**Cost**: ~20 lines in `updateExecutor.ts`. Existing `installBlockCollections` primitive.

---

## Less Critical Gaps

### G6 — Reverse promotion is fiction

`AGENTS.md` lists "Promote my hero-cta changes back to the Isle5 library" as an example prompt. No code implements this. The fix is to **stop promising it** until we build it. Cycle A.2 follow-up: remove the example prompt from `aiContextWriter.ts:235-244`.

If reverse promotion becomes a real feature later, the implementation would need a fork-and-PR flow against the library source repo: `GitHubFileOperations` already has the primitives, but the orchestration (which file changed, where to upstream, draft PR text) is genuinely new work.

### G7 — `sync_content` MCP tool doesn't exist

References in AGENTS.md and the `sync-changes.md` skill mention `sync_content` as a tool the AI agent can call. The MCP only registers seven tools; `sync_content` isn't one of them. AI agents calling it get a "tool not found" error.

**Fix**: Cycle A.2 follow-up — remove references. We could implement `sync_content` to wrap `previewAndPublishPage` (for users who edited DA.live content directly and want it to publish), but that's a Cycle B+ decision. Today, drop the references.

### G8 + G9 — Operational nice-to-haves

Both are about visibility, not core functionality. Defer to Cycle D as part of the AI Configuration tab's Status section:
- Drift detection: surface "X uncommitted changes" or "Y unpushed commits" or "Remote ahead" as Status rows
- Fresh-machine recovery: a "Restore project from GitHub" action on the projects home screen for projects whose local clone is missing

---

## Path Correction Required in the Plan

Earlier iterations of the AI Layer Pivot plan referred to the storefront as `<projectPath>/storefront/`. The correct path is `<projectPath>/components/eds-storefront/`. Code uses `COMPONENT_IDS.EDS_STOREFRONT` (which resolves to `'eds-storefront'`) and works correctly; the prose needs a sweep to remove the imprecise "storefront subdirectory" references.

Specific places to correct:
- Section 5 "AI-context root resolution" subsection
- Section 5 reference implementation shell (`resolveAiContextRoot` is already correct via `COMPONENT_IDS.EDS_STOREFRONT`)
- Various scattered references to "the storefront subdirectory"

---

## Recommendations

### Fold into Cycle B as new steps

| Step | Description | Effort |
|---|---|---|
| **6e** | Chain `previewAndPublishPage` after successful `git push` in `sync_storefront` so AI edits propagate to `.aem.page` preview URLs without manual Republish | Small-Medium |
| **6f** | Replace `sync_storefront`'s ambient git auth with `GitHubTokenService`-injected credentials | Small |
| **6g** | Replace PostToolUse hook's grep/sed with `jq`; allow paths with spaces; surface failures via a log file the AI Configuration tab can read | Medium |
| **6h** | Fix `performAddonUpdates` to actually re-install block files when bumping `commitSha` (call `installBlockCollections` instead of only updating the SHA) | Small |

### Fold into Cycle A.2 follow-up (small doc/code commit)

- Remove "Promote my hero-cta changes back to the Isle5 library" from `aiContextWriter.ts:235-244` (and any related skill references)
- Remove `sync_content` references from AGENTS.md generation, the `sync-changes.md` skill template, and any other docs
- Correct "storefront subdirectory" prose references in the pivot plan to `components/eds-storefront/`

### Defer to Cycle D

- Drift detection rows in the AI Configuration tab Status section
- "Restore project from GitHub" recovery action on the projects home screen

---

## What This Unlocks for the User

After Steps 6e–6h land, the AI Layer Pivot's promised experience actually works end-to-end:

1. **User clicks "Open in Claude Code"** → Claude Code launches (extension or terminal) with the right project context
2. **User asks Claude to edit a block** → Claude uses skills + MCP tools to make the changes
3. **PostToolUse hook fires after Write/Edit** → reliably auto-commits and pushes (no silent failure from paths with spaces, no broken parsers)
4. **`sync_storefront` call (or post-edit hook chain)** → pushes to GitHub with reliable auth AND triggers Helix preview+publish
5. **User sees the change on the `.aem.page` preview URL** → seconds later, not minutes (manual Republish no longer required)
6. **User asks Claude to install a block library update** → files actually update in the storefront (no state lie)

The `te-eds-mock` 30-minute experience the user keeps citing becomes reproducible in Demo Builder projects.

---

## Sources / Code Evidence

All file:line references in this document map to the current state of the `feature/ai-layer` branch at commit `25516e2a`. Three parallel research agents performed the audit on 2026-05-20.
