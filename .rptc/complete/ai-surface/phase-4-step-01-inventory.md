# Phase 4 · Step 01 — what an agent actually cannot reach

> **SUPERSEDED for the build list by `phase-4-step-02-full-parity-plan.md`.**
> This file asked "which handlers can become tools?" — the wrong question, and its central
> disqualifier was false. `progressCapture.ts` (`withCapturedProgress` / `lastCompleteData`)
> already converts a dispatch-only handler into a tool in ~5 lines, and
> `createProjectTool.ts:190` has been using it in production the whole time. Two handlers
> disqualified here (`handleRequestStatus`, `handleDeleteAdobeProject`) already return their
> payload; I read the top of each function and stopped before the return.
>
> The classification of DISQUALIFIED reasons below is still useful — panel dependence, modals,
> `sharedState`, the `aio` global selection — but "dispatch-only" is not among them.

**Analysis, not building.** Produces the worklist steps 03–04 build from, and the reasons the
rest are excluded, so nobody re-derives them.

## The number was wrong before this started

`ai-coverage-scan` reported an 83-handler gap. It is **62**. Its extractor matched `^\s+key:`
across each handler block, counting object properties inside handler BODIES — `auth:
context.authManager`, and `success`/`data`/`context`/`error` in returned objects. Fixed with a
character-level parser (`handler-keys.mjs`, carries a `--self-test`); the scan and a hand-read of
the three data-installer maps now agree name-for-name where the scan previously claimed 31 against
a real 9.

| | Reported | Actual |
|---|---|---|
| Handler types | 143 | **122** |
| Agent-relevant gap | 83 | **62** |
| data-installer share | 31 | **9** |

Of the 62, **9 are data-installer** — out of this phase's scope and filed as
`.rptc/backlog/2026-08-16-data-installer-mcp-write-tools.md`. **53 remain in scope.**

## What the 53 are

Signals extracted mechanically. **Nothing here was fully read except three handlers** — see the
limits section; the earlier version of this line claimed the candidates were read and that was an
overstatement of a script's output.

| Class | Count | Why it is not a tool |
|---|---|---|
| **Dispatch-only** | 21 | Pushes its result through `context.sendMessage` and returns a bare `{success:true}`. Exposing one hands an agent a tool that cannot fail and carries no answer. |
| **Bare status** | 15 | Returns `{success:true}` with no payload — same problem, without even the webview push. |
| **Interactive** | 1 | Opens a modal on the happy path (`storefront-setup-cancel`). |
| **Candidates** | 15 | Return an outcome. Read individually below. |
| **Unresolved** | 1 | `ready` — a lifecycle hook, not a feature. |

Extracting return SHAPES for the 15 candidates moved four of them: `getProjects` and
`re-detect-context` push through `sendMessage`, and `update-component-selection` /
`update-components-data` return bare success. The first classifier over-called them — which is
the point: each successive pass demoted candidates, and none has yet promoted one.

## The finding: an agent cannot CREATE a cloud resource. Any of them.

| Resource | List | Create | Delete |
|---|---|---|---|
| GitHub repo | `list_github_repos` | **missing** | `delete_github_repo` |
| DA.live site | `list_dalive_sites` | **missing** | `cleanup_dalive_site` |
| Adobe Console project | `list_adobe_projects` | **missing** | **missing** |
| Adobe Console workspace | `list_workspaces` | **missing** | **missing** |

Not two oversights — a shape. The extension creates all four (in-app Adobe I/O provisioning
shipped; storefront setup creates the repo and the site), and none of it is agent-reachable.
Phase 1 found the identical shape one level down: "list and destroy, but cannot write a page to
one."

It also has a practical consequence. An Adobe project + workspace is the PREREQUISITE for App
Builder work, so an agent cannot set up the thing the App Builder tools then operate on.

`handleCreateGitHubRepo` is the cheapest of the four: it already returns
`{ owner, name, url, fullName }`, with no `sendMessage` and no modal. A descriptor row away.

**The Adobe three carry a caveat.** `create-adobe-project`, `create-adobe-workspace` and
`delete-adobe-project` sit behind `requireAdobeAuth`, which PROMPTS unless the payload carries
`quiet: true` — its own comment says prompting "would put a modal in front of someone who clicked
nothing". So the non-interactive path exists and is deliberate, and a tool must use it. That is a
design note, not a blocker.

## The definitive list

~35 of the 53 read. The 18 not read are the auth-interactive and lifecycle group
(`github-oauth`, `github-change-account`, the four DA.live token handlers, `authenticate`,
`check-auth`, `continue-prerequisites`, `install-prerequisite`, the two storefront-setup handlers,
`log`, `ready`, `renameAppBuilderComponent`) — every one classified dispatch-only or interactive,
and `sign_in` already covers the auth capability.

### Build (7 tools, covering 10 handlers)

