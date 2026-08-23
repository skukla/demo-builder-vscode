# Backlog — Future Work

Plans for features, fixes, and improvements that aren't active yet. Each file is a self-contained plan with the context, scope, and kickoff prompt needed to pick the work up later — possibly months later, possibly by a different agent.

This directory is the **single source of truth** for "what's next." If it belongs here it should not also live in TODO files, the CHANGELOG, or scattered code comments.

## Conventions

- **Shape**: a single file `<topic-slug>.md` for an idea, OR a directory `<topic-slug>/` for an already-structured RPTC plan that's paused (overview + step files).
- **Filename**: `<topic-slug>` or `YYYY-MM-DD-<topic>` — date prefix when the deferral date matters (e.g., the item was scoped during an audit and you want the snapshot date visible).
- **Required sections** (for single-file entries): Provenance · Goal/Scope · Execution plan · Constraints · Kickoff prompt.
- **Before filing, grep `.rptc/plans/` as well as this directory.** An active plan for
  the same work is the more likely home, and a backlog duplicate splits the record. On
  2026-08-07 an item was filed here for work `.rptc/complete/integrations-destination-control/`
  had covered since 2026-08-03, including the very question the session was answering.
- **Promotion**: when an item becomes active, move it to `.rptc/plans/<topic-slug>/`.

## Lifecycle

```
draft  →  ready  →  active  →  shipped/dropped
  │         │          │            │
  │         │          │            └─ move the file to .rptc/complete/ (archive;
  │         │          │               git history holds the full implementation record)
  │         │          └─ move to .rptc/plans/<topic-slug>/ (multi-step) OR
  │         │             promote in place when starting work
  │         └─ ready for execution; pick up any time
  └─ idea capture, may still change shape
```

> **Index last reconciled: 2026-08-23** (FOURTH pass — the first FULL re-measure: every
> active item's central claim checked against the code by four parallel read-only agents,
> each claim paired with the command that would falsify it and a positive control on every
> absence). Score across 33 items measured: **10 fully current, 5 dead (archived same day:
> Model A seed, site-access tools, AI-surface phase 4, data-installer writes, Code Sync
> reference + the org-context residual entry), 12 partially dead (entries rewritten in
> place with dated re-measure notes), 6 current-with-stale-citations or gated.** The
> third pass's age rule held perfectly: everything filed on a re-measure day stayed true;
> the 2026-06→08 age band was again a coin flip. Two new lessons: (a) an item can die in
> NINE DAYS (site-access, filed 08-14, shipped by phase 4 before 08-23); (b) a proposal
> can be built AND reverted between reconciles, leaving the index advertising as "proposed"
> something the code now argues against (the install-click gate). The re-measure-before-
> pickup rule is not optional at ANY age.
>
> **Previous: 2026-08-13** (THIRD pass — a claim-validation pass; see below).
> The second pass verified in both directions with a control for each: 65 links, 0 dead;
> 38 items, every one reachable from a `####` entry or as a numbered slice inside one.
>
> ### The third pass checked whether the entries were TRUE, and five were not
>
> Structure and truth are different properties. The first two passes established that every
> link resolves and every item is reachable — and every one of those findings still holds.
> Neither pass asked whether the described defect still existed, so **five items were
> describing work that had already shipped**, one of them ranked first on a
> pick-your-next-task list minutes before it was checked.
>
> The 14 actionable items were validated against `src/` on 2026-08-13. Result: **5 shipped**
> (now archived — see "Archived 2026-08-13" below), **1 premise stale**
> (`legacy-soft-deprecation`: ~2.5 months out of date, re-scoped in place), **1 partly
> overtaken** (`third-party-tooling-visible-and-optional`), **6 confirmed accurate**, and
> **1 spot-checked only** (`appbuilder-deployable-model` — treat as unverified).
>
> **The predictor is age, not topic.** Everything filed 2026-08-13 measured true. Everything
> filed 2026-07-29 → 2026-08-11 was roughly a coin flip. The mechanism is simple and will
> recur: a fixing commit touches `src/` and `tests/`, never `.rptc/`, so nothing in the
> workflow makes the item's death visible. The hygiene scan cannot catch this — a shipped
> item's links resolve perfectly.
>
> **So before picking an item up, re-measure its central claim.** Two of the five had counts
> in them (`19 references`, `zero of 13 skills`); both took one command to disprove. And note
> the trap in the entry that read "verified 2026-08-13" — that was a re-assertion of the
> item's own text, not a re-measurement.
>
> **That rule has a known blind spot, stated here so it is not read as a clearance.** It is
> cheap only when you already know which command falsifies the claim. An item naming a SYMBOL
> (`stripSecretValues`, `legacyLookupKey`) or asserting a COUNT is one grep away. An item
> asserting a SHAPE — "X and Y are two implementations of the same thing", "nothing links A to
> B" — has no such command, and a stale one would survive this rule untouched. Every item
> caught so far has been a symbol or a count, which may say more about the detector than about
> the backlog.
>
> **Read that last sentence literally.** These are not three kinds of staleness; they are two
> kinds of staleness and one kind of *detectability*. A shape claim rotting is not a different
> failure — it is the same failure with no instrument pointed at it. So the honest state of
> this backlog is **"no evidence of shape rot"**, never "no shape rot", and from here those two
> look identical. That is the `|| echo "none"` ambiguity this repo keeps re-learning, applied
> to this very table.
>
> The reason there is no instrument is probably not laziness: a shape claim requires holding
> both shapes in mind at once, which is judgement rather than grep — the same reason
> `architecture-duplication-scan` is a guided review and not a scanner. So the detector for
> shape rot is **a person deciding to look, on a schedule**, which is the shape `dream` and
> `codebase-sweep` already have. Do not expect a hook to cover it.
>
> **And being well-written is not evidence of being current.** The most credible-looking of
> the five — precise `file:line` table, traced chain, quoted MCP description — is the one that
> later fooled a second session into building on it. Those signals record how carefully
> somebody checked *on the day they wrote it*. The `file:line` table is actively the worst of
> them: line numbers here have a half-life of about a day, so a precise citation reads as more
> reliable and is less.
>
> The first pass checked only that links resolve. That is half a reconcile, and it hid four
> things: three plan directories moved in from `plans/` with **no index entry at all**
> (`appbuilder-deployable-model`, `integrations-host-contract`,
> `per-integration-api-attribution` — filed then; `integrations-host-contract` has since been
> archived as shipped), `ai-surface-coverage` filed under **Live
> defects** because it was inserted against a convenient anchor rather than a correct one, and
> `hybrid-storefront-model` sitting under "In flight" while gated on a live B2B backend.
> A bulk path-rewrite had also produced `../backlog/…` links from files already inside
> `backlog/` — resolvable, so invisible to a dead-link check, and collapsed now.
>
> **Section A was renamed.** "In flight (active front)" is a contradiction in a backlog: by
> definition nothing here is in progress. It now says so.
>
> `.rptc/plans/` holds `data-installer` and this handoff's sibling. Five shipped plans were
> archived to `complete/` in the same pass and `mesh-staleness-scope` was dropped outright.
>
> Descriptions still drift between audits — when in doubt, trust the code and `git log`.

## Recently shipped (archived to `../complete/`)

Verified merged to `develop` and moved out of `.rptc/plans/` during the 2026-06-19 reconciliation. Listed here only as a pointer; git history holds the record.

