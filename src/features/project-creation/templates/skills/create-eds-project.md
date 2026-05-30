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

## 5. Handle failure (`rerunSafe`)

A failure returns `{ created: false, stage, error, phases, rerunSafe: true }`. The pipeline
is idempotent: fix the cause that `stage`/`error` points to (e.g. re-auth an expired
DA.live token, or wait out a GitHub rate limit), then **re-run the identical
`create_project` call** — completed steps are skipped, not duplicated.

## 6. After success — offer, never auto-open

Success returns `{ created: true, name, repoUrl? }`. The project tools are
project-name-addressed, so you can keep working on the new project in the same prompt
(`update_project_config`, `sync_storefront`, …) with no window reload.

Only if the user wants the project opened in the IDE:

- `open_view view="projects" confirm=true` — show the project list, or
- `open_project name="<name>" continuationPrompt="<next step>" confirm=true` — anchor the
  project as the workspace and resume. This **reloads the window and ends the current
  Claude session**, so always confirm first.

## Notes

- This MCP server is only reachable with a Demo Builder project open in VS Code.
- `create_project` skips the workspace anchor by design — creating a project never reloads
  your window.
- Never pass `confirm: true` on the user's behalf for `create_project`, `sign_in`,
  `open_view`, or `open_project` without an explicit yes.
