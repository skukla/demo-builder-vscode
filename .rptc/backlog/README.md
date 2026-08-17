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

> **Index last reconciled: 2026-08-13** (THIRD pass — a claim-validation pass; see below).
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

Also resolved since last index (now archived to `../complete/`): **oversized test-file splits** (0 `max-lines` warnings — the rule skips blanks/comments, and the worst file counts 481 of 500), **regenerate-AI-files progress** (shipped as `aiRegenProgress` in `useDashboardStatus.ts`; the old note pointed at a `creationProgress` symbol in `features/ai/handlers/`, a path that has since moved to `features/dashboard/handlers/`), **logs-toggle → sidebar**, and **B2B feature-pack dropin delivery**. The **DaLive permission-log "typo"** was a false positive — deleted outright rather than archived, since there was never anything to do.

⚠️ **`jest worker force-exit` was listed here as resolved and is NOT** — see §F. It reproduces on demand as of 2026-08-05.

---

## Active backlog

### A. Active front (nearest to actionable — nothing here is in progress)

#### Reset should RESTORE sample data, not only remove it ([`2026-08-17-reset-should-restore-sample-data.md`](2026-08-17-reset-should-restore-sample-data.md))

**A design decision, plus one ordering defect to fix either way.** Reset restores the storefront — it re-copies DA.live content and republishes — but the sample-data half only DELETES, so one button means "put it back" for content and "take it away" for the catalog. An SC who mangles a catalog mid-demo gets an empty Commerce instance and a storefront rendering nothing, then has to reimport by hand; `project.datapack` already records which pack to restore. **The separable defect, measured in two runs on 2026-08-17:** reset pre-publishes PDP pages for 30 SKUs (`Catalog Prewarm: Complete: 30/30`) and THEN deletes those products — the data step runs after the whole pipeline, so prewarm warms a catalog that stops existing. Reorder prewarm after the data step regardless of the decision; it is shippable alone. Cost is the argument against restore: measured import ~2.5 min on top of a ~3 min reset plus the removal, so ~10 min total, and a partial reinstall is worse than cleanly empty (must report per-type, like the import modal). Open question for the decider: restore as the default, or a third button — recommendation is to replace "Remove Sample Data" with restore and drop remove-only, since an empty catalog is reachable from the Data Installer. Context: the feature only reached a working state on 2026-08-17 after four defects in one evening (`eab4d9ed` prompt never appeared for any project, `9c842e16` removal could not resolve credentials, `ced64268` removal polled with a client that cannot report status, `6ef14451`/`d17a7033` the 2-3s prompt delay — an `aio` CLI spawn measured at 2.05s), so this is the first time the behaviour has been observable end to end. Filed 2026-08-17.

#### Catalog prewarm 401s on every new storefront ([`pdp-prewarm-401-after-admin-pinning.md`](pdp-prewarm-401-after-admin-pinning.md))

**We close the door ourselves, and it SHIPPED in beta.129.** `prewarmOne` POSTs to the `prepublish-pdp` action with no headers at all (verified: `catalogPrewarmService.ts:341-358` passes only a method and a timeout signal), while storefront setup pins an admin at registration two minutes earlier — and any `access.admin` role closes the whole Helix admin API to anonymous callers, a rule the `eds-publish-and-config` skill already documents. Result: `0/39 succeeded`, systemic. **Severity resolved 2026-08-15 — BROKEN FEATURE, no probe needed:** the vendored browser snippet builds the identical unauthenticated request (`pdp404Snippet.ts:170-176`), so the live 401 the reporter already captured IS the smart-404 request; PDPs cannot self-heal. Admin pinning is new in `v1.0.0-beta.129` (absent at the `beta.128` tag), so every storefront created from that release on is affected; earlier ones are fine. **Fix A SHIPPED 2026-08-15 (`3d73419b`)** — prewarm now publishes through `helixService.previewAndPublishPage`, which already sent the DA.live bearer and which prewarm simply never used; that restores PDPs for the whole setup-time catalog. **Fix B (runtime self-heal) is designed, not built.** Measured: an IMS S2S token is refused, but a `roles: ['publish']` Admin API Key clears the lock (200 on a PDP path; controls 401/200). It matters more than it first looked — **SCs routinely add products after setup**, so the runtime fallback is a main path, not a tail. Design: the extension mints a **SITE-scoped** publish key (org scope was tried and rejected — it saves no lookup, since every request already carries `org` AND `site`, and it costs both blast radius and per-project revocation) and registers it with the action, which authenticates the caller using the IMS chain already guarding `discover-stores` and stores it encrypted per site; rotation then rides the extension's existing ≤7-day re-mint, which is what the deleted shared-secret scheme (`ac36fc7`) failed to do. The extension half is PROVEN end to end (mint → publish → revoke, live), and the action half's AUTH is proven too — the deployed `discover-stores` accepts the `darkalley` DA.live token (400 on a missing param, i.e. past every auth gate; controls 401/401). **The action half is now BUILT, DEPLOYED and PROVEN** (`accs-discovery-service@ac1190b`, Stage): `register-publish-key` behind the discover-stores guard chain, AES-256-GCM per-site blobs in aio-lib-files with a per-write IV, and `prepublish-pdp` reading the key. Probed with the bug and fix in one run against a locked site using a real catalog SKU — anon prepublish 502 `Preview failed (401)` with no key, then 200 published after registering, and the live tier served the PDP. Only the EXTENSION side remains: mint, register, and re-do both on each rotation trigger. **Load-bearing constraint found by probe: `apiKeys` lives inside the site config document, so `updateSiteConfig`'s delete-then-re-register destroys the key on EVERY project edit** (measured: 1 key → delete → re-register → 0). It cannot be captured and restored like the admin roster, because a key value is unreadable after creation — so the design must re-mint AND re-register after any config write, and invalidate the 7-day local cache, which today would serve a key that no longer exists. `helixService.createAdminApiKey` is that minter — kept, not deleted, with two live-measured bugs fixed (`roles: ['admin']`→`['publish']`, and raw→URL-safe key ids that made every DELETE 400). Research: `.rptc/research/pdp-credential-rotation/research.md`. Filed 2026-08-15.


