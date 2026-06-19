# App Builder app — scaffold-and-author (create new, design with AI)

> **Status: BLOCKED on slice 1** ([spine](2026-06-17-appbuilder-app-deploy-spine.md)). Slice 4 of 5.
> The only slice with substantial NEW surface (init + authoring + code home + repo decision).

## Provenance

Designed 2026-06-17 alongside the App Builder app-structure research
([`../research/app-builder-app-structure/research.md`](../research/app-builder-app-structure/research.md)).
Use case 1 from the design conversation: a brand-new app with **no repo yet**, designed by the user
**with AI and the project skills** (e.g. "Commerce backend + a custom App Builder app I build out").

## Goal / scope

Scaffold a fresh App Builder app into the demo, let the user author it with Claude (leveraging the
App Builder skills already available — `appbuilder-project-init`, `appbuilder-action-scaffolder`,
`appbuilder-ui-scaffolder`, `appbuilder-testing`), then deploy it through the slice-1 spine.

**In scope:**
- **Scaffold** via non-interactive `aio app init` (`--standalone-app -y -o <org> -p <project>
  -w <workspace>`, `--no-install` as appropriate). Produces `app.config.yaml`, `src/`, `actions/`, etc.
- **Multi-package authoring fit** — the scaffold should make it easy to add domains as packages
  (`runtimeManifest.packages`), per the decided code-structure model (one app, N packages).
- **AI authoring loop** — ensure the App Builder skills reach the project's `.claude/skills/` so the
  user's Claude session can build the app (the extension already scaffolds `.claude/skills/`).
- **Deploy** through the slice-1 `deployAppComponent`.

**Out of scope (decide explicitly in planning):**
- **GitHub repo creation.** Two options — (a) v1: scaffold into a project subfolder, deploy from local,
  no repo (cheapest); (b) programmatic GitHub repo create (the same OAuth lift flagged ~1–2 weeks in
  the EDS-scraping backlog Phase 1.5). **Lean: (a) for v1, repo creation as a later "publish" action.**

## UX / interaction — ⚠️ NEEDS A DESIGN PASS

The create + AI-authoring handoff is the most open UX in the family: how scaffold progress is shown,
the "now build it with Claude" handoff, and how the user returns to deploy. Run a design-discussion
pass before the plan locks. Reuse the existing **Open-in-Claude** terminal delivery (the
`reference_claude_terminal_prompt_delivery` memory — spawn via `claude --continue -- '<prompt>'`, no
timed paste) for the authoring handoff rather than inventing one.

## Reuse / refactor-for-reuse

- Reuse `componentInstallation` clone plumbing and the slice-1 `deployAppComponent` for the deploy tail.
- Reuse the `.claude/skills` scaffolding (`skillsWriter`) + the existing App Builder skills
  (`appbuilder-*`) for the authoring loop, and the Open-in-Claude launch path.
- New only: the non-interactive `aio app init` wrapper + (deferred) GitHub publish.

## Execution plan (high level)

1. Decide code home (subfolder vs new repo) — lean subfolder for v1.
2. Non-interactive `aio app init` integration (targeted at the demo's existing org/project/workspace).
3. Ensure App Builder skills + AGENTS guidance are present for the authoring session.
4. Deploy the authored app via the slice-1 spine; persist `appState`.
5. (Later) GitHub "publish" action if repo creation is wanted.

## Constraints / risk

- `aio app init` is interactive by default — pin the non-interactive flags and the org/project/workspace
  targeting (it must land in the demo's workspace, not prompt).
- Authoring quality depends on the project skills being present and current (relates to the AI-Ready
  skills-drift backlog item).
- Keep scaffolding aligned with the one-app/multi-package model so authored domains are packages.

## Kickoff prompt

`/rptc:feat "Add scaffold-and-author for App Builder apps (slice 4). Non-interactive aio app init into
the demo's existing org/project/workspace (--standalone-app -y -o -p -w), structured for the
one-app/multi-package model; ensure the App Builder skills reach .claude/skills/ for the AI authoring
loop; deploy the authored app via the slice-1 spine. Decide code home (lean: project subfolder for v1,
no GitHub repo creation — defer that to a later publish action). See
.rptc/backlog/2026-06-17-appbuilder-app-scaffold-author.md and
.rptc/research/app-builder-app-structure/research.md."`