| Tool | Covers | Why it qualifies |
|---|---|---|
| `create_github_repo` | `create-github-repo` | Returns `{owner, name, url, fullName}`; no `sendMessage`, no modal; blocks on `waitForContent`. Creates **from a template**. |
| `create_adobe_project` | `create-adobe-project` | Returns the created project. Structured `AUTH_FORBIDDEN` + quota errors; headless `sendMessage` is a verified no-op. |
| `create_adobe_workspace` | `create-adobe-workspace` | Same shape. Targets the SELECTED project, so the tool must set that first. |
| `check_github_app` | `check-github-app` | `{isInstalled, …}` for an owner/repo. **No tool exists**; first thing to check when publishing silently fails. |
| `check_repo_readiness` | `check-repo-readiness` | `{readiness}` — can this repo serve as a storefront. **No tool exists.** |
| `validate_component_selection` | `checkCompatibility`, `validateSelection`, `loadDependencies` | One question, one tool — see the merge below. |
| `get_component_requirements` | `get-components-data` (narrowed) | The env vars, dependencies and services one component needs. `list_components` returns only `{id, name}`. |

The three create tools take a **confirm gate**; the two Adobe ones must use `requireAdobeAuth`'s
`quiet` path so no modal appears.

**Consider merging three into one.** `check_compatibility`, `validateSelection` and
`loadDependencies` all answer "will this combination work?" — one `validate_component_selection`
tool is likelier right than three near-identical ones.

### The four decided (read 2026-08-16)

**`ensure-mesh-api-subscribed` — NO.** Not a duplicate of `add_console_apis`, but not an agent
tool either. `add_console_apis` requires a CURRENT PROJECT and reconciles the persisted API union;
this one takes explicit `orgId`/`projectId`/`workspaceId` because it runs in the wizard BEFORE a
project is persisted. An agent creating a project gets the mesh subscription inside
`create_project`; for an existing project `add_console_apis` covers it. Exposing this would mainly
offer a way to subscribe APIs to an arbitrary workspace outside any project — more footgun than
capability.

**`addAppBuilderComponent` — NO.** It disqualifies itself in a branch: on a guard failure it runs
`vscode.commands.executeCommand('demoBuilder.configureProject')` and returns `{success: true}`. An
agent would receive success while a panel opened and nothing was added. Everything before that
branch is sound, so this is a refactor candidate rather than a permanent no.

**`check-prerequisites` — NO as written, but the capability needs a tool.** It streams each result
through `context.sendMessage('prerequisite-status', …)` and stores the outcome in
`context.sharedState`, returning a bare status. Headless it would do all the real work, send every
result into a no-op, discard the state and return `{success:true}`. `prerequisites` is the only
feature with NO agent surface at all, and "is this machine set up to build a demo?" is a fair
question for an agent to ask — so the answer is a NEW headless read over the same check services,
not this handler. **Filed as follow-up work, not part of step 03/04.**

**`get-components-data` — YES, narrowed.** Verified live: `list_components` returns `{id, name}`
and nothing else, so "what does this component require?" is unanswerable today. Exposing the whole
wizard blob would duplicate the catalog; the narrow tool is
`get_component_requirements(componentId)` returning that component's required/optional env vars,
dependencies and services. Index/detail applied properly — `list_components` is the index.

### The merge

`check_compatibility`, `validateSelection` and `loadDependencies` all answer "will this
combination work?" over the same `dependencyResolver`. They become one tool,
**`validate_component_selection(frontend, backend, dependencies?)`**, returning compatibility, the
resolved dependency chain, and any validation failures. Three near-identical tools would make an
agent guess which to call.

### Disqualified, by reason

| Reason | Handlers |
|---|---|
| **Needs `context.panel`** — returns an error without one | `requestStatus`, and `switchOrg` / `reAuthenticate` which chain into it |
| **Opens a modal / browser on the happy path** | `republishContent` (`withProgress` + `showErrorMessage`), `resetProject` (`*WithUI`), `delete-adobe-project` (`confirmDeletion`), `storefront-setup-cancel`, `reAuthenticate` |
| **UI navigation** — runs a VS Code command, returns success | `editProject`, `configure`, `restartDemo` |
| **Writes only to `sharedState`** — per-webview, invisible to an agent | `update-component-selection`, `update-components-data` |
| **Reads the `aio` CLI's process-global selection** | `check-project-apis` — would answer about whatever project another process last selected (phase 0's conflict) |
| **Capability already reachable** | `getProjects`/`get-workspaces` (`list_adobe_projects`, `list_workspaces`), `exportProject` (`export_project_settings`), `loadComponents`/`loadPreset` (`list_components`, `list_demo_packages`), `discover-store-structure` (`get_store_structure`), `list-org-console-apis` (`list_console_apis`) |
| **Dispatch-only** — result goes out by `sendMessage`, return is bare | the auth group above, plus `check-github-auth`, `get-github-repos`, `re-detect-context` |

## Honest limits of this pass

**~35 of 53 read.** The 18 unread are the auth/lifecycle group described above; each was
classified by signal extraction, and `sign_in` already covers what an agent needs from them. A
misclassification there costs a missed opportunity, not a bad tool.

**Reading promoted two handlers no script had flagged** — `check_github_app` and
`check_repo_readiness` were both sitting in BARE-STATUS because their payload rides on the
response type rather than a `data:` key. That falsifies the earlier claim in this file that "no
pass has ever promoted one", and it is the clearest argument for reading: the scripts only ever
subtracted.
