# Phase 4 · Step 01 — what an agent actually cannot reach

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

### Build (6)

| Tool | Why it qualifies |
|---|---|
| `create_github_repo` | Returns `{owner, name, url, fullName}`; no `sendMessage`, no modal; blocks on `waitForContent`. Creates **from a template** — needs `templateOwner`/`templateRepo`. |
| `create_adobe_project` | Returns the created project. Structured `AUTH_FORBIDDEN` + quota errors. Its `sendMessage` calls are a best-effort refresh, and headless `sendMessage` is a verified no-op. |
| `create_adobe_workspace` | Same shape. Targets the SELECTED project, so the tool must set that first. |
| `check_github_app` | Returns `{isInstalled, …}` for an owner/repo — whether AEM Code Sync is installed. **No tool exists**, and it is the first thing to check when publishing silently fails. |
| `check_repo_readiness` | Returns `{readiness}` — whether a repo can serve as a storefront. **No tool exists.** Pairs with `create_github_repo`. |
| `check_compatibility` | Pure registry read of a frontend/backend pair. Cheap pre-flight before `create_project`. |

The three create tools take a **confirm gate**; the two Adobe ones must use `requireAdobeAuth`'s
`quiet` path so no modal appears.

**Consider merging three into one.** `check_compatibility`, `validateSelection` and
`loadDependencies` all answer "will this combination work?" — one `validate_component_selection`
tool is likelier right than three near-identical ones.

### Decide before building (4)

| Handler | The question |
|---|---|
| `ensure-mesh-api-subscribed` | Does `add_console_apis` already cover it? Depends on credential type — `appbuilder-api-subscription` has the answer. |
| `addAppBuilderComponent` | Substantive (id/source/name/apis) and no tool exists, but not read in full. |
| `check-prerequisites` | `prerequisites` has NO agent surface at all. Worth a deliberate decision, not a default no. |
| `get-components-data` | The components half duplicates `list_components`; the `envVars`/`services` half answers "what does this component need?", which nothing does. A narrow tool may be right. |

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
