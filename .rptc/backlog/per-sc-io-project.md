---
id: AB-2
kind: epic
area: app-builder
needs: []
value: med
status: backlog
layer: F
---
# Move deliberately to a per-SC Adobe I/O project (Option 2)

## Index hook

*The item in one paragraph. Moved off the index 2026-08-26, which carried a second copy that drifted from this file.*

**Retire the separately-deployed shared service; each SC gets their own Adobe I/O project.** Five items: (a) the `demo-builder-s2s` credential — **CANNOT MOVE**, settled 2026-08-16; (b) store discovery; (c) prerender — **a separate research item, do not decide it here**; (d) a single SC-built mesh and (e) SC-built integration packages, both **already built**, which is what makes this credible rather than speculative. (a) cannot move, and the reason turned out to be entitlement rather than reach: a credential in the Solution Led Commerce SC org cannot be subscribed to `ACCS-REST-API` at all — the service carries no product profile there (control: twelve other services in that org DO offer products), and the subscribe is refused inside an HTTP 200. The subscription IS the entitlement, so such a credential never gains `commerce.accs`. Measured 2026-08-16, both orgs compared: `.rptc/complete/data-installer-credential-broker/step-05.md`. **Three things must exist first, all verified 2026-08-16:** no notion of a REQUIRED deployable in the catalog schema (one entry today, `app-builder-shell`); no upgrade path for a deployed integration (staleness detection is mesh-shaped — **the cost centre**, since today one deployment serves everyone and a fix ships once); and no dedup, so two demo projects sharing a workspace each believe they own the deployment and the second deploy silently overwrites the first. D1 shipped; D2–D6 pending. What it buys: retires four actions, an AES-256-GCM per-site key store, a drift checker, the org-keyed `accsDiscovery.services` setting, and `byom.overlayUrl` — which today ships a stage Runtime endpoint as a default in this PUBLIC repo. Filed 2026-08-16.

**Filed:** 2026-08-16, from the Data Installer credential decision.
**Sibling:** `.rptc/complete/data-installer-credential-broker/overview.md` (Option 1), which is
the active work. These are not competing answers to one question — Option 1 handles the
credential, this handles everything else.
**Research:** `.rptc/research/data-installer-credential-home/research.md`.

## Goal

Retire the separately-deployed shared service. Each SC gets their own Adobe I/O project, and
Demo Builder provisions what belongs in it, rather than pointing at a deployment somebody
maintains by hand.

| | What it holds | State today |
|---|---|---|
| **(a)** | the `demo-builder-s2s` credential | **CANNOT MOVE — settled 2026-08-16; see below** |
| **(b)** | store discovery (`discover-stores`) | in the shared service |
| **(c)** | prerender | **separate research item — do not decide here** |
| **(d)** | a single mesh built by the SC | **already built** |
| **(e)** | any integration packages built by the SC | **already built** |

(d) and (e) shipping already is what makes this credible: the deploy spine exists and is in
use. This is an extension of a working model, not a new one.

## (a) is gated, and not on preference

A credential's reach follows the technical account's product entitlement in the org where the
**Commerce instances** live — not where the SC works. Measured within `285361`: one
credential read two instances, with two failing controls. SCs may hold I/O projects in the
Solution Led Commerce SC org while the instances sit in Adobe Demo System, in which case a
per-SC credential reaches nothing.

**RESOLVED 2026-08-16 — (a) cannot move, and the reason is not reach.** A credential
in the SC org cannot be subscribed to `ACCS-REST-API` at all: the service is present
but `enabled: false` with zero product profiles, and subscribing returns HTTP 200
carrying "requires selection of a product". A control confirms twelve other services
in that org DO offer products, so this is specific to ACCS. Creating the S2S
credential succeeds, so it is an entitlement boundary, not a permissions one.

The subscription IS the entitlement, so a credential minted there never gains
`commerce.accs` and could not reach an ACCS instance anywhere. **Plan this item for
(b)–(e) only.** Full measurement:
`.rptc/complete/data-installer-credential-broker/step-05.md`.

## (c) is explicitly out of scope here

The only reason we are not on the Adobe-preferred `aem-commerce-prerender` approach is that
we deliberately avoided per-deployment models in the past. If we are moving away from shared,
that premise changes and the comparison deserves its own audit — current Tier 2 `render-pdp`
against `aem-commerce-prerender` — as a **separate research item**. Do not fold it in here
and do not re-litigate it from the old notes.

Two things that audit will need, recorded so they are not rediscovered: the earlier rejection
rested on four reasons, of which per-deployment cost is the only one this pivot addresses;
and `aem-commerce-prerender` has never been cloned and read locally, so whether one
deployment can serve multiple SITES is unverified.

## What has to exist first

Three gaps, all verified 2026-08-16:

1. **No notion of a REQUIRED deployable.** The catalog schema's component properties are
   `compatibleBackends`, `compatibleFrontends`, `description`, `envSchema`, `id`, `kind`,
   `name`, `nativeForPackages`, `onlyForPackages`, `providesEnvVars`, `requiredApis`,
   `source`. Nothing expresses "must exist". The catalog holds one entry today
   (`app-builder-shell`).
2. **No upgrade path for a deployed integration.** Staleness detection lives in
   `src/features/mesh/services/stalenessDetector.ts` and is mesh-shaped.
   `AppBuilderComponentState` carries `sourceHash`/`lastDeployed` for every kind, so the data
   is there and the detector is not. **This is the cost centre**: today one deployment serves
   everyone and a fix ships once; afterwards every copy needs updating.