#### Placeholder sheets: does anything need them, and should code fetch them at all? ([`placeholder-sheets-who-owns-them.md`](placeholder-sheets-who-owns-them.md))

**A design question, and the answer may be "delete the code path".** A B2B storefront serves nine placeholder 404s per page load because `fetchPlaceholderFiles` fetches each sheet from the TEMPLATE'S live site, and `main--boilerplate-b2b-template--adobe-commerce.aem.live` **does not exist** — every sheet 404s, and so do `/config.json` and `/` (control: the same path on `aem-boilerplate-commerce--hlxsites` returns 200, so the mechanism is fine and only the host is wrong). A full successful reset (`8107a42`) still left them absent, disproving the "just never reset" theory. But a sheet is only a UI label dictionary (`Global.AddProductToCart = "Add to Cart"`), and **a PDP rendered correctly with all nine 404ing** — dropins ship these English defaults compiled in. Placeholders are normally AUTHORED CONTENT (DA.live spreadsheets, like `/redirects` and `/metadata`, which the same reset copies fine), so we may be maintaining a code fetch for something the content pipeline already handles. Decide whether any package needs non-default labels before writing code; if none does, delete `fetchPlaceholderFiles` and the `placeholderSheets` inventory. Unverified: whether the B2B DA.live source already has these sheets (401 unauthenticated) — check from the extension first. The silent-404 half is ALREADY FIXED. Filed 2026-08-15.

#### Move deliberately to a per-SC Adobe I/O project ([`per-sc-io-project.md`](per-sc-io-project.md))

**Retire the separately-deployed shared service; each SC gets their own Adobe I/O project.** Five items: (a) the `demo-builder-s2s` credential — **CANNOT MOVE**, settled 2026-08-16; (b) store discovery; (c) prerender — **a separate research item, do not decide it here**; (d) a single SC-built mesh and (e) SC-built integration packages, both **already built**, which is what makes this credible rather than speculative. (a) cannot move, and the reason turned out to be entitlement rather than reach: a credential in the Solution Led Commerce SC org cannot be subscribed to `ACCS-REST-API` at all — the service carries no product profile there (control: twelve other services in that org DO offer products), and the subscribe is refused inside an HTTP 200. The subscription IS the entitlement, so such a credential never gains `commerce.accs`. Measured 2026-08-16, both orgs compared: `.rptc/complete/data-installer-credential-broker/step-05.md`. **Three things must exist first, all verified 2026-08-16:** no notion of a REQUIRED deployable in the catalog schema (one entry today, `app-builder-shell`); no upgrade path for a deployed integration (staleness detection is mesh-shaped — **the cost centre**, since today one deployment serves everyone and a fix ships once); and no dedup, so two demo projects sharing a workspace each believe they own the deployment and the second deploy silently overwrites the first. D1 shipped; D2–D6 pending. What it buys: retires four actions, an AES-256-GCM per-site key store, a drift checker, the org-keyed `accsDiscovery.services` setting, and `byom.overlayUrl` — which today ships a stage Runtime endpoint as a default in this PUBLIC repo. Filed 2026-08-16.

