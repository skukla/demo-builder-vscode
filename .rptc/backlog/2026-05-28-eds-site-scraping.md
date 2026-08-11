# EDS site-scraping capability for Demo Builder

## Provenance

Scoped 2026-05-28 during an exploratory research session about how to scrape a
client's website and turn the assets into EDS blocks for demo creation. The
prompt was triggered by the TE (Tyco/te.com) demo project, where the team had
done the "scraping" manually (browser Save Page As, hand-extracted CSS,
Claude-authored block decorators from screenshots + a written spec). The goal
was to replace the manual capture with programmatic capture while keeping the
AI-driven block authoring that already worked.

Deferred because **Mod Agent access requires Adobe provisioning** (Slack
channel `#aem-agent-experience-modernization-users`, ~10 min). Steve has
requested access; users will need to request it too. Phase 1 ships both
workflows but Workflow A is dead UX until access lands, so work pauses until
that provisioning is in place AND the team has used Mod Agent enough to know
which UX rough edges Phase 1.5 should automate.

Research artifacts:
- Adobe ExL MCP queries on Experience Modernization Agent overview, console,
  getting-started, and AEM Cloud Service MCP endpoints
- Internal Slack search confirmed the access provisioning channel + 10-min
  turnaround + that the Mod Agent has NO public MCP endpoint today (web-only
  at `aemcoder.adobe.io`)
- Verified the 5 published Adobe AEM Cloud Service MCP servers at
  `https://mcp.adobeaemcloud.com/adobe/mcp/` (`/content`, `/content-readonly`,
  `/cloudmanager`, `/experience-governance`, `/cloud-migration`) — none scrape
- Web research on SLICC ruled it out (third-party, LLM-key BYOT friction
  incompatible with Demo Builder's auto-install philosophy)

## Goal / Scope

Demo Builder ships a scraping capability that takes a client's live URL and
produces working EDS blocks/dropins matching the reference at **90-95% visual
fidelity** with a capped refinement loop. End-users won't read the code; they
judge by the live site. Adobe Claude Code Enterprise is available, so the
plan can use Claude Code subagents in Phase 2.

**Two workflows ship; user picks at scrape time:**

- **Workflow A — Mod Agent (best quality, semi-automated handoff)**: Demo
  Builder pre-wires the GitHub repo (Phase 1.5 OAuth), opens the Mod Agent
  web console at `aemcoder.adobe.io`, the user iterates conversationally in
  the browser, commits land back in the repo via AEM Code Sync, Demo Builder
  notifies + pulls, then Demo Builder skills add the specialization layer.
- **Workflow B — Playwright MCP (automated, IDE-only)**: `@playwright/mcp`
  installed as a prereq; orchestrator skill drives it through capture +
  token extraction inline; existing AEM skills handle block authoring;
  refinement loop runs inside Claude Code. Lower fidelity ceiling, no
  context switch.

**Achievable fidelity per page type:**
- Marketing/editorial: 80-90% first-pass → 95%+ after iteration cap
- PDP/PLP with commerce dropins: 60-75% first-pass → 85-90% (dropins are
  Adobe-owned React components with a customization ceiling)
- Animations/complex JS: 50-70% (EDS is static-first; trade-off explicit)

## Execution plan

### Phase 0 — Verify access (gating, external)

1. Open `https://aemcoder.adobe.io` in browser; sign in with Adobe ID.
2. If denied → request via Slack `#aem-agent-experience-modernization-users`
   (Adobe employees) or account manager (partners). ~10 min provisioning.
3. Independently: AEM Playground sandbox at
   `https://www.aem.live/developer/aem-playground` (free 30-day).

This is external to the codebase. Document the request flow in
`scrape-reference-site.md` so end-users know where to ask.

### Phase 1 — Prereqs + MCP wiring + skills (~1 day)

Pure config + markdown. JSON-driven; no TypeScript outside one small palette
command.

1. **Add `@playwright/mcp` as a Demo Builder prerequisite.** ~20 JSON lines in
   `src/features/prerequisites/config/prerequisites.json`. Pattern:
   `optional: true`, `depends: ["node"]`, check via `npm list -g
   @playwright/mcp`, install via `npm install -g @playwright/mcp --no-fund`.
   Mention in the description that first Playwright use lazily downloads
   Chromium (~150 MB).
2. **Wire Playwright MCP into `ai-defaults.json`** under `mcpServers[]`
   (project-local entry; command `playwright-mcp`; uses the globally
   installed binary). Optionally add `/content-readonly` MCP server entry
   for projects targeting an existing AEM Cloud Service env.
3. **Six new Demo Builder skills** in
   `src/features/project-creation/templates/skills/`, wired into the
   always-write `Promise.all([...])` in `skillsWriter.ts:80-84`:
   - `scrape-reference-site.md` — orchestrator. ALWAYS asks the user "Mod
     Agent or Playwright?" and branches. Surfaces trade-offs inline (fidelity
     vs context switch).
   - `connect-authenticated-site.md` — guides one-time Playwright headful
     login + `storageState` save for auth-walled pages.
   - `commerce-block-mapper.md` — specialization on PDP/PLP commerce dropins
     (the area Mod Agent explicitly leaves manual). Honestly models what's
     customizable (slots, theming) vs immutable (component internals).
   - `demo-data-injector.md` — replaces scraped real customer data with
     demo mock data; layout-preserving.
   - `header-nav-footer.md` — Mod Agent excludes these from its scope; Demo
     Builder owns the mapping.
   - `refine-visual-match.md` — iteration loop driver. Capped at 3 rounds;
     honest reporting of remaining deltas. No-op for Mod Agent workflow
     (Mod Agent handles refinement internally).