3. **No dedup for a shared workspace.** `appBuilderComponents` is a record on the Project, and
   nothing keys a deployment by the shared I/O project (searched: no `sameAdobeProject` /
   `sharedWorkspace` / `byAdobeProject` concept). Two demo projects sharing a workspace each
   believe they own the deployment, and the second deploy overwrites the first with no warning.

Also relevant: D1 shipped; **D2–D6 pending**, and D2 (selection UX) is recorded as "still a
placeholder — needs real design" (`.rptc/backlog/appbuilder-deployable-model/overview.md`).

## What it buys

- Retires a bespoke shared service now carrying four actions, an AES-256-GCM per-site key
  store, a drift checker, and the residue of a multi-day 401 investigation.
- Retires `demoBuilder.accsDiscovery.services` (org-keyed, hand-maintained) and
  `demoBuilder.byom.overlayUrl` — which today ships a **stage Runtime endpoint as a default
  in this public repo**.
- Each SC's blast radius becomes their own.

## Constraints

- The subscribe endpoint is a PUT that REPLACES the service list. Subscribe the UNION, never
  just the new code (the App Builder full-union rule).
- `create-adobe-project` returns `AUTH_FORBIDDEN` without developer permission. SCs are
  *expected* to have Dev Console access wherever they work; that is a planning assumption and
  a bad runtime one. Keep the graceful refusal.
- Do not confuse the Adobe IMS org with the Helix/GitHub org. Earlier notes saying "orgs are
  per-SC" are about the GitHub owner, a different system.

## Kickoff prompt

> Read `.rptc/backlog/per-sc-io-project.md` and
> `.rptc/research/data-installer-credential-home/research.md`. Plan the move of store
> discovery (b) into a per-SC Adobe I/O project, treating (d) mesh and (e) integration
> packages as already built and (a) the credential as gated on
> `.rptc/complete/data-installer-credential-broker/step-05.md`. Prerender (c) is a SEPARATE
> research item — do not decide it here. Three things must exist first: a required-deployable
> concept in the catalog schema, an upgrade path for deployed integrations (today mesh-only),
> and dedup so two demo projects sharing a workspace cannot overwrite each other.

## Shipped so far

- 2026-08-27  SPIKE (owner-directed, 2026-08-27 night) — the multiplicity question SETTLED, and it upgrades this epic from architecture preference to the unlock for a supported Adobe scenario. (1) MANY App Management apps per Commerce INSTANCE is first-class: Adobe's App Management overview describes the Admin screen as cards with search/filters 'when many apps share your Adobe IMS organization', association is per-app state (lib-app stores one install record per app in its own workspace's state namespace), and PROVEN LIVE: the kit deployed to a second workspace (KitSpike) of the same Console project produced a second, fully independent install service — both workspaces' /app-management endpoints answered 401-auth-required side by side. (2) One kit app per WORKSPACE remains structural: the kit's package names are fixed (starter-kit, product-commerce, app-management...) so a second kit app in the same namespace clobbers the first by construction. THEREFORE many-apps-per-instance requires workspace-per-app = exactly this epic. Today's practical path: one kit app per project (our 1:1 project:workspace model), many projects per instance. Extra findings: fresh workspaces fail aio app deploy at the log-forwarding sync step (Cannot read properties of undefined 'runtime' — twice; --no-log-forwarding-update bypasses; propagation or aio bug — any AB-2 flow that creates-then-immediately-deploys needs this); the CLI has NO workspace delete command (Console UI only). Spike cleaned: app undeployed (endpoint 404), config file destroyed. OWNER TODO: delete the KitSpike workspace in Console UI — its runtime credential leaked into the session transcript and workspace deletion retires it.
- 2026-08-27  OWNER CHALLENGE resolved (2026-08-27 night, two parts). (1) 'Isn't everything namespaced?' — half right, and the claim's original reasoning was the weak half. Package names ARE renameable in principle: the kit's own source has ZERO package-name references (verified by grep across src/), and deriveOwPackage already does exactly this rename for standalone apps. What actually pins one kit app per workspace is two per-workspace singletons that are Adobe's, not ours: (a) the install-state key — aio-commerce-lib-app's workflow store writes the installation record under a FIXED key (prefix 'installation', key 'current', verified in the lib's dist) into workspace-scoped lib-state/files with no app identity in the key, so a second lib-app app in the same workspace overwrites the first's install record; (b) the commerce/extensibility/1 extension registration whose operations block points at app-management/* by name — the App Management discovery contract, workspace-scoped. Also the package-declaring config is auto-generated by the kit's pre-app-build hook ('Do not remove or manually edit'), so a rename would mean re-patching generated output every build. Verdict unchanged, reasoning corrected: workspace-per-app it is. (2) Workspace DELETION is programmable: aio-lib-console deleteWorkspace(org, project, workspace) — the CLI lacks the command but the SDK the extension already uses has it. Proven live: deleted KitSpikeJ0re, HTTP 200, gone from the workspace listing — so the FULL loop create workspace -> download config -> aio app use -> deploy -> undeploy -> delete workspace is now proven end-to-end programmatic, which is the operational spine this epic needs. (KitSpike deletion also retired the leaked runtime credential — no Console UI action needed from the owner anymore.) Open question for productizing: a workspace with live event registrations may 409 on delete the way project deletes did — plan to reuse the consoleProjectTeardown registration sweep before workspace deletes.
- 2026-08-27  docs(backlog): workspace-per-app reasoning corrected + workspace deletion proven programmable (`a7d545579`)
- 2026-08-27  docs(backlog): multiplicity spike settled — many apps per instance, one per workspace (`4acebc556`)
