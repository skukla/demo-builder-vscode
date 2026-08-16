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

## The worklist for steps 03–04 — all six READ IN FULL

Reading dropped two of the six. Every pass has shrunk this list and none has grown it.

### Build (4)

| Tool | Handler returns | Notes from reading |
|---|---|---|
| `create_github_repo` | `{owner, name, url, fullName}` | No `sendMessage`, no modal. Creates **from a template** — needs `templateOwner`/`templateRepo`, so the tool must say so. Blocks on `waitForContent`, so the outcome is real rather than a queued job. |
| `create_adobe_project` | `{success, data: project}` | Structured errors: `AUTH_FORBIDDEN` on a permission re-check, and a named quota message. Its two `sendMessage` calls are a best-effort UI refresh in a `try/catch` — and headless `sendMessage` is a verified no-op, so they do nothing here. |
| `create_adobe_workspace` | `{success, data: workspace}` | Same shape. Takes an optional `projectId` used only for the refresh; creation itself targets the selected project, so the tool must set that first. |
| `check_compatibility` | `{compatible}` | Pure registry read of a frontend/backend pair. Cheap, and a useful pre-flight before `create_project`. |

The three create tools want the **confirm gate** — they provision real cloud resources — and the
two Adobe ones must go through `requireAdobeAuth`'s `quiet` path so no modal appears.

### Dropped by reading (2)

**`check-project-apis` — disqualified.** Its return shape (`{hasMesh}`) looked fine and hid the
problem: it shells out to `aio plugins`, `aio console projects get` and `aio api-mesh:get`, which
read the CLI's **process-global console selection**. That is the exact conflict phase 0
documented — the extension deliberately stopped writing that selection, so it holds whatever
another process last left there. As a tool it would answer about the wrong project, confidently.
`check_mesh` already covers the question properly.

**`ensure-mesh-api-subscribed` — overlaps, decide before building.** It reads well (explicit
`orgId`/`projectId`/`workspaceId`, ids validated against injection, structured auth pre-flight),
but `add_console_apis` already subscribes Adobe APIs on the workspace credential. Whether the
mesh API is reachable that way depends on credential type — see the `appbuilder-api-subscription`
skill, which records that mesh needs a specific one. **Answer that before writing a second tool
for the same job.**

## Honest limits of this pass

**Nine of 53 handlers have been read in full**: the six on the build list, plus
`handleGetGitHubRepos` and `handleCheckGitHubAuth` (both dispatch-only) and `handleLoadComponents`
(a duplicate of `list_components`). Reading the six dropped two of them.

Everything else rests on scripts:

| Depth | Count | What it proves |
|---|---|---|
| Read in full | 9 | the verdict |
| Return shape extracted | 9 | what a success path returns, and whether `sendMessage` appears in a 2,600-char window |
| Signal extraction only | 35 | a pattern matched, nothing more |

The build list has now been read, which is what that instruction asked for — and it removed two
of six, one of them for a reason no return-shape check could see (`check-project-apis` shells to
the `aio` CLI's global selection). Treat the 35 signal-only exclusions as maybes rather than a
settled result. The cost of a wrong exclusion is a missed
opportunity; the cost of a wrong inclusion is a tool that cannot fail.
- The `addIntegrationFlowHandlers` entries resolved to their `requireAdobeAuth` wrapper rather
  than the inner handler. Read since: the wrapper prompts unless `quiet`, and two of the five
  (`get-projects`, `get-workspaces`) duplicate existing tools. The three create/delete handlers
  have not been read in full — do that before building them.
