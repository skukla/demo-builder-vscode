# First App Builder app — AI-built shell + runtime API access

**Status:** Planning (created 2026-07-09 from Steve's direction during the slice-3 staleness research)
**Supersedes as "first app":** the package-bound slice-3 example binding (which research showed
has no meaningful activation data — see step-05 and
`.rptc/research/appbuilder-slice3-staleness/research.md`).

## The idea

Ship a catalog entry that gives the end user an **App Builder app shell** — a minimal,
deployable app they then build out with AI (Claude) after creation. Example use case: the
user knows they want to connect Adobe Commerce to Adobe Firefly Services but hasn't settled
the exact behavior; they pick the shell at creation and design the integration in-chat later.

This exposes one real capability gap and one tooling gap:

1. **Runtime API access (the gap).** A shell's future APIs are unknown at catalog-authoring
   time, so `requiredApis` can't cover them. When the user later says "Commerce + Firefly,"
   the AI must be able to ADD Console API access to the demo workspace credential itself.
   Today the subscription primitive exists only on the creation path
   (`src/features/app-builder/services/apiSubscriber.ts` — union-reconcile of
   `requiredApis` + baseline via `subscribeOAuthServerToServerIntegrationToServices`);
   nothing exposes it to the AI session (verified: no MCP tool touches it).
2. **Developer Agent tooling (the gate bug).** The Adobe Commerce Extensibility Developer
   Agent (per developer.adobe.com/commerce/extensibility/developer-agent: agent skills + the
   App Builder MCP server) is ALREADY what ai-defaults installs — the `commerce-extensibility`
   entry (`@adobe-commerce/commerce-extensibility-tools`) in
   `src/features/project-creation/config/ai-defaults.json`. But it is gated on an **EDS
   storefront** being present (`mcpConfigWriter.buildMcpConfig` skips all ai-defaults MCP
   entries when `resolveStorefrontPath` is empty; the Adobe skills bundle rides the EDS
   component's `aiSkillBundle`). Headless / mesh / app-builder-only projects — exactly the
   projects that need App Builder tooling — get none.

## Verified current state (2026-07-09)

- Catalog + spine (slices 1–2) handle everything downstream: a `kind: 'integration'` entry
  is subscribed (`reconcileRequiredApis`), cloned+installed, deployed (`aio app deploy`
  under `withOrgContext`), persisted to `project.appBuilderComponents`, and rendered as a
  dashboard card (`AppBuilderComponentsList`). Creation Phase 3b
  (`executor.ts:542-589`) already consumes `selectedAppBuilderComponents`.
- The wizard's Add-an-Integration modal lists catalog `kind: 'integration'` entries — the
  shell appears there with zero UI work.
- `getServicesForOrg` exists on the auth service surface (org service catalog discovery).
- In-extension MCP tool surface (file-based + descriptor tools) has NO API-subscription or
  service-catalog tool.
- ai-defaults MCPs install into the isolated `<project>/.demo-builder-mcp/` dir
  (`installAiDefaultsMcpTools`), already decoupled from any storefront manifest.

## Steps

- [x] **Step 1 — Un-gate the Developer Agent tooling** (`step-01.md`): DONE (pending
      commit). `requires` field on ai-defaults entries + `aiToolingGate.ts` predicate,
      applied at buildMcpConfig / installer / orchestrator / regenerate; the
      `integration-starter-kit` skills bundle (prefix `appbuilder`) copies from the
      isolated tools dir; `AI_CONTEXT_VERSION` bumped to 2 so existing mesh/headless
      projects flag "AI files out of date" and receive the tooling on regenerate.
      Playwright stays EDS-gated.
- [x] **Step 2 — Shell template repo + catalog entry** (`step-02.md`): catalog entry +
      tests landed; shell content authored and committed locally (scratchpad) — **repo
      creation pending Steve** (`gh repo create` of a PUBLIC repo is blocked in auto mode;
      run: `gh repo create skukla/app-builder-shell --public --source <scratchpad>/app-builder-shell --push`).
      Found+fixed a real regression the unrestricted entry exposed:
      `ensureMeshApiSubscribed` treated "any catalog row matches the axes" as "a mesh
      needs subscribing" — now filters `kind === 'mesh'` (the shell matches every axis,
      including the empty selections in tests).
- [x] **Step 3 — Runtime API access MCP tools** (`step-03.md`): DONE (pending commit).
      `consoleApiHandlers.ts` (dashboard handler map) + read/action descriptor rows;
      reuses `subscribeRequiredApis` under the exported `runGuards` chain;
      `Project.additionalConsoleApis` persists AFTER a successful subscribe and is
      unioned into both reconcile call sites (runner deps + mesh pre-deploy).
      `list_console_apis` flags managed codes from the union (no live credential
      read — avoids a write-on-read via ensureOAuthCredentialId).
- [ ] **Step 4 — AI guidance + end-to-end verification** (`step-04.md`): teach the flow
      (AGENTS.md section + skill) and walk the Firefly use case live.
- [ ] **Step 5 — Backlog corrections from the slice-3 research** (`step-05.md`): rescope
      the package-bound item; prune the stale persistence item.

## Open decisions (settle before step 2/3 execution)

1. **Shell repo home + name** — DECIDED 2026-07-09: `skukla/app-builder-shell` (public).
2. **Ad-hoc API persistence** — recommend YES: a manifest field (e.g.
   `appBuilderComponents[id].additionalApis` or project-level `additionalConsoleApis`)
   unioned into `reconcileRequiredApis`, otherwise the next component add re-reconciles and
   drops the AI-added subscription.
3. **Service-code discovery** — no hardcoded Firefly codes; `list_console_apis` returns the
   org's live entitlement list (`getServicesForOrg`) and the AI matches by name. Org
   entitlements differ; hardcoding would rot.

## Constraints

- Public repo: the shell template carries no secrets; env vars route through the existing
  `envSchema` mechanism if ever needed.
- Reuse, don't fork: `apiSubscriber` stays the one subscription implementation; the MCP
  tools are thin handler-backed descriptors like the existing deploy tools.
- The shell entry uses slice-2 mechanics unchanged — no new catalog kinds, no binding
  (package-binding stays deferred per step-05).