#### Data Installer access requires an Adobe I/O project ([`2026-08-16-data-installer-requires-adobe-io-project.md`](2026-08-16-data-installer-requires-adobe-io-project.md))

> **DECIDED 2026-08-16 — this item is now the record, not the decision.** The work split in two: `.rptc/complete/data-installer-credential-broker/` (Option 1, **shipped to develop 2026-08-16** — one shared `demo-builder-s2s` pair served from the discovery service, proven end to end including a write) and [`per-sc-io-project.md`](per-sc-io-project.md) (Option 2, everything else). The credential stays in the shared service because reach follows the instances' org, not the SC's.

**A new project cannot use the Data Installer without manual Console work.** A datapack write needs an OAuth S2S pair; that pair exists only inside an Adobe I/O project + workspace; a package selecting no App Builder components never gets one, so `provision-accs-credentials` refuses. Measured live 2026-08-16 on `skukla/bodea-template-test` — both OAuth fields blank, `project.adobe` carrying only `{organization, organizationName}`. "The user can paste a pair in" is NOT an escape: it moves who creates the I/O project from the extension to a human, it does not remove the requirement. **The open decision is per-project vs one shared "Demo Builder" I/O project per org**, and the question that settles it is whether the workspace is also wanted for deploying per-project actions — shared is much the smaller change (`provisionAccsCredentials` already takes explicit ids; only the handler hard-wires them to `project.adobe`). **The two smaller defects it also carried are SHIPPED (`11dea998`)**: reset no longer asks for sample-data removal it cannot deliver (credentials resolved before the prompt, not after a 3-minute reset), and the "Set up credentials automatically" offer is gated on an actual workspace binding via one predicate shared with the provisioning guard — fixed at the flag rather than the modal, because the export spine raises the same refusal. Constraint: do NOT assume one credential reaches multiple Commerce instances; pre-flight fails identically for a real instance and a nonsense string, so it is unresolved from outside. Filed 2026-08-16 by the Bodea session.

#### `delete_mesh` deletes whatever the CLI last selected ([`mesh-delete-untargeted.md`](mesh-delete-untargeted.md))

**Destructive, cloud-side, both surfaces.** `handleDeleteApiMesh` validates `workspaceId` then runs `aio api-mesh delete --autoConfirmAction` without passing it, and targets no org — so the CLI falls back to its process-global `aio console where` selection, which this codebase deliberately stopped maintaining. Mesh check and deploy ARE targeted; delete is the odd one out. The safety-net guard cannot warn because `ORG_SCOPED_AIO` matches the colon form (`api-mesh:`) while the command uses the space form — and the guard's tests pin only colon spellings, so they share the blind spot. Reachable from the dashboard AND `delete_mesh`. Not reproduced live; reproduce before fixing. Filed 2026-08-14.

#### MCP: which window serves, and which project it acts on ([`mcp-window-and-project-binding.md`](mcp-window-and-project-binding.md))

Two independent last-writer-wins races. The socket name is `sha256(projects-root)` — identical in every window — and a second window `rename`s over the first's bind silently, so the LAST window to start serves. Separately, `StateManager` reads `state.json` once at `initialize()` with no watcher, so that serving window never learns about a project selected in another window. Net: `get_current_project` can report the wrong project, and `reset_eds_project` (confirm-only, pointer-resolved, rewrites repo + DA.live content) acts on it. `delete_project` is safe — it demands an explicit name. Not reproduced live; preconditions stated from code. Filed 2026-08-14.

Note: `2026-05-30-decouple-project-from-workspace.md` looks adjacent but its headline premise shipped fixed on 2026-06-02 — re-scope it, do not pick it up as written.

#### Two EDS services sit over the god-file threshold ([`eds-services-over-size-threshold.md`](eds-services-over-size-threshold.md))

`configurationService.ts` (532) and `edsResetService.ts` (463) exceed the 400-line services threshold — both were already over at `develop` (444 / 430), so this is pre-existing debt, not new. A guideline, not a gate: eslint does not flag them and CI does not fail. The model for the split is in the item — three extractions on `fix/leah-128-bugs` (`siteGrantPreservation`, `edsResetConfigStep`, `siteConfigRegistrar`) each proved behaviour-preserving by leaving the existing suites UNTOUCHED. `configServiceAccess.ts` (493) is explicitly NOT a candidate: 207 of those lines are comments and its exports are one coherent contract. Pick up at a release cut via `codebase-sweep`. Filed 2026-08-15.

#### MCP tools for Configuration Service site access ([`mcp-site-access-tools.md`](mcp-site-access-tools.md))

