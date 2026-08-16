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

## The worklist for steps 03–04

**Build (returns an outcome, capability not otherwise reachable):**

| Handler | Returns | Note |
|---|---|---|
| `create-github-repo` | `{owner, name, url, fullName}` | closes the create/delete asymmetry |
| `check-project-apis` | `{hasMesh}` | narrow, but answers "is a mesh already provisioned" |
| `ensure-mesh-api-subscribed` | `{apis}` | check first whether `add_console_apis` already covers it |
| `checkCompatibility` | `{compatible}` | pre-flight before `create_project` |
| `create-adobe-project` | **not examined** | via the `quiet` path; prerequisite for all App Builder work |
| `create-adobe-workspace` | **not examined** | same |

**Do not build (capability already reachable):** `loadComponents`, `get-components-data` and
`loadDependencies` return the component catalog, which `list_components` / `list_demo_packages` /
`list_stacks` already expose. `exportProject` delegates to `exportProjectSettings`, which
`export_project_settings` already exposes. `get-projects` and `get-workspaces` duplicate
`list_adobe_projects` / `list_workspaces`. All verified by reading both sides, not by name.

**Do not build (disqualified):** the 21 dispatch-only, 15 bare-status and 1 interactive. Fixing
those means changing the HANDLER to return its payload — a bigger change than a tool, and one the
webview would have to keep working through. Worth doing per-handler when a real need appears, not
as a sweep.

## Honest limits of this pass

**Three of 53 handlers were actually read**: `handleGetGitHubRepos`, `handleCheckGitHubAuth` (both
confirmed dispatch-only) and `handleLoadComponents` (confirmed a duplicate of `list_components`).

Everything else rests on scripts:

| Depth | Count | What it proves |
|---|---|---|
| Read in full | 3 | the verdict |
| Return shape extracted | 15 | what a success path returns, and whether `sendMessage` appears in a 2,600-char window |
| Signal extraction only | 35 | a pattern matched, nothing more |

That is thin for a phase that decides what to build, and the session producing it had three
static classifiers give confident wrong answers — one of which ran `republish` against a live
storefront. **Read each handler on the build list before building it**, and treat the 35 as a
list of maybes rather than a settled exclusion. The cost of a wrong exclusion is a missed
opportunity; the cost of a wrong inclusion is a tool that cannot fail.
- The `addIntegrationFlowHandlers` entries resolved to their `requireAdobeAuth` wrapper rather
  than the inner handler. Read since: the wrapper prompts unless `quiet`, and two of the five
  (`get-projects`, `get-workspaces`) duplicate existing tools. The three create/delete handlers
  have not been read in full — do that before building them.
