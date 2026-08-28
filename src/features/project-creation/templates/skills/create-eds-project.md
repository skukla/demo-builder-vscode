---
name: create-eds-project
description: Creates a new Demo Builder project from Claude — Edge Delivery (EDS) or headless — end to end without the wizard. Use when the user asks to scaffold, provision, or create a new demo project. Orchestrates the create_project MCP tool, handles Adobe/GitHub/DA.live auth handoffs, narrates per-phase progress, and recovers re-runnable failures.
---

# Create a Demo Builder Project

Provision a new project headlessly with the `create_project` MCP tool — no webview, no
wizard. VS Code must be open on an existing Demo Builder project (that is how this MCP
server is reachable).

## 1. Gather inputs

Required for every project:

- `projectName` — the new project's name
- `package` — demo package id (e.g. `citisignal`)
- `stack` — frontend+backend stack id (e.g. `headless-paas`, `eds-paas`)

EDS stacks (`eds-*`) additionally require:

- `repoName` — GitHub repo to create for the storefront
- `daLiveOrg`, `daLiveSite` — DA.live content destination

If you are unsure which package/stack pair is valid, do not guess. Run `create_project`
once: an invalid pair returns `validStacksForPackage` listing the legal stacks for that
package.

## 2. Run it (provisions cloud resources → requires confirm)

`create_project` creates real cloud resources (a GitHub repo, a DA.live site), so it
requires `confirm: true`. Without it the tool refuses. Confirm with the user before
passing `confirm: true`.

```
create_project projectName="acme" package="citisignal" stack="eds-paas" \
  repoName="acme-storefront" daLiveOrg="acme" daLiveSite="acme" confirm=true
```

## 3. Auth handoffs (`needsAuth`)

Interactive auth cannot be refreshed silently. If `create_project` returns
`{ needsAuth: 'adobe' | 'github' | 'dalive' }`, stop and tell the user which sign-in is
needed. Only after they agree, call:

```
sign_in provider="<adobe|github|dalive>" confirm=true
```

`sign_in` opens a browser/auth window — never call it without the user's go-ahead. Then
re-run the same `create_project` call.

## 4. Narrate progress (`phases`)

An EDS run returns a `phases` timeline; each entry is `{ phase, status, message?, progress? }`
(e.g. `repo` → `dalive` → `config`, then `complete`). Relay these to the user in plain
language as the work proceeds — do not dump raw JSON.

## 4a. Set your Adobe org target — never retry `ORG_MISMATCH`

Demo Builder targets the Adobe org **per operation** — it does not clobber a shared global
setting, so concurrent windows and agents stay isolated. Establish your target before any
Adobe-touching call: `select_org` → `select_project` → `select_workspace`. If `create_project`
(or any Adobe-touching tool) returns `{ error_type: "ORG_MISMATCH", non_retryable: true }`,
**do not retry** — a blind retry hits the same wrong-org 403 and wastes tokens. Surface it:
tell the user to select the correct Adobe organization (or re-login to switch account), then
re-run the call once they have.

## 5. Handle failure (`rerunSafe`)

A failure returns `{ created: false, stage, error, phases, rerunSafe: true }`. The pipeline
is idempotent: fix the cause that `stage`/`error` points to (e.g. re-auth an expired
DA.live token, or wait out a GitHub rate limit), then **re-run the identical
`create_project` call** — completed steps are skipped, not duplicated.

## 6. After success — keep working in place

Success returns `{ created: true, name, repoUrl? }`. The project tools are
project-name-addressed, so you keep working on the new project in the same prompt
(`configure_project`, `sync_storefront`, …) with no window reload. The new project is
now the current project — `get_current_project` resolves to it.

If the user wants to see the project list in the IDE, offer `open_view view="projects"
confirm=true` (confirm first). There is no separate "open project as workspace" step —
the VS Code window stays homed at the projects root.

## Notes

- This MCP server is reachable whenever Demo Builder is open; it serves the home Chat at
  the projects root.
- `create_project` never anchors the workspace — creating a project doesn't reload your
  window.
- Never pass `confirm: true` on the user's behalf for `create_project`, `sign_in`, or
  `open_view` without an explicit yes.

## Handoff

When the run finishes, lead with **one line**: project created and its name (plus the repo URL if there is one). Then the single next action — keep working in this same prompt, or open it (offer, never auto-open). Don't replay the whole phase timeline at the end; your progress narration already covered it. If anything still needs the user (a sign-in, a manual step), state that one thing plainly.