Give an agent the same 403 repair a human now gets from `Demo Builder: Manage Site Access` — `get_site_access` / `grant_site_admin` / `revoke_site_admin` over the existing `siteAccessManagerHeadless` core, which was built UI-free for exactly this. No new logic; the constraints (report `verified` separately from `status`, treat `not_authorized` as non-retryable, never remove the last admin, mask emails) are measured rather than assumed and are listed in the item. Filed 2026-08-14 from the `config-service-admin-grant` verify loop.

#### Component secret routing — the declaration decides where a credential lives ([`component-secret-routing/`](component-secret-routing/overview.md))

Filed 2026-08-13; **small version shipped same day** (`ce840267`: ACCS fields declared, the
`SECRET_ENV_KEYS` guard, one reader per credential pair). Remaining scope is the seam itself —
generalize `type: 'secret'` routing beyond App Builder, then migrate the two secrets now in
`componentConfigs`. Originally from Data Installer Stage 2 live verification. An ACCS project cannot import:
the modal says "add an OAuth client id and secret" and there is **nowhere to add them** —
`storeAccsCredentials` is called from tests only. Two designs were rejected before this one (a
feature-specific form; collapsing the per-backend branch), both recorded in the plan so they are
not retried.

The general problem: **nothing links a config DECLARATION to SecretStorage for ordinary
components.** `type: 'secret'` → SecretStorage exists but is App Builder-only; a Commerce
credential lands in `componentConfigs` in the clear and is kept out of exports by
`SECRET_ENV_KEYS`, a hand-maintained list whose own docstring warns you to remember it. The fix
generalizes the seam that already exists (`splitAppBuilderComponentSecrets` + `secretKey`), so a
secret is never written rather than written-then-stripped.

**Step 5 is worth doing on its own.** It shrinks that list and adds a guard that fails when a
component declares a credential-shaped field which is neither `type: 'secret'` nor listed —
today nothing enforces the list at all, and the export's safety rests entirely on it
(`stripSecretValues`, wired in `12f4b802`). Take step 5 even if steps 1-2 are rejected or the
migration question stalls; it does not depend on either.

**Step 2 is where the risk is**, and it is bigger than moving a value: **three consumers read that
password straight out of `componentConfigs`**, one of them (`useAutoStoreDetect`) in the WEBVIEW,
which cannot read SecretStorage at all. Recommended migration is three phases — one accessor with
fallback first (behaviour-identical, independently valuable), then write-through with verified
read-back so the credential is never in neither place, then converge on load. Phase 1 is worth
doing even if the rest never happens. **Steps 1-2 are shared infrastructure**;
step 3 alone would unblock ACCS the existing (worse) way. Verified against the live service, not
assumed: it refuses with "Provide either (client_id + client_secret) or (admin_username +
admin_password)" and 401s on a bogus pair. Not blocked; needs a design decision before code.

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
3. **Package-bound — ⛔ GATED on the first real bound integration** ([`2026-06-17-appbuilder-app-package-bound.md`](2026-06-17-appbuilder-app-package-bound.md), rewritten 2026-07-09 after a staleness audit — [`../research/appbuilder-slice3-staleness/research.md`](../research/appbuilder-slice3-staleness/research.md)). Mechanism + schema fields exist; `onlyForPackages` exclusion is live. But the auto-include pieces are production-dead (no seeding, no locked UI, no summary visibility), the proposed `citisignal-headless` binding target doesn't exist as a package id, and the only bindable entries (meshes) would be behaviorally redundant. Real scope is in the rewritten item; pick up when a `kind:'integration'` app purpose-built for a package exists (shell lineage, slice 4, or BuildRight rebuild).
4. **Scaffold-and-author — ❌ RETIRED, subsumed by shell instancing** ([`2026-06-17-appbuilder-app-scaffold-author.md`](../complete/2026-06-17-appbuilder-app-scaffold-author.md), verdict at the top of the item). Shell instancing (2026-07-16, `feature/shell-instancing` — [`2026-07-16-shell-instancing-named-ai-integrations.md`](../complete/shell-instancing/item.md)) delivers create-new-and-author-with-AI via named shell instances; the `aio app init` scaffold mode is not being built.
5. **App-only / no-storefront project — partial on 1, parallel** ([`2026-06-17-appbuilder-app-only-project.md`](2026-06-17-appbuilder-app-only-project.md)). Frontend-optional stack schema work; heaviest, least-coupled slice.

#### Promote a shell-built custom app to a repo ([`2026-07-13-promote-app-to-repo.md`](2026-07-13-promote-app-to-repo.md))

