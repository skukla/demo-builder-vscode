# Promote a shell-built custom app to a GitHub repo

## Provenance

Layer 3 of `2026-07-13-deterministic-integrations.md` (Layers 1 & 2 shipped: `48f637d3`,
`5aa064c8`, `69ea4831`). Split out 2026-07-13 once scoped — it's real feature work, not a
subsection. Gated on the shell build-out story (App Builder app family) maturing.

## Goal

Complete the custom-app lifecycle: **blank shell → build via AI in-project → PROMOTE TO REPO
("save it") → import that repo elsewhere.** Turn an in-project app that started from the blank
shell into a new GitHub repository the user owns, so it's saved/versioned and importable later via
the "Import a repo" kind (Layer 2). This bridges the two ends of the custom-app lifecycle.

## Trigger / UX

A per-integration **dashboard action** — "Save to GitHub" / "Publish" — on a deployed custom app,
alongside deploy / redeploy / remove. **Origin-gated**: offered ONLY for an app that started from
the blank shell (`kind: 'blank'`); an imported repo already has a home, a pre-built catalog
integration isn't the user's to publish. Requires an origin marker on the component (see below).

## The flow (when clicked)

1. **Pick the destination.** Repo name (default from the app/project name, run through
   `normalizeProjectName`/`normalizeRepositoryName`); owner (personal or a GitHub org via
   `GitHubTokenService.getUserOrgs()` — the same picker pattern as the DA.live org picker);
   visibility (see decision #2).
2. **Create the repo** via the GitHub API. `GitHubRepoOperations` already creates repos
   (`createFromTemplate`); add a sibling **create-empty-repo** method (`POST /user/repos` or
   `POST /orgs/{org}/repos`).
3. **Publish the local app.** The component's local dir is tracked in `componentInstances`. Fresh
   `git init` (DROP the shell's shallow/tag-pinned origin — it isn't the user's), a clean single
   "Initial commit", `git remote add origin <new>`, `git push`, via the shell/git executor.
4. **Record it.** Store the new repo on the component (`source` / `appBuilderComponentSources` now
   points at the real repo, mirroring imported apps) + return the URL. Optionally re-point the
   in-project app's source at the new repo so redeploys pull from it.

## Reuses vs. new

- **Reuse:** `GitHubTokenService`/OAuth + `getUserOrgs` (auth + owner picker), `GitHubRepoOperations`
  (repo create), the shell/git executor (commit + push), `normalizeRepositoryName`,
  `componentInstances` (local path), the deploy/remove dashboard-action + handler pattern
  (`DeployAppCommand` / `removeAppComponent` in `@/features/app-builder`).
- **New:** the create-empty + push step, secrets/history hygiene (#1, #3), the `promoteApp` handler
  + dashboard action, and an origin flag on the component so the action gates + doesn't re-create.

## Decisions to make (the non-mechanical parts)

1. **Secrets hygiene — NON-NEGOTIABLE.** The built-out app's local `.env` carries workspace
   credentials. Promote MUST exclude them (generated `.gitignore` + strip `.env` from the pushed
   tree). Load-bearing: the repo is likely public and THIS repo (`skukla/demo-builder-vscode`) is
   public — see the secrets-in-public-repo memory.
2. **Public vs. private repo (the biggest fork).** "Import a repo" (Layer 2 / `appComponentManager`)
   validates a PUBLIC GitHub URL, so public → importable anywhere, zero friction. But a custom demo
   app can be sensitive. Either promote public (simple), OR promote private AND teach the import
   clone to auth with the user's token (bigger — `appComponentManager` clones an unauthenticated
   `https://github.com/owner/repo.git`). Decide before building.
3. **Fresh vs. preserved history.** Recommend a FRESH single-commit history — the shell's shallow
   origin from `skukla/app-builder-shell` shouldn't carry over (avoids leaking the shell remote,
   keeps it clean).
4. **Re-promote.** Once promoted, the action becomes "Update repo" (push changes) or disables.
   Track the promoted repo on the component to decide + so it doesn't re-create.
5. **Token scope.** Repo create + push needs the GitHub token's `repo` scope — verify the existing
   EDS OAuth grant covers it or widen it.

## MCP angle (optional, second)

The shell's build-out is AI-driven, so a `promote_app` MCP tool is a natural fit — the AI "saves
this app to a repo" at the end of a build session (matches the shell's runtime-tooling story). Ship
the dashboard action first; add the MCP tool later (see the `mcp-tool-authoring` skill).

## Constraints
- Never push secrets — non-negotiable (#1). Respect a `.gitignore`; exclude `.env`, node_modules,
  build artifacts.
- Origin-gated: only blank-shell-built apps promote; imported/catalog apps don't.
- Reuse the existing GitHub plumbing (auth, repo create, org picker) — don't re-derive.
- Singular-app model: a workspace holds at most one custom app, so this acts on that one app.

## Kickoff prompt
> Implement `promote_app` per `.rptc/backlog/2026-07-13-promote-app-to-repo.md`: a dashboard action
> on a blank-shell-built custom app that creates a new GitHub repo (owner picker via getUserOrgs)
> and pushes the app's local dir (fresh history, `.env`/secrets excluded), recording the repo on the
> component. Decide public-vs-private first. Reuse GitHubRepoOperations / GitHubTokenService / the
> deploy-action pattern. TDD.