4. **Palette command** `Demo Builder: Open AEM Modernization Agent`.
   ~30 LoC at `src/commands/openModernizationAgent.ts`. Launches
   `aemcoder.adobe.io` in browser with a one-line tip about the current
   project's GitHub repo. Registered in `commandManager.ts`.

### Phase 1.5 — GitHub OAuth integration (~1-2 weeks engineering)

Programmatically install AEM Code Connector + AEM Code Sync GitHub apps on the
project's repo on behalf of the user. Removes the manual GitHub UI step from
the first Mod Agent invocation.

- Register Demo Builder as a GitHub OAuth App (Adobe-owned). Production
  client ID + secret stored in extension secrets at build time.
- OAuth flow: VS Code's `vscode.authentication.getSession('github', ...)` API
  is the cleanest path; fall back to GitHub Device Flow if scopes aren't
  supported.
- GitHub Apps API calls: `PUT /user/installations/{installation_id}/
  repositories/{repository_id}` to grant existing app installations access
  to the project's repo. If the user doesn't have the apps installed at all
  yet, redirect to the app's installation URL once, then complete via API.
- Proactive commit-watch: periodic poll (every 30 sec while a Mod Agent
  session is "in progress") against `/repos/{owner}/{repo}/commits?
  author=<aem-code-sync-bot>`. New commit → VS Code toast with Pull action.

Files to create: `src/features/ai/services/githubAppService.ts`,
`src/features/ai/services/modAgentCommitWatcher.ts`.
Files to modify: `src/extension.ts` (commit watcher lifecycle),
`src/features/project-creation/services/projectFinalizationService.ts`
(provisioning hook).

### Phase 2 — Granular Claude Code subagents (Phase 1 must validate first)

Adobe Claude Code Enterprise gives access to subagents. For the gaps Mod
Agent leaves to manual work, Demo Builder ships its own granular subagents:

| Subagent | Focus |
|---|---|
| `brand-token-extractor` | Color clustering, type scale, spacing, animation timing |
| `commerce-block-mapper` | PDP/PLP dropin theming with the Adobe-React ceiling honestly modeled |
| `nav-header-footer` | Site chrome |
| `demo-data-injector` | Mock data synthesis for demos |
| `auth-state-variants` | Logged-in vs anonymous layout differences |
| `visual-diff-arbiter` | Compares candidate render vs reference; decides what to re-prompt |

Lead orchestrator skill dispatches Mod Agent (if chosen) or Playwright MCP,
then fans subagents in parallel for the gap areas, then aggregates. Capped
iteration applies per subagent.

Files: 6 subagent definitions in
`src/features/project-creation/templates/agents/`. Update
`scrape-reference-site.md` to dispatch.

### Phase 3 — Future

Pick up when real demand surfaces:
- **Programmatic Mod Agent invocation** once Adobe publishes its MCP endpoint
  (RTCDP, Marketo, AEM content already done — directional).