Layer 3 of deterministic-integrations, scoped out. A dashboard action on a blank-shell-built custom app that creates a new GitHub repo (owner picker via `getUserOrgs`) and pushes the app's local dir (fresh history, `.env`/secrets excluded), recording the repo on the component — so it can later be imported via "Import a repo". Reuses `GitHubRepoOperations` / `GitHubTokenService` / the deploy-action pattern. Real forks: public-vs-private repo, secrets hygiene (non-negotiable). Gated on the shell build-out maturing.

#### Custom integration — language standard + singular→packages model ([`2026-07-15-custom-integration-language-and-model.md`](2026-07-15-custom-integration-language-and-model.md))

User-confirmed 2026-07-15: the product noun for the custom, action-carrying integration is **"custom integration"** (ERP / CRM / Firefly), never "App Builder app" (that's the impl substrate). The user-facing string rename **shipped this session** (KindStage/CustomStage/IntegrationsStep/AppBuilderCard/integrationRows/deployApp/appDeployment/appComponentManager + the blank-shell catalog name); internal identifiers kept. Backed by deep research ([`../research/app-builder-integration-model/research.md`](../research/app-builder-integration-model/research.md), six agents) that **corrected the model**: NOT "one app, many packages" but **many separate App Builder apps → one shared Adobe I/O workspace, isolated by per-integration OpenWhisk package renaming**. Six items: (1) language ✅ + (2) `appState` persist ✅ (`f91669cb`) shipped. **(3) ADR-011 D3 = keystone — ✅ MERGED to develop `5d6f4956` 2026-07-16**: the keyed map is serialized (legacy manifests migrate on load), the singular write path is retired, the dashboard renders one integrations list (mesh first row), mesh unified. (4) integration display **name** — folded into D3, shipped with it. (5) **remote Adobe I/O project rename** — none today, but `@adobe/aio-lib-console` `editProject` is installed/unwired; small independent fix. (6) **integrations UX** — ✅ **SHIPPED BOTH SURFACES**: the dashboard card grid (`../complete/integrations-grid/`, re-hosted by `../complete/integrations-surface/`), and the wizard on 2026-08-15 (`fix/wizard-integrations-parity`) — the SHARED `IntegrationCard` extracted to `core/ui/components/integrations/`, the destination hoisted to one line, `IntegrationResultRow` + `RenameIntegrationModal` deleted. Wizard/dashboard visual parity stops short of the grid and drawer by design (`../complete/integrations-surface/overview.md:97-105`; 720px column, no pre-deploy status). Plus a doc correction. Cross-links §A slices + §E. **Only item 5 (remote Adobe I/O project rename) is left in this file.**

#### Prereqs architecture reframe — two-tier (Path A) ([`2026-06-11-prereqs-architecture-reframe.md`](2026-06-11-prereqs-architecture-reframe.md))

Reframe `prerequisites.json` from "project prerequisites" to two tiers (extension-wide vs. feature-specific), build a non-dismissable first-run welcome panel, repoint the wizard step at project-specific work only, share one install runner. **Research complete + 16 decisions locked; ready for `/rptc:plan`** — no plan dir or code yet. (The original `.116` target slipped; we're on `.121`.) Unblocks the Claude CLI detection plan below.

#### Engine-aware AI launch + detect + opt-in install ([`claude-cli-detection-and-install/`](claude-cli-detection-and-install/overview.md))

**⚠️ Blocked on the prereqs reframe above.** Engine-aware structure (engine registry keyed by `demoBuilder.ai.engine`, `openInClaude.ts` → `openInAi.ts`), lazy install-gate notification, opt-in Homebrew install. **Partially started** — `demoBuilder.ai.engine` DOES exist (`package.json:345`, documented at `src/commands/CLAUDE.md:204`); the earlier "not started" note was wrong on that half. Still absent: the `openInClaude.ts` → `openInAi.ts` rename and the engine registry. Becomes a thin "fill in engine-specific bits" plan once the reframe lands.

#### Adobe org-context — residual workstreams ([`2026-06-15-adobe-org-context-self-heal-consolidation.md`](../complete/2026-06-15-adobe-org-context-self-heal-consolidation.md))

Core self-heal **shipped** (see Recently shipped). Residual scope from the original consolidation, **verify against current code before picking up**: (B) concurrency safety — re-pin under an exclusive lock spanning select→command and/or per-project `aio` config isolation; (C) human org-picker (real `get-organizations`/`select-org`) + typed non-retryable `ORG_MISMATCH` for agents + AGENTS.md/skills guidance. Was the FIX-FIRST gate for the App-Builder-deployable + workspace work; the gate is cleared now that the self-heal landed.

#### Audit: project-level facts stored per-component ([`2026-08-11-project-level-facts-stored-per-component.md`](2026-08-11-project-level-facts-stored-per-component.md))

`componentConfigs` is keyed by who CONSUMES a value, not by what the value IS, so one fact is stored once per declaring component. Measured 2026-08-11: **17 of 25** declared env vars have more than one owner; 6 are the Commerce scope keys (single-sourced 2026-08-11), leaving **11**. The drift mechanism is NOT a second writer — there is none; it is that Configure's fan-out targets come from `selectedComponents`, so a component holding a copy but missing from the selection lists never gets updated (the same gap `reconcileComponentSelections` exists for). That is **key-agnostic**, so all 11 are exposed. Two candidate fixes: widen the fan-out target set (one change, every key) or single-source per key (what scope got). **Do the fan-out audit first** — it may make most of the per-key work unnecessary. **Not blocked.**

#### AI surface coverage — tools and skills vs features ([`ai-surface-coverage/`](ai-surface-coverage/))

Paused 2026-08-13 with the research done and seven steps written; deferred so a live defect
could go first. Measured: **58 tools, 14 skills, 67 handlers** across five feature maps, 26
exposed by descriptor rows. The apparent gap is mostly not one — reading the 41 handlers
without a row splits them into UI navigation, fire-and-forget dispatchers, and capability
already reachable through one of the 32 tools registered outside the descriptor tables. That
turned up a disqualifier `mcp-tool-authoring` does not state: a handler can be perfectly
headless and still unexposable because its return carries the DISPATCH rather than the
OUTCOME (`handleSyncStorefront` is two lines that run a command and return success), so
exposing it hands an agent a tool that cannot fail. Real gaps are on the guidance side —
authentication has 8 tools and no skill, mesh has 3 and none dedicated, prerequisites has no
surface at all. Step 01 is mechanical and the worklist of all 41 is written; backing research
is `.rptc/research/ai-surface-coverage/research.md`. **Not blocked.**

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

#### Retire `legacyLookupKey` infrastructure — DA/repo unification cleanup ([`2026-06-08-rename-existing-da-content-to-repo-name.md`](2026-06-08-rename-existing-da-content-to-repo-name.md))

Phase 1 (matching names + auto-migration on reset) shipped (`23efd831`, `b2169699`). This entry is now the cleanup batch: retire `SiteRegistrationParams.legacyLookupKey`, the `cleanUpLegacyRegistration` branch, the 4th arg to `buildSiteConfigParams`, the `daLiveSite` manifest field. **Verified these symbols still exist.** Single-day deletion. Pick up only after telemetry confirms no `storefrontNameMigration` activations for 30+ days.

#### Rebuild BuildRight on the thin-layer model ([`2026-06-10-buildright-eds-disposition.md`](2026-06-10-buildright-eds-disposition.md))

Disposition decided 2026-06-10: **complete rebuild** — express BuildRight as a Demo Builder package on canonical (branded block library + brand CSS + DA content) using the ADR-006 mechanisms. ADR-006 has now shipped, so this is unblocked; the old `buildright-eds` repo archives when the rebuild ships. BuildRight is currently `hidden: true` in the picker.

#### PDP empty-data redirect to native /404 ([`2026-06-09-pdp-graceful-empty-state.md`](2026-06-09-pdp-graceful-empty-state.md))

When an SC deletes a SKU, the cached PDP serves the template and the drop-in gets no data. Honest UX = redirect to the storefront's native `/404`. **Investigate first**: does `@dropins/storefront-pdp` expose an empty-state callback before building a DOM-polling wrapper. Ships as a Demo Builder code patch (ADR-006). Phase 0 investigation 15–30 min.

#### App Builder component — edit-mode rehydration + ReviewStep visibility ([`2026-06-21-appbuilder-component-first-class-persistence.md`](2026-06-21-appbuilder-component-first-class-persistence.md))

Rewritten 2026-07-09: two of the three original claims were already resolved on `develop` (`buildProjectConfig` serialization EXISTS; custom-URL provisioning EXISTS via creation Phase 3b + the rebuilt `CustomIntegrationRow`; `showCustomDoor` is obsolete). Remaining: edit-mode rehydration (nothing persists the selections to rehydrate FROM), the live ReviewStep bug (reads always-empty `components.appBuilder`, so hand-picked integrations are invisible on Review), and the coupled **D3 dual-flow removal**.

#### Hybrid storefront — Tier 2 (B2B+B2C in one site) ([`hybrid-storefront-model/`](hybrid-storefront-model/overview.md) — still in `.rptc/plans/`)

One CitiSignal storefront serves both B2C individuals and B2B company accounts by customer type at login, on the `boilerplate-b2b-template` base with branding as an overlay (no fork). **Functionally complete** on `develop` — hybrid merge (`b9c31575`), B2B-readiness detection (`24656460`, `c3cd0bbd`), account-chrome overlay, config-flag injection (ADR-009, `bd90c96d`). **⛔ Gated on live login-UX verification**: confirm an individual customer sees no B2B nav rows, a company user does, and B2C is not regressed. The one plan dir that legitimately stays active. Step checks in [`step-02.md`](hybrid-storefront-model/step-02.md).

#### Per-integration API attribution — step 07 ([`per-integration-api-attribution/`](per-integration-api-attribution/overview.md))

Moved from `plans/` 2026-08-13. Steps 01–05 **shipped**, step 06 **withdrawn** (the capability
it existed for turned out not to exist). Step 07 is **RELEASE-gated, not code-gated**: no
shipped build reads `componentApiPicks`, so retiring the flat write today would lose API picks
for anyone still on `v1.0.0-beta.123`. Do it once that build is out of circulation.

### E. Larger / untouched

#### Multi-locale storefront — Phase 1 ([`2026-05-19-multisite-multilocale.md`](2026-05-19-multisite-multilocale.md))

Serve multiple locales (eventually multiple brands) from a single project. Repurposes the wizard `settings` step as **Business Structure** (Connection, Primary Store, Regions & Locales, reserved Additional Brands). Covers PaaS, ACCS, ACO addon. Research: [`docs/research/2026-05-19-multisite-multillocale-research.md`](../../docs/research/2026-05-19-multisite-multillocale-research.md); seam: [ADR-003](../../docs/architecture/adr/003-multisite-architecture-seam.md). Phase 2 (repoless multi-brand) deferred.

#### Decouple project from VS Code workspace folder ([`2026-05-30-decouple-project-from-workspace.md`](2026-05-30-decouple-project-from-workspace.md))

Switching projects from the home grid reloads the workspace folder, reactivating the extension host. Goal: render the picked project's dashboard in-place without a window reload; anchor the workspace only when a workspace-requiring action fires. Multi-day — touches `StateManager`, MCP server lifecycle, terminal/AI Chat anchoring, file watchers.

#### EDS site-scraping capability ([`2026-05-28-eds-site-scraping.md`](2026-05-28-eds-site-scraping.md))

Scrape client URLs → working EDS blocks at 90–95% fidelity. Two workflows (Mod Agent; Playwright MCP). **Gated on Mod Agent access** (request filed 2026-05-28). Phase 1 ~1 day of config; Phase 1.5 (GitHub OAuth to install AEM Code Connector/Sync) ~1–2 weeks — defer until Phase 1 validates.

#### Monorepo independent release tracking ([`monorepo-independent-release-tracking/`](monorepo-independent-release-tracking/overview.md))

Full RPTC plan (overview + 3 steps) drafted 2025-12-16, never executed. Adds tag-prefix support (`backend@1.0.0`, `optimizer@2.0.0`) for independent release lifecycles in one repo. Pick up when monorepo components become a real need.

### F. Maintenance cycle anchors

#### DX follow-through — verification pipeline + guidance freshness ([`2026-07-03-dx-verification-pipeline.md`](2026-07-03-dx-verification-pipeline.md))

Deferred items from the 2026-07-03 DX audit (`../research/dx-audit/research.md`): secret-file PreToolUse guard, evidence capture in the `gate` skill + fresh-context `/code-review` habit, periodic re-verification of the `<!-- Last verified -->` markers now stamped on every CLAUDE.md, and removal of the unused webpack devDependencies.

#### Structural baseline ([`2026-05-21-structural-baseline.md`](2026-05-21-structural-baseline.md))

Numbers-first measurement pass to map the codebase's actual size, complexity, and coupling after ~1 year of AI-assisted development. **Run after Cycle D ships.** Produces a report that informs subsequent trim cycles.

#### Legacy / soft-deprecation cleanup ([`2026-05-21-legacy-soft-deprecation.md`](2026-05-21-legacy-soft-deprecation.md))

**Re-measured 2026-08-13 — nearly all done.** The old text here ("~30 inventoried items… 3 zero-caller deletions are ready any time") was ~2.5 months stale: L1–L5 executed in Cycle 4 (PR #8, 2026-05-31) and three of the four follow-ups have shipped since. `@deprecated` in `src/` is down to **1** (`envFileGenerator.ts`, a Category-A keep), lint is **0 warnings / 0 errors**, and `componentHandler.ts` is deleted. What remains is small: half of follow-up 2 (`stalenessDetector.ts` still carries a service class *and* ten standalone function exports) plus the never-scheduled `demoPackageLoader` test seam. **Do not execute the batch plan in the file** — it is history; the banner at the top has the current scope.

#### Jest worker force-exit ([`2026-06-09-jest-worker-force-exit.md`](2026-06-09-jest-worker-force-exit.md))

⚠️ **Was listed as resolved; it is not.** "A worker process has failed to exit gracefully" returned
when `maxWorkers` went 25% → 75% (`3c17791e`, 2026-08-05). The item's hypothesised cause is **stale**:
the `useMeshDeployment.ts:211` 180s timer it named no longer exists, and no un-`unref`'d long timer
remains in `src`. Higher concurrency did not create a leak, it changed suite-to-worker packing and
exposed one. Tests pass and CI is green, so the cost is only the noise floor — which is precisely
what this item exists to protect.

📊 **Rate corrected 2026-08-13.** This entry read "reproducible on demand — 0/3 at 25%, **3/3 at
75%**". Measured across 16 full runs at 75% while investigating the timeout flake, the warning
appeared in **7 — about 44%**, not every run. Do not plan around it being reliable. It also never
co-occurred with the `ENOTEMPTY` teardown failure a peer session reported (**0/16**), so the two are
not one bug in the direction testable from here.

#### ✅ Full-suite timeout flake — RESOLVED 2026-08-13 (moved to [`../complete/2026-08-13-jest-full-suite-timeout-flake.md`](../complete/2026-08-13-jest-full-suite-timeout-flake.md))

**The cause was a second concurrent jest run, not the config.** One suite at a time: 0 failed suites
in 10 runs. Two concurrently: failures in all 6, 4–6 suites each. `maxWorkers: '75%'` and
`workerIdleMemoryLimit` — the two suspects this item was filed against — are both innocent, so the
planned worker-count bisect was answering a dissolved question and would have "fixed" it by narrowing
the collision window. A PreToolUse rule (`.claude/hooks/rules/15-jest-concurrent.rule`) now blocks the
second run. Shipped alongside: four machine-speed assertions removed from `processCleanup.timeout`,
a dead `spawnedPids` safety net wired up, `cacheDirectory` moved where jest actually reads it, a
`validate:jest-config` that had been failing unnoticed, and the full-suite duration corrected from
"3–5 minutes" to ~20 seconds everywhere it was documented. **Still open** and recorded in the outcome:
the MCP socket root is shared across concurrent runs by construction.

### G. Live defects (filed 2026-07-29, verbatim in `v1.0.0-beta.121`)

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

Filed 2026-08-13. Most of this already works — packages install automatically into the
isolated `.demo-builder-mcp/`, `.mcp.json` is written for the user, install failure is
surfaced, a package that goes missing is caught by `detectMcpDrift` and healed, a broken
server shows in the AI Capabilities modal, and `scrape-reference-site` tells the agent how to
recover. Three gaps remain. **(1) The biggest download is invisible:** `@playwright/mcp` is
only the server; Playwright fetches a ~150 MB Chromium on first USE, and nothing in `src/`
knows that binary exists — on a restricted network it fails at an agent mid-scrape, as an
error the extension never sees. **(2) Progress is a label, not progress** — one opaque step
claiming "up to a minute" it cannot know. **(3) There is no opt-out, and the blocker is not
the toggle:** `ai-defaults.json` declares packages, `DEMO_BUILDER_ALWAYS_ON_SKILLS` declares
skills, and **nothing connects them** — the skill→tool dependency exists only as prose inside
skill bodies, so "which skills are disabled if I opt out?" has no machine-readable answer.
Nor is it all-or-nothing: of the six EDS scraping skills only three drive Playwright, the
other three work on already-scraped material. **The state to avoid is a skill that tells an
agent to use a tool that is not installed** — worse than no skill, because the agent tries,
fails and improvises. Step 1 is declaring the dependency. Do the composition axis of
[`2026-08-13-tier-the-ai-bundle-refresh.md`](2026-08-13-tier-the-ai-bundle-refresh.md) first;
this shares its gate. Not blocked.


#### App Builder attach — Model A seed ([`2026-06-15-integration-service-cleanup-and-discovery-token.md`](2026-06-15-integration-service-cleanup-and-discovery-token.md))

Effort 1 (remove the dormant `integration-service` + `appBuilderApps` mechanism) **shipped** on
`develop`. **Active seed:** add 1+ App Builder apps to a demo project (**Model A** — user-supplied git
repos deployed via `aio app deploy` into the demo's existing workspace; the Mesh lifecycle,
multiplied). Supersedes the old Effort 1b cleanup. **Effort 2 (discovery least-privilege token):
DECLINED 2026-06-15** — closes no attacker exposure; VS Code Secret Storage is the cheap fix if
at-rest plaintext ever matters.

---

## Recently shipped — 2026-08

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
