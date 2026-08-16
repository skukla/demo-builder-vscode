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

Signals extracted mechanically, then the candidates READ — because static classification was wrong
three separate times in the session that produced this file, twice with a passing control.

| Class | Count | Why it is not a tool |
|---|---|---|
| **Dispatch-only** | 21 | Pushes its result through `context.sendMessage` and returns a bare `{success:true}`. Exposing one hands an agent a tool that cannot fail and carries no answer. |
| **Bare status** | 15 | Returns `{success:true}` with no payload — same problem, without even the webview push. |
| **Interactive** | 1 | Opens a modal on the happy path (`storefront-setup-cancel`). |
| **Candidates** | 15 | Return an outcome. Read individually below. |
| **Unresolved** | 1 | `ready` — a lifecycle hook, not a feature. |

Reading the 15 candidates moved four of them: `getProjects` and `re-detect-context` push through
`sendMessage`, and `update-component-selection` / `update-components-data` return bare success.
The signal extractor over-called them, which is the expected failure and the reason for reading.

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
| `create-adobe-project` | — | via the `quiet` path; prerequisite for all App Builder work |
| `create-adobe-workspace` | — | same |

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

- The 15 candidates were read. The 36 dispatch-only / bare-status were classified by signal
  extraction with two verified by reading (`handleGetGitHubRepos`, `handleCheckGitHubAuth`, both
  confirmed dispatch-only). **A handler in that group could be misclassified**; the cost is a
  missed opportunity, not a bad tool.
- The `addIntegrationFlowHandlers` entries resolved to their `requireAdobeAuth` wrapper rather
  than the inner handler. Read since: the wrapper prompts unless `quiet`, and two of the five
  (`get-projects`, `get-workspaces`) duplicate existing tools. The three create/delete handlers
  have not been read in full — do that before building them.