- **Firecrawl / Browserbase MCP fallbacks** for anti-bot sites.
- **Pre-saved-bundle input mode** (TE-style local folder) for sites
  Playwright can't reach.
- **Multi-page site crawl** (current scope is per-page).

## Constraints

- **All in Demo Builder extension** (chosen architecture). Skills + prereqs +
  GitHub OAuth + palette commands all live in `demo-builder-vscode`. No
  separate npm package or new VS Code extension. Reuses every existing
  pattern.
- **Adobe Fonts + licensed webfonts**: do not auto-redistribute paid fonts.
  Skills must check license and either map to Adobe Fonts kit IDs or fall
  back; surface licensed-font warnings clearly.
- **Robots.txt + ToS**: Playwright can scrape anything Playwright reaches.
  Skill prompts must document scope: "for building demos of YOUR OWN site
  or with explicit permission."
- **Dropin customization ceiling**: 60-75% first-pass on PDP/PLP is real —
  Adobe owns those React components. Skills must honestly say "this section
  uses Adobe's product detail dropin, themed to match" rather than silently
  degrade.
- **Iteration cap honesty**: When 3 iterations don't converge,
  `refine-visual-match.md` reports remaining deltas faithfully.
- **`.scraped/` storage**: Playwright captures can be large (TE was 26 MB
  per page). Add `.scraped/` to `.gitignore` template for generated projects.
- **Explicitly NOT used**: SLICC (Apache-2.0 third-party, LLM-key BYOT
  configuration friction; Playwright MCP with stored auth state covers the
  auth-wall case more cleanly).

## Kickoff prompt

> Pick up the EDS site-scraping plan in
> `.rptc/backlog/2026-05-28-eds-site-scraping.md`. **Phase 0 first** — verify
> Mod Agent access at `aemcoder.adobe.io` (Steve's request was filed
> 2026-05-28; check status). If access is live, ship Phase 1 (config +
> markdown only, ~1 day): the `@playwright/mcp` prereq, the
> `ai-defaults.json` wiring, the six skills, and the `Open AEM Modernization
> Agent` palette command. Skip Phase 1.5 until you've used Workflow A
> end-to-end and know which UX rough edges actually need automating. Pause
> before Phase 2 to validate Phase 1 fidelity against three reference URLs
> (marketing page, public PDP, public PLP).

## Verification (when active)

- **Phase 1**: New project's prereqs step shows Playwright MCP entry;
  install succeeds. `.mcp.json` includes Playwright MCP entry.
  `.claude/skills/` contains six new skill files.
- **Phase 1 manual Workflow A test**: User works in `aemcoder.adobe.io`,
  commits blocks to GitHub, pulls locally, runs commerce-block-mapper +
  demo-data-injector skills. Verify final visual match against reference.
- **Phase 1 manual Workflow B test**: Invoke `scrape-reference-site.md` in
  Claude Code against a public marketing page. Verify Playwright captures
  the bundle; downstream skills produce working block .js + .css. Measure
  first-pass match % and iterations to 90%.
- **Targets**: 80%+ first-pass for marketing pages; 60-75% first-pass for
  PDP/PLP; convergence to 90%+ within the 3-iteration cap on both.
- **Existing Jest suite stays green** (Phase 1 is pure config + markdown;
  no code touched outside `skillsWriter.ts`, `commandManager.ts`, and config
  files).

## Out of scope

- Demo Builder UI for scraping (no wizard step, no Configure panel surface).
  The flow is AI-driven from inside Claude Code; the skills + prereqs + MCP
  wiring are the entire surface.
- Replacing Adobe's AEM skills (`aem-block-developer` et al.). They work;
  we orchestrate them.
- Building our own scraping/token-extraction/font-download MCP tools. Mod
  Agent does this in Workflow A; Playwright MCP + skills handle it in
  Workflow B. Reconsider only if a specific deterministic transform proves
  expensive to re-derive every run.
- Pixel-perfect-or-die. Capped iteration is honest about its ceiling.
- Replacing the manual TE workflow. The TE artifacts stay as-is — this plan
  describes the future flow.

## Cross-references

- Plan file (full detail): `/Users/<user>/.claude/plans/quizzical-purring-turing.md`
  (machine-local; the source of this backlog item)
- ADR-004 (`docs/architecture/adr/004-claude-code-harness.md`) — three
  amendments record the harness journey that led to this scraping plan
- `.rptc/backlog/README.md` — backlog index