- **Thin-layer storefront (ADR-006)** — code-patch engine v2, LKG-pinned create/reset, CitiSignal cutover to canonical; the two storefront forks are retired. (`7ddb6c3d`, `d5c2340c`, `5cfb5b68`, `8cee8984`)
- **Content-copy completeness (ADR-010)** — follow document references so dropped content (e.g. `/customer/nav`) is copied; post-copy completeness audit. (`68165492`, `793a565f`, `0cd032ae`)
- **Adobe org-context self-heal** — `ensureOrgContext` + proactive mismatch detection + forced-switch recovery; in-app org picker removed. (merge `493aef17`) — see residual below.
- **IMS org-mismatch notification** — action-time org-context gate + Switch IMS Org feedback. (PR #51, `15bc2c2b`)
- **Unify mesh deploy pipeline** — dashboard deploy delegates to the shared deploy core. (PR #52, `d7f993e2`, `b2f21a57`)
- **PDP reversible SKU encoding (ADR-007)** — Helix-safe `_HH` encoding for PDP URLs. (merge `fb978281`)
- **Experience Workspace default authoring** — per-project authoring experience as a Configure setting. (merge `92101734`)
- **MCP affordance coverage** — all five agent-tool gaps closed 2026-07-11: `get_project_urls`, `deploy_mesh`, `deploy_integration`/`redeploy_integration`/`remove_integration`, `refresh_block_library`, and `export_project_settings` (write-a-file action; secrets to disk, not the response). ([`../complete/2026-07-11-mcp-affordance-coverage.md`](../complete/2026-07-11-mcp-affordance-coverage.md))
- **Wizard org-context follow-ups** — 2026-07-13. Shipped the real residual: `testDeveloperPermissions` now targets the token org via `withOrgContext` + a defensive project omit on auth cache-miss ([`../complete/2026-07-01-wizard-org-project-mispairing.md`](../complete/2026-07-01-wizard-org-project-mispairing.md)). The multi-org guard item was **closed as overtaken** — its premise contradicts the canonical single-reachable-org model ([`../complete/2026-07-01-wizard-multi-org-selection-guard.md`](../complete/2026-07-01-wizard-multi-org-selection-guard.md)).

- **parseJSON call-site audit** — 2026-08-21, closed same day with verdict NOT A SMELL: all 33 sites read; own-file reads all fall back with logs, the aio-CLI bucket is the most defensive code in the repo (routine failure forced defense long ago). Lessons recorded in the sweep: counts nominate, reading decides; drift hides where nothing ever visibly fails. Note: `parseJSON`'s optional guard parameter has zero users — future strict sites should use it. ([`../complete/2026-08-21-parsejson-call-sites-are-unchecked-casts.md`](../complete/2026-08-21-parsejson-call-sites-are-unchecked-casts.md))
- **Partial HandlerContext narrowing** — 2026-08-21, all seven sites same day. Every non-panel entry point that cast a few-field context to the full ~15-field `HandlerContext` traced; every callee now declares the fields it actually reads (`Pick<>`), so the casts are gone and a callee growing a new dependency breaks compilation instead of receiving `undefined`. The headlessHandlerContext prose claim became a measurement (zero non-optional-chained reads of the three absent fields; they were already optional, so its casts never needed to exist). No live gaps found. ([`../complete/2026-08-21-partial-handler-contexts-cast-to-full.md`](../complete/2026-08-21-partial-handler-contexts-cast-to-full.md))
- **Bundled-config contract validation** — 2026-08-21, both halves same day. Every `*.schema.json` now validates its sibling's REAL data (`config-contracts.test.ts`; the old suites only schema-checked demo-packages), and every config also validates against a schema GENERATED from the TS interface its load-site cast claims (`config-interface-contracts.test.ts`, ts-json-schema-generator) — so schema, interface and data can no longer diverge anywhere the shipped data exercises. Day-one catches: components.schema.json was unparseable JSON describing the pre-v3 format; prerequisites' install schema described three retired formats with an always-failing oneOf; `RawComponentDefinition`/`ServiceDefinition` required `id` fields no raw entry carries; two dead components.json sections (brands/stacks) and six dead fields deleted. ([`../complete/2026-08-21-bundled-config-json-is-cast-not-validated.md`](../complete/2026-08-21-bundled-config-json-is-cast-not-validated.md))
- **Webview payload typing** — 2026-08-20, all five steps plus step 0. Every `getInitialData` producer and its webview consumer now check against one declaration in `src/types/webviewPayloads.ts`; `BaseWebviewCommand<TInitialData>` is generic and the four `MessagePayload` casts are gone; the display-name brand crosses the boundary. Fixed on the way: the dashboard entry was the one tsx file tsc never checked (`index.ts` shadowed `index.tsx`; now `main.tsx`), which hid the dead `brandName` read that blanked the dashboard subtitle's package name, and the Configure entry never delivered `componentSecretFlags`. ([`../complete/2026-08-20-webview-payloads-are-typed-then-cast-away.md`](../complete/2026-08-20-webview-payloads-are-typed-then-cast-away.md))

Also resolved since last index (now archived to `../complete/`): **oversized test-file splits** (0 `max-lines` warnings — the rule skips blanks/comments, and the worst file counts 481 of 500), **regenerate-AI-files progress** (shipped as `aiRegenProgress` in `useDashboardStatus.ts`; the old note pointed at a `creationProgress` symbol in `features/ai/handlers/`, a path that has since moved to `features/dashboard/handlers/`), **logs-toggle → sidebar**, and **B2B feature-pack dropin delivery**. The **DaLive permission-log "typo"** was a false positive — deleted outright rather than archived, since there was never anything to do.

The `jest worker force-exit` warning (once wrongly listed here as resolved, then reopened) is now genuinely CLOSED — diagnosed 2026-08-23 as jest-worker's hardcoded 500ms deadline, not a leak; see the 2026-08 archive section.

---

## Active backlog

### A. Active front (nearest to actionable — nothing here is in progress)

#### Bodea's shared catalogs assign identical categories ([`2026-08-17-bodea-shared-catalogs-are-undifferentiated.md`](2026-08-17-bodea-shared-catalogs-are-undifferentiated.md))

**Measured, and it changes what the Bodea demo can claim.** All three shared catalogs — Default (General), ServerSavvy Solutions, Platinum Buyer — assign the SAME 11 categories, compared as sets against the live service. So a nav driven by shared-catalog assignment, which is the correct mechanism, would render an identical menu for every company and group: the mechanism is right and the data has nothing to express. This is the real reason VIP nav gating was deferred; the "no clean patch insertion point in header.js" reason recorded in the plan is true but secondary. What the pack DOES demonstrate is price, not visibility — 49 of 56 products carry `tier_prices` naming "Platinum Buyer". Also records why `bodea-customer-group.js` is NOT redundant with shared catalogs: the catalog decides what the price is, the module tells Catalog Service who is asking, and deleting it silently shows guest prices to everyone, which looks like the demo working. If catalog-driven menus are wanted it is a DATA change first (differentiate the catalogs), then a new nav block reading Catalog Service — never a gate over the authored `/nav` document, which would drift toward showing what should be hidden. Filed 2026-08-17.

#### Move deliberately to a per-SC Adobe I/O project ([`per-sc-io-project.md`](per-sc-io-project.md))

**Retire the separately-deployed shared service; each SC gets their own Adobe I/O project.** Five items: (a) the `demo-builder-s2s` credential — **CANNOT MOVE**, settled 2026-08-16; (b) store discovery; (c) prerender — **a separate research item, do not decide it here**; (d) a single SC-built mesh and (e) SC-built integration packages, both **already built**, which is what makes this credible rather than speculative. (a) cannot move, and the reason turned out to be entitlement rather than reach: a credential in the Solution Led Commerce SC org cannot be subscribed to `ACCS-REST-API` at all — the service carries no product profile there (control: twelve other services in that org DO offer products), and the subscribe is refused inside an HTTP 200. The subscription IS the entitlement, so such a credential never gains `commerce.accs`. Measured 2026-08-16, both orgs compared: `.rptc/complete/data-installer-credential-broker/step-05.md`. **Three things must exist first, all verified 2026-08-16:** no notion of a REQUIRED deployable in the catalog schema (one entry today, `app-builder-shell`); no upgrade path for a deployed integration (staleness detection is mesh-shaped — **the cost centre**, since today one deployment serves everyone and a fix ships once); and no dedup, so two demo projects sharing a workspace each believe they own the deployment and the second deploy silently overwrites the first. D1 shipped; D2–D6 pending. What it buys: retires four actions, an AES-256-GCM per-site key store, a drift checker, the org-keyed `accsDiscovery.services` setting, and `byom.overlayUrl` — which today ships a stage Runtime endpoint as a default in this PUBLIC repo. Filed 2026-08-16.

#### `executeEdsPipeline` is a 254-line orchestrator at complexity 27 ([`2026-08-19-eds-pipeline-orchestrator-complexity.md`](2026-08-19-eds-pipeline-orchestrator-complexity.md))

**A complexity item, not a decomposition one — and the distinction is the finding.** `edsPipeline.ts` is 839 lines and was briefly filed as a god file on size alone; `decompose-god-file`'s own coupling test rejects it (5 non-type imports against a >15 signal, ONE public export against >10, a single entity domain), and its rule is "threshold without coupling → leave it". Decisively, **splitting the file would not move the number the eslint warning is about**: all 27 branches are step-gating inside `executeEdsPipeline` itself (`clearExistingContent`, `skipContent`, `contentSource`, `includeBlockLibrary`, `purgeCache`, `skipPublish`, `libraryPaths.length`, `byomOverlayUrl && project`, plus nested try/catch), and extracting the eight private helpers leaves every one of them. The fix is a declarative step list, which collapses the orchestrator to a loop. **Not a quick win:** this is the shared spine of create, reset AND refresh-block-library, all provisioning real cloud resources, and two things need settling first — the steps share mutable locals that a step list must make an explicit context, and their error semantics deliberately differ per step. Filed 2026-08-19.

#### Files over the god-file threshold ([`eds-services-over-size-threshold.md`](eds-services-over-size-threshold.md))

**Re-measured 2026-08-19 and the item was pointed at the wrong files.** It was opened on `configurationService.ts` (532) and `edsResetService.ts` (343) — the two SMALLEST candidates in the repo. Ranked by the coupling signals `decompose-god-file` actually uses, the real ones are `executor.ts` (1403 code lines, **23** non-type imports, **33** functions), `adobeEntityFetcher.ts` (1232, **21** methods) and `helixService.ts` (1313, **16** methods), none of which had ever been filed. `configurationService.ts` fails the coupling test outright (2 imports, 7 methods) and should be left alone. One cut taken so far: `helixKeyStore.ts` (168 lines) lifted Admin API key persistence out of `helixService.ts` with **88 tests across 7 suites passing untouched**; the next cut there needs an auth-header provider designed rather than code moved, because `pollJobCompletion` binds to `this`. A guideline, not a gate: eslint does not flag these and CI does not fail. Re-measure before picking anything up — the lesson of this item is that it tracked files somebody touched, not files measurement condemns. Filed 2026-08-15, corrected 2026-08-19.

#### App Builder app family — attach a deployable app to a demo ([`2026-06-17-appbuilder-app-deploy-spine.md`](../complete/2026-06-17-appbuilder-app-deploy-spine.md))

Add a custom Adobe App Builder app to a demo project as a first-class, deployable component — the App Builder analog of the component-first direction. **Decided model** (from [`../research/app-builder-app-structure/research.md`](../research/app-builder-app-structure/research.md)): one workspace per demo = the API Mesh (separate artifact) + **one** custom app, with multiple integration domains as **packages inside that one app** — so the singleton `meshState` shape fits and no keyed app array is needed. **Build principle:** reuse existing primitives (org targeting, command plumbing, clone/install, the block-library additive pattern), share the mesh deploy scaffold where duplication is real, and hold off on a generalized deployable framework until a 3rd deployable type appears (Rule of Three). Effort 1 (remove the dormant `integration-service` + `appBuilderApps` mechanism) shipped earlier (`c98e5125`); Effort 2 (discovery least-privilege token) **DECLINED 2026-06-15** (no attacker exposure it closes; VS Code Secret Storage is the cheap fix if at-rest plaintext ever matters).

**Shipped (archived 2026-08-13 reconcile; moved to `complete/` in `fe38d1c4`):** [`appbuilder-shell-app`](../complete/appbuilder-shell-app/overview.md) — the "first app": blank-shell catalog entry (`skukla/app-builder-shell`), Developer Agent tooling un-gated to all App Builder-adjacent projects, runtime API access for AI (`list_console_apis`/`add_console_apis` + persisted `additionalConsoleApis`), AI guidance. Steps 1–3 + guidance shipped 2026-07-09; live Firefly walkthrough pending.

> **Live remainder as of 2026-08-13: slices 3 and 5 only.** Slices 1, 2 and 4 are archived to
> `complete/` — 1 shipped (`20fae62f`), 2 shipped (`94b633cf`), 4 retired into shell instancing.
> The header above links the origin doc, which now lives in `complete/`; that is deliberate,
> not rot.

Five sequenced slices; **slice 1 gates the rest**:

1. **Deploy spine — ✅ LANDED on `develop`** ([`2026-06-17-appbuilder-app-deploy-spine.md`](../complete/2026-06-17-appbuilder-app-deploy-spine.md), `20fae62f`). `app-builder` registry category + `deployAppComponent` (sibling of mesh, idempotent `aio app deploy`) + singular `appState` + the dead `appBuilder` field wired through install/persist + block-library-style additive add/remove + role-gate extension + dashboard `AppBuilderCard`. Public git URL only. **Caveat:** Step-7 live `aio` probes (deploy-prune default, `app delete action` undeploy, trigger/rule orphan-on-rename) deferred to a live workspace.
2. **Curated catalog — ✅ SHIPPED** ([`../complete/2026-06-17-appbuilder-app-curated-catalog.md`](../complete/2026-06-17-appbuilder-app-curated-catalog.md), `94b633cf` + rename `65c40b04`). Delivered via the wizard **"Add-an-Integration"** feature: declarative `config/app-builder-components.json` catalog (seeded `commerce-paas-mesh`/`commerce-eds-mesh`/`headless-commerce-mesh`) + `appBuilderComponentCatalogLoader` (catalog pick AND custom-URL entry coexist) + wizard/configure selection UI + `executor.ts` deploy routing. Resolved the open question: curated mesh baselines live in this catalog. Verified on `develop` 2026-07-07 (index was stale).
3. **Package-bound — ⛔ GATED on the first real bound integration** ([`2026-06-17-appbuilder-app-package-bound.md`](2026-06-17-appbuilder-app-package-bound.md), rewritten 2026-07-09; **re-measured 2026-08-23**). Mechanism + schema fields exist; `onlyForPackages` exclusion is live. Two of the three "production-dead" pieces have since resolved: the dead symbols (`AppBuilderComponentsStepContent`, `computeSelectedAppBuilderComponents`) are DELETED outright, and the locked UI SHIPPED 2026-08-23 as the generic required-component lock (`isRequiredComponent` in `useProjectBuilder.ts` covers `nativeForPackages` entries and the required mesh with one predicate, pinned by tests). Still live: no seeding on stack select, and the gate itself — the catalog still holds exactly one entry and no `kind:'integration'` app purpose-built for a package exists. (The ReviewStep visibility half resolved 2026-08-23: Review now renders ALL selected integrations, required ones included, via `resolveReviewIntegrationNames`.)
4. **Scaffold-and-author — ❌ RETIRED, subsumed by shell instancing** ([`2026-06-17-appbuilder-app-scaffold-author.md`](../complete/2026-06-17-appbuilder-app-scaffold-author.md), verdict at the top of the item). Shell instancing (2026-07-16, `feature/shell-instancing` — [`2026-07-16-shell-instancing-named-ai-integrations.md`](../complete/shell-instancing/item.md)) delivers create-new-and-author-with-AI via named shell instances; the `aio app init` scaffold mode is not being built.
5. **App-only / no-storefront project — partial on 1, parallel** ([`2026-06-17-appbuilder-app-only-project.md`](2026-06-17-appbuilder-app-only-project.md)). Frontend-optional stack schema work; heaviest, least-coupled slice. **Re-measured 2026-08-23, cheaper than filed:** the schema/type claim holds (`stacks.schema.json` still requires `frontend`), but its blocker 2 is dead — `components.json` no longer carries an embedded `stacks` block, so `stacks.json` is the sole definition and there is no second copy to reconcile. The item's `components.json:272-297` and `executor.ts:1101` citations are stale (the throw is now stack-only at `executor.ts:~1453`, and the frontend add is already conditional).

#### Promote a shell-built custom app to a repo ([`2026-07-13-promote-app-to-repo.md`](2026-07-13-promote-app-to-repo.md))

Layer 3 of deterministic-integrations, scoped out. A dashboard action on a blank-shell-built custom app that creates a new GitHub repo (owner picker via `getUserOrgs`) and pushes the app's local dir (fresh history, `.env`/secrets excluded), recording the repo on the component — so it can later be imported via "Import a repo". Reuses `GitHubRepoOperations` / `GitHubTokenService` / the deploy-action pattern. Real forks: public-vs-private repo, secrets hygiene (non-negotiable). Gated on the shell build-out maturing.

#### Custom integration — language standard + singular→packages model ([`2026-07-15-custom-integration-language-and-model.md`](2026-07-15-custom-integration-language-and-model.md))

User-confirmed 2026-07-15: the product noun for the custom, action-carrying integration is **"custom integration"** (ERP / CRM / Firefly), never "App Builder app" (that's the impl substrate). The user-facing string rename **shipped this session** (KindStage/CustomStage/IntegrationsStep/AppBuilderCard/integrationRows/deployApp/appDeployment/appComponentManager + the blank-shell catalog name); internal identifiers kept. Backed by deep research ([`../research/app-builder-integration-model/research.md`](../research/app-builder-integration-model/research.md), six agents) that **corrected the model**: NOT "one app, many packages" but **many separate App Builder apps → one shared Adobe I/O workspace, isolated by per-integration OpenWhisk package renaming**. Six items: (1) language ✅ + (2) `appState` persist ✅ (`f91669cb`) shipped. **(3) ADR-011 D3 = keystone — ✅ MERGED to develop `5d6f4956` 2026-07-16**: the keyed map is serialized (legacy manifests migrate on load), the singular write path is retired, the dashboard renders one integrations list (mesh first row), mesh unified. (4) integration display **name** — folded into D3, shipped with it. (5) **remote Adobe I/O project rename** — none today, but `@adobe/aio-lib-console` `editProject` is installed/unwired; small independent fix. (6) **integrations UX** — ✅ **SHIPPED BOTH SURFACES**: the dashboard card grid (`../complete/integrations-grid/`, re-hosted by `../complete/integrations-surface/`), and the wizard on 2026-08-15 (`fix/wizard-integrations-parity`) — the SHARED `IntegrationCard` extracted to `core/ui/components/integrations/`, the destination hoisted to one line, `IntegrationResultRow` + `RenameIntegrationModal` deleted. Wizard/dashboard visual parity stops short of the grid and drawer by design (`../complete/integrations-surface/overview.md:97-105`; 720px column, no pre-deploy status). Plus a doc correction. Cross-links §A slices + §E. **Only item 5 (remote Adobe I/O project rename) is left in this file.**

#### Prereqs architecture reframe — two-tier (Path A) ([`2026-06-11-prereqs-architecture-reframe.md`](2026-06-11-prereqs-architecture-reframe.md))

Reframe `prerequisites.json` from "project prerequisites" to two tiers (extension-wide vs. feature-specific), build a non-dismissable first-run welcome panel, repoint the wizard step at project-specific work only, share one install runner. **Research complete + 16 decisions locked; ready for `/rptc:plan`** — no plan dir or code yet. Unblocks the Claude CLI detection plan below. **Re-measured 2026-08-23: all five structural claims hold** — no `scope` discriminator, the schema drift (dead `groups`/`multiVersion`/`versionCheck`, missing `perNodeVersion`) is unchanged, all 5 entries still `optional: false`, the prereqs step survived the v6 wizard rebuild as step 2, and no welcome panel/walkthrough exists. The v6 rebuild touched nothing this item measures.

#### Engine-aware AI launch + detect + opt-in install ([`claude-cli-detection-and-install/`](claude-cli-detection-and-install/overview.md))

**⚠️ Blocked on the prereqs reframe above.** Engine-aware structure (engine registry keyed by `demoBuilder.ai.engine`, `openInClaude.ts` → `openInAi.ts`), lazy install-gate notification, opt-in Homebrew install. **Partially started** — `demoBuilder.ai.engine` DOES exist (`package.json:345`, documented at `src/commands/CLAUDE.md:204`); the earlier "not started" note was wrong on that half. Still absent: the `openInClaude.ts` → `openInAi.ts` rename and the engine registry. Becomes a thin "fill in engine-specific bits" plan once the reframe lands.

#### Audit: project-level facts stored per-component ([`2026-08-11-project-level-facts-stored-per-component.md`](2026-08-11-project-level-facts-stored-per-component.md))

`componentConfigs` is keyed by who CONSUMES a value, not by what the value IS, so one fact is stored once per declaring component. Measured 2026-08-11, **re-measured 2026-08-23: 17 of 27** declared env vars have more than one owner (two new single-owner vars joined since; the multi-owner set is unchanged); 6 are the Commerce scope keys (single-sourced 2026-08-11 — on the WRITE side only, the declarations were never deduplicated), leaving **11**. The drift mechanism is NOT a second writer — there is none; it is that Configure's fan-out targets come from `selectedComponents`, so a component holding a copy but missing from the selection lists never gets updated (the same gap `reconcileComponentSelections` exists for). That is **key-agnostic**, so all 11 are exposed. Two candidate fixes: widen the fan-out target set (one change, every key) or single-source per key (what scope got). **Do the fan-out audit first** — it may make most of the per-key work unnecessary. **Not blocked.**

#### App Builder deployable model — the unresolved gaps ([`appbuilder-deployable-model/`](appbuilder-deployable-model/overview.md))

Moved from `plans/` 2026-08-13. **Corrected the same day: an earlier version of this entry said
"D1 is built and D2–D6 have not started." That was wrong in both directions.** ADR-011's status
note records D1 and D2 as shipped and **D3 shipped 2026-07-15** (`5d6f4956`), and there is no
D4–D6 track — the plan defines D1, D2 Track A/B and D3. Verified against `src/`: all nine
substantive D3 steps fail, two of them naming modules that have since been DELETED
(`deployAppHeadless`, `appComponentManager`), so their "surgical anchors" point into files that
no longer exist. The step files are now flagged at the top of the overview as history, not
instructions.

**What actually remains is the "Gaps to resolve" section** — work the shipped tracks never
covered: per-deployable `.env` + env-var graph + secrets (marked HIGH, pressure-tested
2026-06-19 — catalog entries must bring their own env-var schema and there is no collection
surface for arbitrary integrations), the deployables list UX, per-deployable status model,
removal confirmation for a destructive cloud op, error/recovery states, and the AI-shell flow.
Scope from that section, never from the step files. **Track A pre-positions
`getWorkspaceCredential`** — `dead-code-scan` reports it as an unused export and it is NOT
cruft. Not blocked.


### D. Deferred by design (gated on an external condition)

#### The other webview message channels are still untyped ([`2026-08-21-webview-push-channels-are-untyped.md`](2026-08-21-webview-push-channels-are-untyped.md))

**Re-measured 2026-08-23 — mostly done; this entry had lagged its own item.** The push campaign and the request direction BOTH shipped since filing: `webviewPayloads.ts` now declares 44 exports (7 init shapes + ~37 push payloads) and `webviewRequests.ts` covers the request direction; the four named `AddIntegrationFlowAdapter` casts are gone. Still true: the comm manager takes `unknown` (`sendMessage(type, payload?: unknown)`), so nothing FORCES a new channel to declare its shape, and ~45 payload-less action requests remain untyped (the item's own "Remaining tail (LOW priority)"). Standing rule, not a project: declare the payload when you next touch a channel. `as never` count drifted 31 → 36 — watch the ratchet. Filed 2026-08-21.

#### Retire `legacyLookupKey` infrastructure — DA/repo unification cleanup ([`2026-06-08-rename-existing-da-content-to-repo-name.md`](2026-06-08-rename-existing-da-content-to-repo-name.md))

Phase 1 (matching names + auto-migration on reset) shipped (`23efd831`, `b2169699`). This entry is now the cleanup batch: retire `SiteRegistrationParams.legacyLookupKey`, the `cleanUpLegacyRegistration` branch, the 4th arg to `buildSiteConfigParams`, the `daLiveSite` manifest field. **Verified these symbols still exist.** Single-day deletion. Pick up only after telemetry confirms no `storefrontNameMigration` activations for 30+ days.

#### Rebuild BuildRight on the thin-layer model ([`2026-06-10-buildright-eds-disposition.md`](2026-06-10-buildright-eds-disposition.md))

Disposition decided 2026-06-10: **complete rebuild** — express BuildRight as a Demo Builder package on canonical (branded block library + brand CSS + DA content) using the ADR-006 mechanisms. ADR-006 has now shipped, so this is unblocked; the old `buildright-eds` repo archives when the rebuild ships. BuildRight is currently `hidden: true` in the picker.

#### PDP empty-data redirect to native /404 ([`2026-06-09-pdp-graceful-empty-state.md`](2026-06-09-pdp-graceful-empty-state.md))

When an SC deletes a SKU, the cached PDP serves the template and the drop-in gets no data. Honest UX = redirect to the storefront's native `/404`. **Re-scoped 2026-08-23: half of this shipped for the OTHER path.** The smart-404 snippet (`pdp404Snippet.ts:194-198`) now does exactly this redirect on the COLD path (URL 404s at the CDN, render trigger fails) — and its comment states this item's UX reasoning as the decided contract, so do not re-decide it. What remains is only the WARM path this item was filed against: a previously-published PDP serves 200 from the content bus indefinitely, so the snippet never runs and the drop-in still renders an empty block. **Investigate first**: does `@dropins/storefront-pdp` expose an empty-state callback before building a DOM-polling wrapper. Ships as a Demo Builder code patch (ADR-006).

#### App Builder component — D3 dual-flow removal ([`2026-06-21-appbuilder-component-first-class-persistence.md`](2026-06-21-appbuilder-component-first-class-persistence.md))

Rewritten 2026-07-09; **re-measured 2026-08-23 and shrunk again**: edit-mode rehydration has SHIPPED (`buildEditModeIntegrationState` in `useWizardState.ts:216` seeds selections, sources, keyed API picks AND the mesh optional-dependency — the item's remaining-scope #2 went with it). **The ReviewStep bug was FIXED the same day** (`resolveReviewIntegrationNames` in `reviewStepHelpers.tsx` — Review now renders integrations through the same resolver the builder summary uses; the dead `components.appBuilder` read is gone and the never-wired `summarizeSelectedAppBuilderComponents` deleted). Remaining: only the **D3 dual-flow removal** (the mirror-write in `appBuilderComponentSelectionState.ts`).

#### Hybrid storefront — Tier 2 (B2B+B2C in one site) ([`hybrid-storefront-model/`](hybrid-storefront-model/overview.md) — still in `.rptc/plans/`)

One CitiSignal storefront serves both B2C individuals and B2B company accounts by customer type at login, on the `boilerplate-b2b-template` base with branding as an overlay (no fork). **Functionally complete** on `develop` — hybrid merge (`b9c31575`), B2B-readiness detection (`24656460`, `c3cd0bbd`), account-chrome overlay, config-flag injection (ADR-009, `bd90c96d`). **⛔ Gated on live login-UX verification**: confirm an individual customer sees no B2B nav rows, a company user does, and B2C is not regressed. The one plan dir that legitimately stays active. Step checks in [`step-02.md`](hybrid-storefront-model/step-02.md).

#### Per-integration API attribution — step 07 ([`per-integration-api-attribution/`](per-integration-api-attribution/overview.md))

Moved from `plans/` 2026-08-13. Steps 01–05 **shipped**, step 06 **withdrawn** (the capability
it existed for turned out not to exist). Step 07 is **RELEASE-gated, not code-gated**: no
shipped build reads `componentApiPicks`, so retiring the flat write today would lose API picks
for anyone still on `v1.0.0-beta.123`. Do it once that build is out of circulation.

### E. Larger / untouched

#### Instance hygiene — wipe + assisted manual steps for demo reuse ([`2026-08-22-instance-wipe-option.md`](2026-08-22-instance-wipe-option.md))

**FULLY DESIGNED 2026-08-23, then TABLED the same day by decision — bugfixes take priority.** The complete design lives in [`../research/instance-wipe-api-audit/research.md`](../research/instance-wipe-api-audit/research.md): the ACCS per-entity removability matrix (spec-diff of the full published REST surface, 489 ops / 51 DELETEs), the four load-bearing verdicts (App Builder cannot exceed the public API — sourced; website deletion does not remove orders; sales documents are the permanent floor; instance replacement via support ticket, credits returned, is the true clean slate), the three-phase wipe (pack discovery via the activity endpoint's instance filter — live-verified cross-pack — then a REST residue sweep, then order-cancel hygiene), the assisted-manual-step layer (instruct with exact codes → admin deep link → verify by API re-read with auto-poll; ACCS admin's store-structure delete buttons confirmed first-hand), and the three-surface communication model (Business Structure inline card, dashboard remedy-dot on the Datapacks tile, Instance Hygiene panel with a measured "Demo ready" verdict; read-only `check_instance_hygiene` MCP tool). First build slice when picked up: the headless hygiene service + read-only probes — every surface hangs off it. Service is frozen (owner retired, questions-only); the design uses only capabilities proven live. Filed 2026-08-22; designed and tabled 2026-08-23.

#### An open-ended design skill ([`2026-08-17-open-ended-design-skill.md`](2026-08-17-open-ended-design-skill.md))

**Deferred out of phase 5 by decision — belongs to a pass that ADDS design skills, not one that corrected existing ones.** Every generated skill today answers "how do I do this named thing", or in `diagnose-demo`'s case "how do I look"; none answers "how do I approach a demo nobody gave me a recipe for". Whether that gap is real is genuinely open, and the item exists mainly to stop the next person inheriting a claim that does not hold: the overview's "21 skills, all task-shaped" rests on a count measured as **14**, and the conclusion was never independently checked. Also unresolved by design: skill vs an `AGENTS.md` section — a skill is best at "here is the sequence and its traps", and an open-ended brief has no sequence. Either way it is the first deliberate exception to the 2026-07-11 "no new generated skills unless multi-step-with-traps" constraint, so it needs an argument rather than a gap. Filed 2026-08-17.

#### Multi-locale storefront — Phase 1 ([`2026-05-19-multisite-multilocale.md`](2026-05-19-multisite-multilocale.md))

Serve multiple locales (eventually multiple brands) from a single project. **Re-measured 2026-08-23: the container shipped, the feature did not.** The v6 wizard rebuild delivered this item's structural proposal — a "Business Structure" sub-step exists inside the Commerce area (`commerceSections.ts:76`) — but as a SINGLE website/store/store-view scope selector feeding catalog gating and datapack import. Zero locale code anywhere in `src/` (measured with controls). So the item's "repurpose the settings step" plan is stale; what remains is adding the locale axis INSIDE the existing step. Covers PaaS, ACCS, ACO addon. Research: [`docs/research/2026-05-19-multisite-multillocale-research.md`](../../docs/research/2026-05-19-multisite-multillocale-research.md); seam: [ADR-003](../../docs/architecture/adr/003-multisite-architecture-seam.md). Phase 2 (repoless multi-brand) deferred.

#### Decouple project from VS Code workspace folder ([`2026-05-30-decouple-project-from-workspace.md`](2026-05-30-decouple-project-from-workspace.md))

**Re-measured 2026-08-23: the GOAL has shipped — this is now a small cleanup question, not a multi-day feature.** Plain project selection no longer reloads the window: `dashboardHandlers.ts:204-235` renders the picked project's dashboard in-place off the persisted pointer, and only shift/cmd-click (`forceNewWindow`) still anchors a workspace; the always-root re-home (`extension.ts:415-428`) replaced project-anchored workspaces entirely. What survives is one orphaned remainder: the MCP dual-listen shim (`secondarySocketPath` in `inExtensionMcpServer.ts`) whose tests explicitly pin it "so the decouple work later" cannot drop it — that later is now. Re-verify whether always-root makes primary==secondary (then it is a plain dead-code removal) and close this item either way.

#### EDS site-scraping capability ([`2026-05-28-eds-site-scraping.md`](2026-05-28-eds-site-scraping.md))

Scrape client URLs → working EDS blocks at 90–95% fidelity. Two workflows. **Re-measured 2026-08-23: the Playwright workflow is FULLY SHIPPED** — all six scraping skills generate into every EDS project, `@playwright/mcp` is wired via ai-defaults (which superseded the item's global-prerequisite step with a better per-project mechanism), and the palette command exists (`openModernizationAgent.ts`). What remains is only the Mod Agent path: Phase 1.5 (GitHub OAuth to install AEM Code Connector/Sync) + Phase 2 subagents, **still gated on Mod Agent access** (request filed 2026-05-28).

#### Monorepo independent release tracking ([`monorepo-independent-release-tracking/`](monorepo-independent-release-tracking/overview.md))

Full RPTC plan (overview + 3 steps) drafted 2025-12-16, never executed. Adds tag-prefix support (`backend@1.0.0`, `optimizer@2.0.0`) for independent release lifecycles in one repo. Pick up when monorepo components become a real need — **re-measured 2026-08-23: still no repo serves two components** (4 distinct source URLs, each used once), and the plan's file map is stale: `COMPONENT_REPOS` no longer exists (repo resolution lives in `componentRepositoryResolver.ts`) and `templates/components.json` is now `src/features/components/config/components.json`. Fix the citations before executing.

### F. Maintenance cycle anchors

#### DX follow-through — verification pipeline + guidance freshness ([`2026-07-03-dx-verification-pipeline.md`](2026-07-03-dx-verification-pipeline.md))

Deferred items from the 2026-07-03 DX audit (`../research/dx-audit/research.md`), **re-measured 2026-08-23**: secret-file PreToolUse guard (still absent — six rules exist, none covers secrets; a new rule file in `.claude/hooks/rules/` is the insertion point), the fresh-context `/code-review` pre-push habit (the OTHER half of that item — evidence capture — has since shipped in `gate`'s §5 report format), periodic re-verification of the `<!-- Last verified -->` markers (present on 8 CLAUDE.md files, seven of them now ~7 weeks past their stamp — the premise proves itself), and removal of the four unused webpack devDependencies (all still in `package.json`; still the cheapest item in the backlog).

#### Structural baseline ([`2026-05-21-structural-baseline.md`](2026-05-21-structural-baseline.md))

Numbers-first measurement pass to map the codebase's actual size, complexity, and coupling after ~1 year of AI-assisted development. **Run after Cycle D ships.** Produces a report that informs subsequent trim cycles.

#### Legacy / soft-deprecation cleanup ([`2026-05-21-legacy-soft-deprecation.md`](2026-05-21-legacy-soft-deprecation.md))

**Re-measured 2026-08-13, and AGAIN 2026-08-23 — down to one item.** `@deprecated` in `src/` holds at **1** (`envFileGenerator.ts`, a Category-A keep). The `demoPackageLoader` test seam is DONE — better than done: it shipped, became the documented reference example (`tests/README.md` names it), and is machine-enforced repo-wide (`tests/sop/no-config-leaf-mocks.test.ts`, empty allowlist). All that remains is the `stalenessDetector.ts` dual surface: the service class plus **nine** standalone function exports (the "ten" previously recorded here counted the type re-export). One mechanical refactor. **Do not execute the batch plan in the file** — it is history; the banner at the top has the current scope. This entry has now been wrong twice; it earned its own warning.

### G. Instrumentation & guidance gaps (filed 2026-08-13)

#### EDS contract drift checker ([`2026-08-13-eds-contract-drift-checker.md`](2026-08-13-eds-contract-drift-checker.md))

Filed 2026-08-13, raised by the Data Installer session and re-measured here before filing.
**EDS has 36 service files making external HTTP calls and no drift checker** — Helix Admin,
DA.live, Config Service and GitHub, all with offline-only tests, so any of those contracts can
move and the suite stays green. `tests/fixtures/eds/` exists but only 2 test files read it, and
the three ad-hoc `scripts/test-*helix*` probes contain zero fixture references, so none would
notice a shape change. Not theoretical: the Helix DELETE-auth rule, the Config Service lookup
key, the DA.live site-vs-org scope and the aem.live path-encoding limit were each discovered by
breakage. `scripts/dataInstallerDrift.js` is the reference, and its four rules are load-bearing
— a non-200 is a FAILURE never "no drift", ADDED keys are not drift, coverage is action ×
PARAMETER, and a nonsense control invalidates the run if it passes. **Cannot be a CI gate**: it
needs interactive credentials, so it is a manual pre-release check in `cut-release`'s advisory
block — say so, or someone wires it into CI, watches it fail, and disables it. Scope EDS only;
reads only. Not blocked.

#### Block authoring has no oracle — the type scale exists and nothing points at it ([`2026-08-13-block-authoring-has-no-type-scale-oracle.md`](2026-08-13-block-authoring-has-no-type-scale-oracle.md))

Filed 2026-08-13 from "fonts are too small and Claude spins a lot authoring blocks — would
Playwright help, or SLICC?" **Neither: the tool is not the problem.** Measured — every
generated storefront ships **36 `--type-*` custom properties** (a full scale, size and
line-height per role) in `aem-boilerplate-commerce`'s `styles.css`, and **no generated skill
mentions them** (zero hits; control confirms the files are read). So an authoring agent picks
sizes by eye, and `refine-visual-match` cannot correct it because that skill requires
`.scraped/<domain>/` references — outside the scrape flow there is no oracle, so iteration runs
against taste, unbounded. Playwright already screenshots at 1440/375 and caps at 3 rounds; the
missing piece is a standard, not an instrument. SLICC was ruled out 2026-05-28 (BYOT-key
friction vs auto-install), **though that assessment was scoped to scraping** and is not
automatically closed for verification. Cheapest fix first: tell the skills the scale exists,
measure, and only then consider a computed-style checker. **Two honest gaps:** no
Claude-authored block was available to observe, so the failure is inferred — step 1 is
reproducing it; and the boilerplate is itself inconsistent (13 of 83 block stylesheets use the
tokens, 6 hardcode), so an agent reading neighbours finds both conventions. Not blocked.

#### Make third-party AI tooling visible, optional, and coherently gated ([`2026-08-13-third-party-tooling-visible-and-optional.md`](2026-08-13-third-party-tooling-visible-and-optional.md))

Filed 2026-08-13; **re-measured 2026-08-23 — two of its three gaps have shrunk or closed.**
**(1) The invisible-download gap is mostly dead:** the premise ("Playwright fetches ~150 MB
Chromium on first use, nothing in `src/` knows") was measured FALSE on 2026-08-22 — the MCP
drives the machine's installed Chrome by default, and `src/` now says so in three places
(the v17 skill correction, `ai-defaults.json`, `constants.ts`). What survives is only the
runtime pre-check for Chrome-less machines (a Chrome-detection + `ms-playwright` cache stat;
today only `mcpInspector.ts` even mentions the env var). **(2) Progress is still a label,
not progress** — `aiHandlers.ts` emits one opaque step and `aiDefaultsInstaller.ts` has zero
progress wiring (verified with a control). **(3) The skill→tool dependency is DECLARED and
ENFORCED** — `SKILL_MCP_TOOL_DEPENDENCIES` in `src/types/ai.ts:83` maps exactly the three
Playwright-driving skills, and `skillsWriter.ts` gates generation on it, so a project
without the tool no longer receives skills that command it. Remaining live work: the
opt-out surface itself, the progress fix, and the re-scoped Chrome-less pre-check. Not
blocked.


---

## Recently shipped — 2026-08

- **AI surface coverage — phase 4** — found EXECUTED when re-measured 2026-08-23: every group (1–8) landed or was explicitly decided against in the plan's own annotations; the tool surface is 103 (57 direct + 46 descriptor rows), not the filed 58; the two example gaps (data-installer writes, prerequisites) are both closed. The backlog file predated execution and was never updated. `.rptc/plans/ai-surface/` still holds the annotated plan — verify its OTHER phases before archiving that dir too ([`../complete/ai-surface-coverage/overview.md`](../complete/ai-surface-coverage/overview.md))
- **Data Installer — MCP write tools** — found SHIPPED when re-measured 2026-08-23: 8 of the 9 named handlers are descriptor-row tools (`start_datapack_import`, `validate_datapack_import`, `reset_datapack`, `start_datapack_export`, + the four target/scope/status/export-list reads); `delete-datapack` and `async-process-status` stay deliberately withheld. One-line residue: `provision-accs-credentials` is still handler-only — expose or decline it next time this surface is touched ([`../complete/2026-08-16-data-installer-mcp-write-tools.md`](../complete/2026-08-16-data-installer-mcp-write-tools.md))
- **Code Sync detection limits** — archived 2026-08-23 as pure reference: its one proposal (gate Continue on the install-link click) was BUILT 2026-08-20 (`d70ef9b5`) and deliberately REVERTED the same day (`28c385b7`, reasoning now in `repoSelectionInline.helpers.tsx` — a forced click on an unreliable inference bought friction, not safety); `siteUnknownReason.ts`, which the item cites as load-bearing, was deleted `111fc968`. The reference half (two-level status semantics, GitHub API dead ends) re-measured current and lives on in code docblocks ([`../complete/2026-08-19-code-sync-detection-limits.md`](../complete/2026-08-19-code-sync-detection-limits.md))
- **Adobe org-context — residual workstreams** — index entry retired 2026-08-23 after re-measure: facet B's concurrency risk was dissolved (per-invocation `withOrgContext` env targeting + `ResourceLocker.executeExclusive` wired through `commandExecutor`), the typed non-retryable `ORG_MISMATCH` shipped end-to-end (error code + `non_retryable: true` + the proxy refusing to retry it + AGENTS.md guidance), and the human org-picker was built and deliberately withdrawn (`e552f503` → `66f2888e`). The item file was already in `complete/`; only its live index entry survived it ([`../complete/2026-06-15-adobe-org-context-self-heal-consolidation.md`](../complete/2026-06-15-adobe-org-context-self-heal-consolidation.md))
- **MCP tools for Configuration Service site access** — found ALREADY SHIPPED when picked up 2026-08-23: AI-surface phase 4 (Group 6) delivered the whole scope in `siteTools.ts` — `get_site_access`, `set_site_admin` (grant/revoke merged, confirm-gated), `repair_site_configuration` — wired, tested (36), documented, in the bundle; every filed constraint honored, one deliberate deviation (unmasked emails, rationale in the module docstring). The item aged out in nine days without its death being visible — the index's re-measure-before-pickup rule caught the picker, not the filer ([`../complete/mcp-site-access-tools.md`](../complete/mcp-site-access-tools.md))
- **App Builder attach — Model A seed** — archived 2026-08-23 during a whole-backlog review: everything in the item is shipped, declined, or superseded. The seed's five "build new" gaps all exist on develop via the ADR-011 track (`deployAppComponent`, the keyed `appBuilderComponents` map, the dashboard integrations grid, per-integration package renaming, `getProvidedEnvVars`); Effort 1 shipped long ago; Effort 2 stays declined. Adjacent remainders live in their own items ([`../complete/2026-06-15-integration-service-cleanup-and-discovery-token.md`](../complete/2026-06-15-integration-service-cleanup-and-discovery-token.md))
- **Jest worker force-exit warning** — closed 2026-08-23, diagnosed to the mechanism. A live-handle audit of all 1130 suites found and fixed the only two real leaks: two `commerceStoreDiscovery` error-path tests under-mocked a `Promise.all` fan-out (calls 2–3 fell through the fetch spy to REAL fetches whose DNS+TLS handles lived for seconds), and `componentManager-install-git-clone`'s install-by-tag test hit the LIVE GitHub API (its 404 fell back to the configured tag, so it passed while touching the network). The residual warning is NOT a test leak: jest-worker's hardcoded 500ms end-of-run deadline racing twelve simultaneous worker teardowns — a SIGTERM dump on a warned run never even executed, proving the laggard's loop was blocked in teardown/GC, not idling on a handle. Machine-state-sensitive (~44% before and after); recurrence is not a regression unless the handle audit (recipe in `tests/README.md`) shows a leak ([`../complete/2026-06-09-jest-worker-force-exit.md`](../complete/2026-06-09-jest-worker-force-exit.md))
- **Catalog prewarm fails on a store view with no Catalog Service index** — closed 2026-08-23, all three decisions made. The ordering question was already answered in code (creation imports the datapack before prewarming, and the creation-time pipeline deliberately passes no project to the step-8 prewarm — the item’s premise went stale between filing and pickup). An unindexed scope is a supported state with a documented, non-self-serve remedy: Live Search's public Catalog data retention policy HIBERNATES an environment whose catalog stays empty 45 days (or a testing env unqueried 90), and syncing products does not by itself wake it (internal search-team corroboration, paraphrased) — the fix is an Adobe support request titled "Reactivate Live Search". The warn now carries that remedy, that runtime smart-404 covers every PDP regardless, and that Republish or Reset re-runs prewarming (Republish gained prewarm the same day — decided and implemented in the shared republish spine, so the dashboard button and MCP sync_content both retry it); branch-discriminated from generic failures, both pinned by test. No products(skus:) fallback ([`../complete/2026-08-18-prewarm-enumeration-needs-an-indexed-scope.md`](../complete/2026-08-18-prewarm-enumeration-needs-an-indexed-scope.md))
- **Placeholder sheets: does anything need them?** — answered and fixed 2026-08-23: the reset-time code fetch (`fetchPlaceholderFiles`) and its 16-path `placeholderSheets` inventory are DELETED. Closed by a dominance argument, every link verified: the DA.live copy's full-tree walk carries authored sheets (they are `.xlsx` on DA.live; verified live on isle5), so a source with sheets needs no fetch and a source without has nothing to fetch — while the fetch targeted the template's live site, dead for b2b (17 silent 404s per reset) and content-shadowing where alive. Content owns labels; dropins' compiled-in English defaults cover the rest. Docs synced (`eds-content-separation.md` rewritten around creating-vs-copying; ADR-008 amended); a stale ledger shipping the retired field is ignored leniently, pinned by test. Same-day follow-up: the console 404s themselves silenced via static one-row sentinel stubs (`placeholderStubs.ts`, wired into creation + reset; empty sheets would still warn — the fetch code checks `data.length`; real DA sheets shadow the stubs) ([`../complete/placeholder-sheets-who-owns-them.md`](../complete/placeholder-sheets-who-owns-them.md))
- **A package that requires a mesh must be forced to add one** — designed and built 2026-08-23. Premises corrected first: CitiSignal's headless-paas storefront override also resolves `requiresMesh: true` (not just hidden BuildRight), and the requirement predicate existed twice in disagreement. Shipped: one predicate (`resolveRequirement` delegates to `getResolvedMeshRequirement`, stackId threaded), the orphaned `AppBuilderComponentsStepContent` deleted, the required mesh row locked (no Remove, "Required by this package" subline), the toggle refuses, and `isIntegrationsComplete` holds Continue until the mesh is selected. Closes the silent empty-product-blocks failure ([`../complete/2026-08-18-force-the-mesh-a-package-requires.md`](../complete/2026-08-18-force-the-mesh-a-package-requires.md))
- **MCP: which window serves, and which project it acts on** — closed 2026-08-23. Race 2 (stale pointer) had shipped 2026-08-16; this pass added first-window-wins socket binding (probe before rename, loud warn on refusal; dead files still hand over) and made `reset_eds_project` name its target project in the confirm gate and every result. Accepted limitations recorded in the bind docstring: no auto-rebind after the serving window closes; a narrow same-instant TOCTOU ([`../complete/mcp-window-and-project-binding.md`](../complete/mcp-window-and-project-binding.md))
- **A refused credential is reported as a missing permission** — closed 2026-08-23 with the probe shape: `isServerAccepted(org)` (one HEAD against the admin plane; 401 indicts the credential, 403 is an org fact, network fails open) wired into `ensureDaLiveAuth` at the two pipeline pre-flights, with refusal-specific prompt copy. `previewFailed` now rides the unpublish warn; the block-library retry loop ruled a deliberate variant of `withDaLiveAuthRetry` (typed `cancelled` contract) and documented as such. Open product note stays in the archived item: failed unpublishes remain non-fatal unless field complaints say otherwise ([`../complete/2026-08-16-refused-credential-reported-as-missing-permission.md`](../complete/2026-08-16-refused-credential-reported-as-missing-permission.md))
- **What does a datapack removal actually delete?** — answered 2026-08-22 by the Data Installer service owner (the route the item itself named as cheaper than the experiment): pack-scoped; a removal cannot clear an instance, and hand-created data is out of its reach. Pack-scoped branch applied same day — the reset removal prompt now states "anything you added by hand stays" as a fact. The clean-slate want lives on as the active [`2026-08-22-instance-wipe-option.md`](2026-08-22-instance-wipe-option.md) ([`../complete/2026-08-17-what-does-a-datapack-removal-actually-delete.md`](../complete/2026-08-17-what-does-a-datapack-removal-actually-delete.md))
- **Spine sweep — every auditable action pinned to one implementation** — campaign completed 2026-08-22, the same day it was directed. 13/13 auditable rows pinned in `tests/templates/spine-chokepoints.test.ts` (2 excluded by design: npm install / git clone serve unrelated actions); worklist + verdicts live in `.claude/skills/call-path-audit/SKILL.md`. Same-day fixes: one spelling for the destructive mesh-delete command, the MCP manifest door refuses malformed JSON, the DA.live host constant single-sourced, two false cross-module claims corrected. All three filed consolidations shipped the same day: [`../complete/2026-08-22-helix-publish-has-two-engines.md`](../complete/2026-08-22-helix-publish-has-two-engines.md) (including the missing publish-Authorization fix its audit predicted), [`../complete/2026-08-22-dalive-services-bypass-their-own-client.md`](../complete/2026-08-22-dalive-services-bypass-their-own-client.md), and [`../complete/2026-08-22-post-reset-mesh-redeploy-has-two-wrappers.md`](../complete/2026-08-22-post-reset-mesh-redeploy-has-two-wrappers.md)
- **Storefronts are hardcoded to `main`** — closed 2026-08-20 on scope, not on a platform rule: this tool builds throwaway demo storefronts from a `main` boilerplate, so a storefront living on `master` does not arise. Whether Adobe serves `.aem.live` from a non-`main` ref stays deliberately unresolved, and the item corrects a misattribution — the original Helix 404 was never about the ref (`admin.hlx.page` 401s for a known site on any ref) ([`../complete/2026-08-20-storefront-branch-is-hardcoded-main.md`](../complete/2026-08-20-storefront-branch-is-hardcoded-main.md))
- **Data Installer access requires an Adobe I/O project** — decided 2026-08-16 and split in two: Option 1 (one shared `demo-builder-s2s` pair served from the discovery service) shipped to develop the same day, proven end to end including a write (`../complete/data-installer-credential-broker/`); everything else lives in the active [`per-sc-io-project.md`](per-sc-io-project.md). The two smaller defects it carried also shipped (`11dea998`): reset resolves credentials before prompting, and the auto-credentials offer is gated on a real workspace binding ([`../complete/2026-08-16-data-installer-requires-adobe-io-project.md`](../complete/2026-08-16-data-installer-requires-adobe-io-project.md))
- **`create_project` demands a mesh workspace for mesh-free packages** — shipped 2026-08-18. `createHeadless` already asked `getResolvedMeshRequirement`; `createEds` did not, so the tool refused EVERY EDS creation an agent attempted (all EDS packages except BuildRight declare `requiresMesh: false`). Now conditional, with `adobe` optional through the three consumers that read it. Sibling guards audited and correctly scoped — `repoName`/`daLiveOrg`/`daLiveSite` apply to all EDS, `accsEndpoint` is already conditional on `-accs`. The forced-mesh half is a separate, undesigned item ([`../complete/2026-08-18-force-the-mesh-a-package-requires.md`](../complete/2026-08-18-force-the-mesh-a-package-requires.md)) ([`../complete/2026-08-18-create-project-tool-demands-a-mesh-workspace.md`](../complete/2026-08-18-create-project-tool-demands-a-mesh-workspace.md))
- **`delete_mesh` deletes whatever the CLI last selected** — shipped in `v1.0.0-beta.132` (`b7769f16`). All three filed parts landed: the delete is wrapped in `withOrgContext` with `workspaceId` feeding `buildOrgTargetFromProjectAdobe`, so the validated argument now targets the delete instead of being discarded; and `ORG_SCOPED_AIO` matches the space form (`api-mesh[:\s]+`), so the guard no longer shares the blind spot its own tests had. Never reproduced live, and now cannot be ([`../complete/mesh-delete-untargeted.md`](../complete/mesh-delete-untargeted.md))
- **Catalog prewarm 401s on every new storefront** — Fix A shipped 2026-08-15 (`3d73419b`); the runtime self-heal the entry called "designed, not built" shipped in `v1.0.0-beta.130` as `f9d757e3` (mint + register), `c69b175e` (re-mint on every path that destroys the key) and `0b544ed7` (30-day renewal sweep). Verified live 2026-08-18: a creation minted and registered a key and prewarm reported `Enumerated 30 SKUs … 30/30 succeeded`, against the filed symptom of `0/39` ([`../complete/pdp-prewarm-401-after-admin-pinning.md`](../complete/pdp-prewarm-401-after-admin-pinning.md))
- **Reset sample-data ordering** — the data step now runs BEFORE the storefront pipeline, so catalog pre-warming is not spent on products about to be deleted (measured: 30 PDP pages published, then those products removed). The RESTORE half of that item was built and withdrawn before release — it tripled the tail of a three-minute operation and made "reset" mean two things depending on a button; reset removes sample data or leaves it, as it always did. Also unresolved and worth knowing: a removal is pack-scoped, and whether it can clear hand-created data is UNVERIFIED ([`../complete/2026-08-17-reset-should-restore-sample-data.md`](../complete/2026-08-17-reset-should-restore-sample-data.md))

Pointers only; `../complete/` holds each writeup and git history holds the implementation.

- **Tier the AI-bundle refresh (watch both staleness axes)** — shipped 2026-08-14 on `feature/tiered-ai-refresh`, merged `d2cb8e85`: composition axis + ADR-013 hash-and-skip seam, tier split, silent activation sweep, Playwright-skill gating, one v8 bump — the last bump that prompts anyone ([`../complete/2026-08-13-tier-the-ai-bundle-refresh.md`](../complete/2026-08-13-tier-the-ai-bundle-refresh.md))
- **Nothing typechecks test files** — shipped 2026-08-13/14 across twelve commits (`f49ab5e2..b1d6411f`): `tsconfig.test.json` + `npm run typecheck:tests` took 802 naive / 711 real errors to **0**, wired into CI and the `gate` skill §3/§6; full suite stayed green throughout (12,803 tests — one dead test deleted deliberately) ([`../complete/2026-08-13-test-files-are-not-typechecked.md`](../complete/2026-08-13-test-files-are-not-typechecked.md))
- **Mesh deployment state: one fact, five readers, two writers** ([`../complete/2026-08-04-mesh-deployment-state-one-accessor.md`](../complete/2026-08-04-mesh-deployment-state-one-accessor.md))
- **One status vocabulary, three tables** ([`../complete/2026-08-04-two-status-vocabularies-one-grid.md`](../complete/2026-08-04-two-status-vocabularies-one-grid.md))
- **Storefront staleness misses the two PaaS endpoints** ([`../complete/2026-08-04-storefront-staleness-misses-paas-endpoints.md`](../complete/2026-08-04-storefront-staleness-misses-paas-endpoints.md))
- **Cosmetic Adobe reads should be non-interactive** ([`../complete/2026-08-04-cosmetic-adobe-reads-should-not-prompt.md`](../complete/2026-08-04-cosmetic-adobe-reads-should-not-prompt.md))
- **Face buttons vs the kebab** ([`../complete/2026-08-04-card-face-buttons-vs-kebab.md`](../complete/2026-08-04-card-face-buttons-vs-kebab.md))
- **The add path bypasses the "one deploy-record writer"** ([`../complete/2026-08-04-two-deploy-record-writers.md`](../complete/2026-08-04-two-deploy-record-writers.md))
- **Console teardown pre-empts one delete blocker of three** — closed as robustness, not a live bug ([`../complete/2026-08-04-console-delete-blockers-not-preempted.md`](../complete/2026-08-04-console-delete-blockers-not-preempted.md))
- **A second, dead, unwrapped mesh-creation implementation** ([`../complete/2026-08-04-dead-second-mesh-create-implementation.md`](../complete/2026-08-04-dead-second-mesh-create-implementation.md))
- **Eleven superseded message handlers, still registered** ([`../complete/2026-08-05-eleven-superseded-message-handlers.md`](../complete/2026-08-05-eleven-superseded-message-handlers.md))
- **MCP socket resolution: existence is no longer evidence of liveness** — filed and shipped 2026-08-10 alongside the socket-TOCTOU fix that created the condition; `resolveProxyTarget` now probes liveness first and falls back to existence only once some window is confirmed live ([`../complete/2026-08-10-mcp-socket-existence-is-not-liveness.md`](../complete/2026-08-10-mcp-socket-existence-is-not-liveness.md))

### Archived 2026-08-13 by the claim-validation pass — shipped weeks earlier, never moved

Five items were sitting in this index describing defects that no longer existed. None of the
fixing commits touched `.rptc/`, which is exactly how they survived. Each archived file carries
an outcome banner with the verifying evidence.

- **`export_project_settings` ignores `includeSecrets`** — fixed by `12f4b802`; `stripSecretValues()` at the single emit site, the ambiguous default removed (now a required parameter), tests assert the value's absence ([`../complete/2026-08-11-export-settings-ignores-include-secrets.md`](../complete/2026-08-11-export-settings-ignores-include-secrets.md))
- **PDP routing silently broken two ways** — both halves fixed by one commit, `3843b6be`: `rehydratePackageDerivedConfig()` restores package-derived config in edit mode and the guard now logs instead of returning silently; `writeDelayedJsWithStaleShaRetry()` re-reads and retries once, on SHA mismatch only ([`../complete/2026-07-29-code-patches-not-rehydrated-in-edit-mode.md`](../complete/2026-07-29-code-patches-not-rehydrated-in-edit-mode.md) · [`../complete/2026-07-29-pdp404-stale-sha-conflict.md`](../complete/2026-07-29-pdp404-stale-sha-conflict.md))
- **Reset consent only when there is something to lose** — the "UI wiring remains" status was stale; all four readiness kinds are live in `repoStorefrontReadiness.ts`, and `not-a-storefront` refuses rather than offers ([`../complete/2026-07-29-reset-consent-only-when-there-is-something-to-lose.md`](../complete/2026-07-29-reset-consent-only-when-there-is-something-to-lose.md))
- **Generated diagnosis skill** — premise dead: `templates/skills/diagnose-demo.md` exists and ships in the always-on bundle ([`../complete/2026-08-11-generated-diagnosis-skill.md`](../complete/2026-08-11-generated-diagnosis-skill.md))
- **Integrations host contract** — fixed by `0b9f0f6d`; `showIntegrations.ts` enumerates both handler maps via `getRegisteredTypes()`, so the hand-list that drifted is gone (measured: 0 references, down from the claimed 19) ([`../complete/integrations-host-contract/overview.md`](../complete/integrations-host-contract/overview.md))

### Archived 2026-08-13, second sweep — the items that ANNOUNCED they were done

The five above were **silently** stale. These five are the opposite failure and were found by
the user simply looking at the folder: their own text or index entry said SHIPPED / LANDED /
IMPLEMENTED / RETIRED, in some cases for over a month, and nobody moved the file. A backlog
entry that declares itself finished is not a backlog entry.

Each was re-verified against `src/` before moving, not taken from its own claim.

- **Mesh create-vs-update remote probe** — said SHIPPED since 2026-07-15 and sat here four weeks. Retry-as-update live in `meshDeployment.ts` behind an `/already has a mesh/i` probe; `errorFormatter.ts` present ([`../complete/2026-07-15-mesh-create-vs-update-remote-probe.md`](../complete/2026-07-15-mesh-create-vs-update-remote-probe.md))
- **Shell instancing** — `feature/shell-instancing` no longer exists on the remote and the instancing services are in `develop`. Its execution plan had already been archived while the item stayed here, so one job had two records in two lifecycle states; they are now one directory ([`../complete/shell-instancing/item.md`](../complete/shell-instancing/item.md))
- **App Builder deploy spine (slice 1)** — the file still said "Status: READY" while the index said "✅ LANDED". `20fae62f` confirmed an ancestor of `develop` ([`../complete/2026-06-17-appbuilder-app-deploy-spine.md`](../complete/2026-06-17-appbuilder-app-deploy-spine.md))
- **App Builder scaffold-and-author (slice 4)** — RETIRED 2026-07-16, subsumed by shell instancing. A retired item in the active backlog is soft deprecation ([`../complete/2026-06-17-appbuilder-app-scaffold-author.md`](../complete/2026-06-17-appbuilder-app-scaffold-author.md))
- **Deterministic integrations** — discharged: Layers 1 and 2 shipped and Layer 3 was scoped out to its own item, which the file says itself. An item whose entire remainder lives in another item is done ([`../complete/2026-07-13-deterministic-integrations.md`](../complete/2026-07-13-deterministic-integrations.md))

**The lesson is not the same as the first sweep's.** These needed no measurement to catch —
only someone reading the folder and asking why finished work was in it. The
`backlog-claim-drift` hook does not catch this class either: it fires when code changes, and
these were already done. What catches it is a periodic look at the list, which is what
`rptc-hygiene-scan` §3 does for `plans/` and nothing did for `backlog/`.
