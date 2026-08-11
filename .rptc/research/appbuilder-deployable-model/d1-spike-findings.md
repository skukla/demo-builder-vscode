# D1 Spike — Findings

**Date started:** 2026-06-20
**Plan:** [`../../plans/appbuilder-deployable-model/overview.md`](../../plans/appbuilder-deployable-model/overview.md) · **ADR:** [ADR-011](../../../docs/architecture/adr/011-app-builder-deployables.md)
**Purpose:** Verify Model B's load-bearing assumptions empirically before building D1.
**Status:** Phase A (desk research) ✅ · Phase B (live run) ✅ — all five questions answered; throwaway torn down clean. See **Conclusion** at the end.

## The five spike questions

1. **Prune isolation** — does deploying integration B prune integration A or the mesh?
2. **Package-name collisions** — does a per-integration package prefix prevent them?
3. **Build/deploy per kind** — does `--production` starve an integration build? does `aio app deploy` build the app itself? double-build risk? → lock the per-kind build policy.
4. **Deploy contract** — run a real mesh repo's *own* `create` script under our org targeting, read back via `aio api-mesh:get`.
5. **API subscription** — is the API Mesh API already on a fresh workspace, or must we build `subscribeCredentialToServices`?

## Spike parameters (decided 2026-06-20)

- **Sequencing:** desk research first, pause before any live cloud op. ✅
- **Throwaway project (PM-provided):** `https://developer.adobe.com/console/projects/<org-id>/<throwaway-project-id>/overview`. **Resolved (2026-06-20):** API org id **`<org-id>`** = *<org-name>* (`<ims-org-code>`); project `<throwaway-project-id>`; default workspaces **Stage** `<stage-workspace-id>` (ns `<org-id>-<throwaway-project>-stage`) and **Production** `<prod-workspace-id>` (ns `<org-id>-<throwaway-project>`), both created 2026-06-20 with Runtime already enabled. **Never** run prune/undeploy probes against the real `<real-project>` project.
- **Org-context note (resolved via the `aio-org-target` skill):** the CLI token was initially bound to org `<other-org-id>` (<other-org-name>) and 400'd on the throwaway (`Project does not belong to org`). `aio login --force` re-bound the token to `<org-id>`. The Console URL's first segment (`<org-id>`) happens to equal the API org id here, but that's coincidental — resolve via `aio console org list --json`, not the URL. The api-mesh plugin's `Selected project: <real-project>` banner is **cosmetic** (reads stale persisted config); the actual call honored the `AIO_CONSOLE_*` env target (error referenced the correct throwaway IDs).
- **Integration sources:** scaffold two minimal action-only apps via `aio app init` (integration A / B) — clean, public-repo-free, and doubles as a D4 AI-shell scaffold rehearsal.
- **Mesh source:** real repo `skukla/commerce-paas-mesh`.

## Environment (verified 2026-06-20)

- `aio` **11.1.2**, Node **20.19.6**; plugins present: `api-mesh` **5.6.1**, `aio app`, `aio runtime`, `aio console`.
- CLI currently pointed at: org *<org-name>* → project **<real-project>** → workspace **Stage** (a REAL project — off-limits for destructive probes).

---

## Phase A — desk research (no auth; pre-answers Q1, Q2, Q3)

### Q1 + Q2 — Prune isolation & package collisions ✅ (mechanism confirmed; live confirmation still wanted)

**Answer: prune is project-scoped, keyed to the OpenWhisk package name. Isolation holds iff each integration uses a DISTINCT `ow.package`. Same namespace is fine; same package name is NOT.**

- `aio app deploy` → `aio-lib-runtime` `deployActions` → `utils.syncProject(packageName, ...)`. Every entity is stamped with a `whisk-managed` annotation `{ projectName, projectHash, ... }`, where **`projectName === ow.package`** (the ownership key) and `projectHash` = SHA1 of the manifest (change-detection only).
- The deploy-time prune (`getProjectEntities(staleHash)` → `undeployPackage`) is bounded to *this* project's entities; a different `projectName` is treated as an "external entity" and **left untouched**. → A second app with a different package name does **not** prune the first. (Same model as Apache wskdeploy.)
- **Caveat — undeploy is broader than the deploy-prune.** `aio app undeploy` → `undeployActions` enumerates the live package and deletes **every action in that package**, including ones it doesn't own. So two apps sharing a package name clobber each other on undeploy *and* on deploy.
- **The trap:** the default package name is `application` (legacy single app) or `dx-excshell-1` (excshell extension). **Two scaffolded apps left at the default WILL collide.** → Model B must enforce a **per-deployable distinct `ow.package`** (override in each app's `app.config.yaml`/`ext.config.yaml`), not rely on defaults. This is exactly the "package prefix" the plan calls for.
- APIs/api-gateway routes carry no managed annotation — not covered by this isolation mechanism (separate concern; note for removal-completeness).

**Implication for D1:** the keyed `deployables` model needs a **collision-free `ow.package` generator** (e.g. derive from the deployable `id`), applied to each integration before deploy. This is the load-bearing isolation guarantee.

Sources: aio-lib-runtime `src/utils.js`, `src/deploy-actions.js`, `src/undeploy-actions.js`, README; Apache openwhisk-wskdeploy sync docs; App Builder configuration docs (`ow.package`). Confidence: HIGH on mechanism; exact patch-version behavior to be confirmed live (Q1 live step).

### Q3 — Build/deploy per kind ✅ (policy locked on evidence; live run to confirm)

**`aio app deploy` builds by default** (`--build` defaults `true`; calls `buildOneExt` before `deployOneExt`). `aio app build`/`deploy` **never run `npm install`** — `build-actions.js` webpack-bundles actions from the *already-present* `node_modules`. Neither command installs deps.

Two confirmed landmines, one of them **already shipped in slice-1 code**:

1. **No-node_modules landmine (SHIPPED BUG for integrations).** `src/core/shell/buildComponent.ts` early-returns when there's no top-level `build` script (`hasBuildScript` false → `buildComponent.ts:65-67`), skipping `npm install` entirely. App Builder integration apps deliberately have **no** top-level `build` script (build is `aio`-driven). So `deployAppComponent` (`src/features/app-builder/services/appDeployment.ts`) → `buildComponent` (no-op) → `aio app deploy` runs against an empty `node_modules` → build error / actions missing deps. The slice-1 deploy path was never live-verified against a real integration (documented PR caveat); this is why.
2. **devDeps-starvation landmine.** `INSTALL_COMMAND = 'npm install --production --no-fund --ignore-scripts'` (`buildComponent.ts:34`). `--production` drops devDependencies, where webpack/parcel/babel/tsc live → an integration's `aio app build` can't resolve its bundler.
3. **Double-build (wasteful, not harmful).** Running `aio app build` ourselves AND a default-build `aio app deploy` re-builds; `npm run build` is a *different* build from `aio app build` (npm script vs `app.config.yaml`-driven). Dedup via `aio app build` + `aio app deploy --no-build` if we ever split them.
4. **`--ignore-scripts`** silently skips postinstall — fine for the inspected Adobe templates (none require it) but risky for arbitrary integration repos with native/postinstall-built deps.

**Locked per-kind build policy (to confirm live):**
- **MESH** — keep current: `npm install --production --no-fund --ignore-scripts` → `npm run build -- --force` (mesh repos *have* a real `build` → `mesh.json`; only runtime deps; survives `--production`).
- **INTEGRATION** — **diverge:** full `npm install`/`npm ci` **incl. devDeps** (drop `--production`); install **unconditionally** (do NOT gate on a top-level `build` script); reconsider dropping `--ignore-scripts`; then let `aio app deploy` drive the build (don't also `npm run build` / don't double-build). Run a repo's own top-level `build` only when it actually declares one that feeds `aio app build`.

**Implication for D1:** `buildComponent` must become kind-aware (or grow an integration-specific install path). The byte-identical-build assumption from slice-1 (Option A) does **not** survive contact with real integration apps — this is a concrete, tested reason the Model B course-correction is needed, not just a modeling preference.

Sources: aio-cli-plugin-app `src/commands/app/deploy.js`+`build.js` (v13.1.3), aio-lib-runtime `src/build-actions.js`, adobe/aio-apps-action README, App Builder deployment + cicd docs, Context7 `/adobe/aio-cli-plugin-app`. Confidence: HIGH (read from CLI/lib source).

### Q4 — Deploy contract (desk portion)

The three mesh repos ship self-deploying scripts (`build: node scripts/build-mesh.js`, `create: npm run build && aio api-mesh:create`, `update: ... update-mesh.js`). Today `deployMeshComponent` (`src/features/mesh/services/meshDeployment.ts`) uses only `build` and **reimplements** the deploy (`aio api-mesh:create|update "<meshConfigPath>" --autoConfirmAction`), bypassing the repo's own `create`/`update`. The deploy-contract direction is to run the repo's *own* deploy script inside `withOrgContext` and read results back. **Live step Q4** validates that a repo's own `create` script inherits our org targeting (env-based, not `aio console select`) and that `aio api-mesh:get` reads the endpoint back. *(Desk research can't confirm targeting inheritance — that's the live probe.)*

### Q5 — API subscription (desk portion)

Slice-1 only does `createWorkspaceCredential`; `subscribeCredentialToServices` is **unbuilt**. The mesh path today assumes the API Mesh API is already present on the workspace. Whether a *fresh* workspace already carries the API Mesh API (making subscription optional) vs. requires an explicit subscribe is **the** thing the live probe must settle — it decides whether `subscribeCredentialToServices` is truly on D1's critical path. *(Desk research can't answer this; it's environment state.)*

**Live (read-only) result — 2026-06-20:** `aio api-mesh:get` against the fresh throwaway **Stage** workspace returned **"No mesh found"** (exit 0), NOT an authorization / "API not subscribed" error. So the API-Mesh control plane is reachable on a bare fresh workspace **without** an explicit API subscription and **without** an added S2S credential (it authenticates with the user token). → Preliminary: `subscribeCredentialToServices` is likely **NOT** required for the **mesh** kind. CAVEAT: a successful read doesn't prove `api-mesh:create` (write) succeeds without subscription — that needs the first write (next step). Integrations (`aio app deploy`) are a separate question: they may still need an S2S credential and/or their own product APIs.

#### Auto-provisioning capability map (CLI + SDK, cross-referenced to existing code)

Decided 2026-06-20 (PM: "test auto creation of as much as possible"). Sources: `appbuilder-project-init` skill (CLI recipe), `aio-lib-console` SDK, existing `adobeEntityFetcher.ts`/`adobeSDKClient.ts`.

| Provisioning step | CLI (non-interactive) | SDK method (`aio-lib-console`) | Built in extension? |
|---|---|---|---|
| Create workspace | `aio console workspace create --projectName P --name Stage --json` | `createWorkspace(orgId, projId, {...})` | No |
| Discover org services | `aio console api list --json` (entries flagged for product-profile need) | `getServicesForOrg(orgId)` → sdkCodes | No |
| Create S2S credential | implicit on first `workspace api add` | `createOAuthServerToServerCredential(orgId, projId, wsId, name, desc)` → `{ id, apiKey }` | **YES** (`adobeEntityFetcher.ts:484`; handles 409-exists) |
| Subscribe credential → services | `aio console workspace api add --service-code CODE [--license-config CODE=PROFILE]` (comma-list; `--license-config` repeatable) | `subscribeCredentialToServices(orgId, projId, wsId, 'oauth_server_to_server', credId, services)` | **NO — the unbuilt gap** |
| Get runtime creds (for `aio app deploy`) | `aio app use --no-input` (adopts selected ws) / `init … --org --project` | `downloadWorkspaceJson(orgId, projId, wsId)` | No |
| List existing creds | — | `getCredentials(orgId, projId, wsId)` | **YES** (`adobeEntityFetcher.ts:405`) |

- SDK auth: `sdk.init(accessToken, 'aio-cli-console-auth')` (`adobeSDKClient.ts:138`) — token from `inspectToken()` (CLI config), validated before use.
- **CLI `workspace api add` ≈ the unbuilt `subscribeCredentialToServices`** and (per skill) auto-creates the workspace's OAuth S2S credential on first add. The product-profile case = `--license-config CODE=PROFILE` (SDK: `licenseConfigs` in the `services` entries).
- **Implication for D1:** the unbuilt step is `subscribeCredentialToServices`; credential creation + listing already exist. D1 builds the SDK subscribe call (mirrors the CLI `workspace api add`), gated by each deployable's `requiredApis` → sdkCode resolution via `getServicesForOrg`. The live run validates the SDK path end-to-end (highest fidelity to what D1 will ship).

#### Q5 — RESOLVED (live, 2026-06-20)

Exercised the exact `aio-lib-console@5.4.2` SDK methods (CJS node script, token via `aio-lib-ims@7.0.2` `getToken('cli')`, `sdk.init(token,'aio-cli-console-auth')`) against the fresh throwaway **Stage**:

1. **`getServicesForOrg(orgId)`** → 94 services. API Mesh entry: `id:251, code:"GraphQLServiceSDK", type:"adobeid", platformList:["apiKey"], oauthServerToServerOnly:false, entitledForOrg:true`. (CLI `api list` showed the org-entitled subset, 27, incl. API Mesh + I/O Management = free.)
2. **`getCredentials`** on a fresh workspace → **0** credentials. Credential entries key the id as **`id_integration`** (NOT `.id`) + `id_workspace`, `flow_type:'entp'`, `integration_type:'oauth_server_to_server'`.
3. **`createOAuthServerToServerCredential(org,proj,ws,name,desc)`** → **OK** (`id:<credential-id>`, `apiKey` present) on the bare workspace — no pre-subscription needed. (This is the already-built path in `adobeEntityFetcher.ts`.)
4. **Subscribe (the unbuilt gap) — VALIDATED.** The blessed call is **`subscribeOAuthServerToServerIntegrationToServices(orgId, credentialId=id_integration, [{ sdkCode, licenseConfigs:null, roles:null }])`** → `AdobeIOManagementAPISDK` returned **200 `{ sdkList:["AdobeIOManagementAPISDK"] }`**. (My first attempt failed two ways, both instructive: the generic `subscribeCredentialToServices(...,credentialType,...)` 400'd; and the credentialId must be `id_integration`.)
   - **API Mesh is NOT subscribable this way:** `GraphQLServiceSDK` → 400 **"Invalid service [GraphQLServiceSDK]"** (it's an `adobeid`/`apiKey` service, not an S2S-platform service).
5. **`api-mesh:create` on the fresh workspace SUCCEEDED** with the credential present but API Mesh **not** subscribed → mesh `<mesh-id>`, endpoint `https://edge-sandbox-graph.adobe.io/api/<mesh-id>-.../graphql`; verified via `api-mesh:get` that it landed in the throwaway (Q4 read-back works).
6. **`downloadWorkspaceJson`** after credential creation → `credentials=1, runtime=present` → `aio app deploy` will have its Runtime auth.

**Q5 verdict:**
- **MESH kind DOES require the API Mesh API on the workspace (CORRECTED 2026-06-20).** Earlier I wrote "mesh needs no API" — that was WRONG. Per Adobe docs (ExL "Working with projects and workspaces": `Organization > Project > Workspace > [API]`, with an explicit "Adding API Mesh to the workspace" step), the **"API Mesh for Adobe Developer App Builder" API (`GraphQLServiceSDK`)** must be added to the workspace. It is an **`adobeid`/`apiKey`-platform** service, so it is added via an **API-Key (AdobeID) credential** — SDK path `createAdobeIdCredential` + `subscribeAdobeIdIntegrationToServices`. My spike's `api-mesh:create` succeeded without an explicit add (the CLI/user-token path provisioned it implicitly or org entitlement allowed the control-plane call) and my subscribe 400 was **wrong-credential-type** (I used the OAuth-S2S method on an apiKey service), NOT evidence the API is unneeded. So `subscribeCredentialToServices`-equivalent **IS** needed for mesh too — via the apiKey path, not the S2S path. **PROVEN live (2026-06-20):** `createAdobeIdCredential(org, proj, ws, { name, description, platform:'apiKey', domain:'<allowed-domain>' })` → then `subscribeAdobeIdIntegrationToServices(org, id_integration, [{ sdkCode:'GraphQLServiceSDK', licenseConfigs:null, roles:null }])` → **200 `{ sdkList:['GraphQLServiceSDK'] }`**. **The `domain` is MANDATORY for API Mesh** (`domainMandatory:true` in the service entry) — omit it and the subscribe 400s "Allowed domain is mandatory for API Mesh… Please set the domain for the credential." (Adding APIs to a workspace via API IS possible — the earlier doubt was warranted, the blocker was just the missing domain.)
- **INTEGRATION kind:** S2S credential creation (built) + `subscribeOAuthServerToServerIntegrationToServices` (validated) is the path for an integration's `requiredApis`. Free services → `licenseConfigs:null, roles:null`; profile-bound services → populate `licenseConfigs` (the `--license-config` analog). API-Mesh-as-an-API is irrelevant to integrations.
- **`getServicesForOrg` resolves a deployable's `requiredApis` (names) → sdkCodes** for the subscribe call.

**D1 build note:** the unbuilt piece is a `subscribeCredentialToServices` reconciler that **branches by service `platformList`** — `subscribeOAuthServerToServerIntegrationToServices` (org + `id_integration` + serviceInfo) for S2S services, and `createAdobeIdCredential` + `subscribeAdobeIdIntegrationToServices` for apiKey/AdobeID services (incl. **API Mesh `GraphQLServiceSDK`**), fed by `getServicesForOrg` lookup. S2S credential create + list already exist in `adobeEntityFetcher`; the AdobeID/apiKey credential path is additional (and **must set a `domain`** when the service has `domainMandatory:true`, e.g. API Mesh — proven live). Mesh deployables are **NOT** skipped — they require the API Mesh API via the apiKey path. **Domain value:** replicate the shipped experience — the selected frontend's `localhost:<port>` (`helpers/setupInstructions.ts`); it's a formality to satisfy `domainMandatory`, not a runtime gate (working demos prove localhost suffices). Not the hardcoded `example.com` the spike used.

**Remaining live steps:** Q4-full (run `skukla/commerce-paas-mesh`'s OWN `create` script under env targeting — deploy-contract/targeting inheritance), Q3+Q1/Q2 (scaffold two integrations, deploy, confirm prune isolation + package-prefix collision + integration build policy), then teardown (delete mesh `<mesh-id>` + credential + any apps).

---

## Phase B — live run plan (⏸ awaiting explicit go)

Run against the throwaway project (`<org-id>` / `<throwaway-project-id>`) only. Order chosen cheapest-first / highest-leverage-first.

0. **Context safety.** Target the throwaway via per-op env (`AIO_*` / `withOrgContext`-style), `aio where` to confirm we are NOT mutating `<real-project>`. Create a fresh workspace in the throwaway project for the probes.
1. **Q5 (cheapest, highest leverage).** On the fresh workspace, inspect subscribed services; attempt `aio api-mesh:get` / a no-op api-mesh call. Determine: is API Mesh API already present, or does it require an explicit subscribe? → decides `subscribeCredentialToServices` criticality.
2. **Q4.** Clone `skukla/commerce-paas-mesh`, run its own `create` script under throwaway org targeting; confirm targeting inheritance; read back endpoint via `aio api-mesh:get`.
3. **Q3.** Run one mesh repo + one scaffolded integration through build+deploy; observe install/build/double-build; confirm the locked per-kind policy (esp. that an integration needs full install incl. devDeps and that gating on a `build` script breaks it).
4. **Q1 + Q2 (the gate).** `aio app init` integration A (package `a-*`) → deploy; `aio app init` integration B (package `b-*`) → deploy; deploy the mesh too. After each, `aio runtime package list` / action list to confirm B's deploy did NOT prune A or the mesh, and distinct package names prevented collisions. Then deliberately retest the default-package collision to confirm the trap.
5. **Teardown.** `aio app undeploy` both integrations, `aio api-mesh:delete`, delete the throwaway workspace/project entities. Confirm clean.

**After Phase B:** finalize answers here, then write the D1 TDD plan (`.rptc/plans/appbuilder-deployable-model/step-*.md`), with the collision-free `ow.package` generator and the kind-aware build policy as first-class, test-first work items.

## Carry-forward implications for D1 (already actionable from Phase A)

- **Kind-aware build** is required — the shipped byte-identical `buildComponent` is a latent integration-deploy bug. Fix with tests (RED first: an integration with no top-level `build` script must still get `node_modules`).
- **Collision-free `ow.package` per deployable** is the isolation primitive — derive from the deployable `id`; never let two apps share `application`/`dx-excshell-1`.
- **Removal completeness:** api-gateway routes aren't covered by managed-project prune — track separately.

---

## Phase B — live results: Q1/Q2/Q3/Q4 (2026-06-20)

Against throwaway Stage (`<org-id>` / `<throwaway-project-id>` / `<stage-workspace-id>`), two minimal
standalone apps (one web action each), **distinct package names** `a-spike-pkg` / `b-spike-pkg`,
deployed with `aio app deploy` using Runtime auth from `downloadWorkspaceJson` + `AIO_CONSOLE_*`/
`AIO_RUNTIME_*` env (no `aio console select`).

- **Q1 + Q2 — PROVEN.** Deploy A → `a-spike-pkg`. Deploy B into the **same** namespace → `aio runtime
  package list` shows **both** `a-spike-pkg` and `b-spike-pkg`; `action list` shows both `*/ping`.
  B's deploy did **not** prune A. Distinct `ow.package` = full isolation, exactly as Phase A's source
  reading predicted.
- **Removal isolation — PROVEN (bonus).** `aio app undeploy` B left `a-spike-pkg` intact; undeploy A
  then emptied the namespace. → Model B's "remove one deployable, others untouched" holds for real.
- **Q3 — integration deploy confirmed.** `aio app deploy` auto-built + deployed (`--build` default on);
  trivial dep-free actions needed no `npm install`, so this run doesn't re-trigger the no-node_modules
  landmine — but that landmine + the per-kind build policy remain **source-locked** from Phase A and
  must still drive the D1 build code (an integration WITH a bundler/deps would have failed under the
  shipped `--production`/skip-install `buildComponent`).
- **Q4 — deploy-contract mechanics confirmed.** `AIO_CONSOLE_*` targeting is honored by both
  `aio api-mesh:*` and `aio app deploy` (entities landed in the throwaway namespace; the plugins'
  `Selected: <real-project>` banner is cosmetic). `api-mesh:create` → endpoint, read back via
  `api-mesh:get`. *Deferred by PM choice:* running `skukla/commerce-paas-mesh`'s OWN `create`/`update`
  npm scripts end-to-end — low residual risk since targeting-inheritance + create + readback are all
  proven; validate when wiring the deploy-contract in D1.
- **Teardown.** `api-mesh:delete` (mesh `<mesh-id>`), `deleteCredentialById` (cred `<credential-id>`, 200,
  0 remaining), namespace empty, `api-mesh:get` → "No mesh found". Throwaway pristine.

## Conclusion — Model B's load-bearing assumptions hold; D1 is unblocked

| # | Question | Verdict |
|---|---|---|
| Q1 | Prune isolation (B doesn't prune A/mesh) | ✅ **Holds** with distinct `ow.package` (live + source) |
| Q2 | Package-prefix prevents collisions | ✅ **Yes** — `ow.package` is the isolation boundary; default `application`/`dx-excshell-1` is the trap |
| Q3 | Build per kind | ✅ **Policy locked** — mesh keeps repo build; integration = full `npm install` incl. devDeps, let `aio app deploy` build; the shipped `buildComponent` no-install-without-build-script is a **real bug to fix in D1** |
| Q4 | Deploy contract / targeting | ✅ **Mechanics proven**; honor repo scripts under `withOrgContext`; read back via `api-mesh:get`/`app get-url` |
| Q5 | API subscription | ✅ **Two paths by service platform.** **Mesh REQUIRES** the API Mesh API (`GraphQLServiceSDK`, apiKey) → `createAdobeIdCredential` + `subscribeAdobeIdIntegrationToServices`. **OAuth-S2S** services (e.g. `AdobeIOManagementAPISDK`) → `createOAuthServerToServerCredential` (built) + `subscribeOAuthServerToServerIntegrationToServices` (validated). Branch on each service's `platformList`. |

**D1 work items the spike makes concrete (test-first):**
1. **Collision-free `ow.package` per deployable** (derive from deployable `id`) — the isolation primitive; never default.
2. **Kind-aware build** — fix `buildComponent`: integrations get a full devDeps `npm install` (unconditional, drop `--production`), mesh keeps its build. RED test: an integration with no top-level `build` script must still get `node_modules`.
3. **`subscribeCredentialToServices` wrapper** over `subscribeOAuthServerToServerIntegrationToServices(orgId, id_integration, [{sdkCode, licenseConfigs, roles}])`, fed by `getServicesForOrg` name→sdkCode lookup; **skip entirely for `kind:"mesh"`**; honor product-profile (`licenseConfigs`) for profile-bound services.
4. **Deploy-contract runner** — clone → install (per kind) → run the deployable's own deploy script under `withOrgContext` → read back endpoint/URLs.
5. Reuse: `createOAuthServerToServerCredential` + `getCredentials` (`adobeEntityFetcher`), `withOrgContext`/`buildAioConsoleEnv`, `buildComponent` (made kind-aware), `deployMeshComponent`/`deployAppComponent` deploy tails.

**Caveat captured:** credential id for subscribe is `id_integration` (not `.id`); api-mesh plugin banner reads stale persisted selection (cosmetic) — verify by entity IDs, not the banner.

---

## API-subscription handling — canonical design for D1 (the "each deployable needs APIs" problem)

**The mechanics:** a demo has one App Builder project with one shared S2S credential (provisioned once
per ADR-011). APIs are subscribed onto that credential. Each deployable declares which APIs it needs
(`requiredApis`). The subscribe call (a PUT to `.../services`) **sets the full API list at once** — it
replaces, it does not append — so subscribing only deployable B's APIs later can drop deployable A's.

**The rule: subscribe the UNION, reconcile idempotently.** On every add/change, compute the union of
`requiredApis` across ALL current deployables + a platform baseline, resolve to sdkCodes, and PUT that
full set onto the one shared credential. Robust whether the endpoint replaces or merges.

```
addDeployable(d):
  ensure project + workspace exist
  apis      = ⋃ requiredApis(all deployables incl. d) ∪ { AdobeIOManagementAPISDK }   # mesh's requiredApis includes GraphQLServiceSDK
  services  = resolve(apis) via getServicesForOrg(orgId)     # each carries platformList + licenseConfigs
  # branch by platform — a service is added to the workspace via the credential type its platformList allows
  s2s       = services.filter(s => s.platformList includes 'oauth_server_to_server')
  apiKey    = services.filter(s => s.platformList includes 'apiKey')   # e.g. API Mesh (GraphQLServiceSDK)
  ensure shared S2S credential  -> subscribeOAuthServerToServerIntegrationToServices(orgId, credId=id_integration,
                                       s2s.map(c => ({ sdkCode, licenseConfigs: profileFor(c) ?? null, roles: null })))
  ensure apiKey/AdobeID cred    -> createAdobeIdCredential(orgId, projId, wsId,
                                       { name, description, platform:'apiKey', domain: allowedDomain })   # domain MANDATORY for API Mesh
                                   then subscribeAdobeIdIntegrationToServices(orgId, intId /* = id_integration */,
                                       apiKey.map(c => ({ sdkCode, licenseConfigs: profileFor(c) ?? null, roles: null })))
  deploy(d)
```

**Design decisions:**
- **One shared credential, union of APIs** — not per-deployable credentials, not incremental add.
  (Per-deployable credentials only if we ever need to scope API access between integrations — YAGNI now.)
- **Branch by service platform (CORRECTED).** Each service's `platformList` decides the path: `apiKey`/AdobeID services (incl. **API Mesh `GraphQLServiceSDK`**) → `createAdobeIdCredential` + `subscribeAdobeIdIntegrationToServices`; `oauth_server_to_server` services (e.g. `AdobeIOManagementAPISDK`) → `subscribeOAuthServerToServerIntegrationToServices`. A mesh deployable's `requiredApis` therefore includes `GraphQLServiceSDK` via the apiKey path — mesh is NOT skipped (my earlier "skip mesh" was based on the wrong-credential-type 400).
- **Baseline always included** — `AdobeIOManagementAPISDK` (free) for `aio app` operations.
- **Removal leaves APIs subscribed** — don't reconcile-down; a still-present deployable may depend on a
  shared API, and extra subscriptions are harmless. (Matches the plan's "leave APIs subscribed" note.)
- **Profile-bound APIs are the HIGH gap** — free APIs subscribe with `licenseConfigs:null`. A paid API
  (Analytics, Asset Compute, …) needs a product-profile name in `licenseConfigs`, which a human must
  supply. A catalog entry whose `requiredApis` includes a profile-bound service must carry/prompt for
  the profile. This is the one non-push-button part of provisioning.

**Reuse:** `createOAuthServerToServerCredential` + `getCredentials` (`adobeEntityFetcher`); new = the
union/reconcile wrapper over `subscribeOAuthServerToServerIntegrationToServices` + `getServicesForOrg`
name→sdkCode resolution. Runs in the **add** path before deploy; idempotent; mesh-skipping.

**D1 follow-up probe (add ~2 min to the plan):** confirm PUT semantics — subscribe `[A]`, then
subscribe `[B]` alone; check whether the credential ends `[B]` (replace) or `[A,B]` (merge). The union
design is correct either way; this just lets the D1 tests assert the reconcile result. (Not run in this
spike — only a single-service subscribe was validated.)

---

## Current mesh experience: the API-Mesh-API step is MANUAL today (major implication)

Traced in the shipped code (2026-06-20):

- **Detection:** `handleCheckApiMesh` (`src/features/mesh/handlers/checkHandler.ts`) downloads the workspace
  config and inspects `project.workspace.details.services` for the API Mesh API. Absent → `apiEnabled:false`.
- **Remediation is MANUAL.** The extension does NOT add the API. It returns `setupInstructions` from
  `src/features/project-creation/config/api-services.json` (`services.apiMesh.setupInstructions`),
  rendered in `MeshErrorDialog` with an "Open Console" button, telling the user to do it by hand in the
  Adobe Developer Console UI:
  1. "click 'Add service' → 'API' → filter Adobe Experience Platform → API Mesh"
  2. "Click 'API Mesh for Adobe Developer App Builder' to add it… Click 'Next' twice to set up API authentication"
  3. "add '{{ALLOWED_DOMAINS}}' to the Allowed Domains list" — `{{ALLOWED_DOMAINS}}` = the selected
     frontends' **`localhost:<port>`** (`helpers/setupInstructions.ts`).
- **The extension only ever creates the S2S credential** (`createWorkspaceCredential` →
  `createOAuthServerToServerCredential`); it never adds the API Mesh API or sets an allowed domain.

**Why this matters (the implication):**
1. **The mesh flow we ship today has a manual Console-UI prerequisite** for every mesh. The spike proved
   that step is fully automatable (`createAdobeIdCredential{platform:'apiKey',domain}` +
   `subscribeAdobeIdIntegrationToServices('GraphQLServiceSDK')` → 200). So D1's subscriber doesn't just
   enable new integrations — it can **remove existing manual friction from the current mesh experience**.
2. **Allowed domains today are just the frontends' `localhost:<port>`** (`helpers/setupInstructions.ts`
   maps each selected frontend to `localhost:${port}`, default `localhost:3000`). There is **no**
   production/remote-domain handling anywhere in the code. Since shipped demos run with this and work,
   the mandatory `domain` is effectively a **formality to satisfy the Console's required field**, not a
   runtime access control we depend on. → **CORRECTION:** my earlier "domain is a load-bearing product
   decision" was overstated. D1 should simply **replicate the shipped behavior** — set `domain` to the
   selected frontend's `localhost:<port>` — to satisfy `domainMandatory`. Not an open product question.
3. **Built-in verification:** automation success ≡ the API Mesh API appears in
   `workspace.details.services` (the same signal `checkApiMesh` reads) — reuse it as the post-deploy check.

**D1 impact:** the API-subscription work item is now also a **mesh-experience upgrade** (manual → automatic):
D1 automates exactly the three manual steps, setting the credential `domain` to the selected frontend's
`localhost:<port>` (the value the shipped `setupInstructions` already use). The domain is a formality for
`domainMandatory`, not a product decision — replicate today's behavior; remove the `MeshErrorDialog`
manual path once the automation lands.

---

## Settings posture for D1 (setting vs derive vs hardcode)

PM opened the door to making values into VS Code settings (2026-06-20). Applying KISS/YAGNI + repo
conventions (`customBlockLibraries` settings-list pattern; secrets via SecretStorage, never settings —
the repo is PUBLIC, see [[feedback_secrets_in_public_repo]]):

| Value | Decision | Rationale |
|---|---|---|
| API Mesh credential `domain` | **Derive** (frontend `localhost:<port>`) — NO setting | Inert formality; shipped demos prove localhost works. Optional override setting only if a real production-domain need is later proven. |
| `ow.package` per deployable | **Derive** from deployable `id` | Internal isolation primitive; never user-facing. |
| A deployable's `requiredApis` | **Catalog config** (declarative) | Lives in the new catalog entry, like `block-libraries.json`. |
| Custom deployable repo URLs (custom-URL acquisition mode) | **Setting (list)** — mirror `customBlockLibraries` | User-facing, consistent with existing pattern. |
| Integration secret env inputs (e.g. `ERP_API_KEY`) | **VS Code SecretStorage** — NOT settings | Secrets never committed/in settings (public repo). |
| Integration non-secret env inputs | **Configure UI → `componentConfigs`** (`.demo-builder.json`) | Per-project, not global. |
| Profile-bound API product-profile name | **Defer (YAGNI)**; per-catalog-entry or prompt when first needed | No current deployable requires a paid/profile-bound API. |

**Principle:** internal mechanics (domain, `ow.package`, baseline APIs, build policy) are derived/hardcoded;
only genuinely user-facing choices become settings (custom deployable URLs), and secrets go to SecretStorage.

---

## Two distinct "domain" concepts (don't conflate) — 2026-06-20

Raised by PM ("what if a user needs a specific domain/port to connect to another service?").

1. **API Mesh credential allowed `domain`** (Console-side field on the apiKey credential).
   - Inert formality; today hardcoded to the frontend `localhost:<port>`.
   - **D1:** derive `localhost:<port>` by default; allow an **optional catalog-entry `domain` override** (not
     a global VS Code setting). Minimal surface; a deployable needing a specific allowed domain declares it.

2. **A domain/port the deployable's CODE connects to** (e.g. an integration calling an external ERP at
   `erp.example.com:8443`) — NOT the credential allowed-domain.
   - This is a **runtime input**, handled by the env-var graph: catalog entry declares `requiredEnvVars`
     (`ERP_HOST`, `ERP_PORT`, …) → collected via the Configure UI into `componentConfigs` → `.env`; secrets
     → VS Code SecretStorage. This is the "catalog brings its own env schema" HIGH gap already in the plan.
   - So arbitrary "connect to service X at host:port" is supported via per-deployable env inputs — no
     bespoke setting needed.

**Rule:** allowed-domain = derive + optional catalog override; service-connection targets = catalog
`requiredEnvVars` collected at configure-time (secrets in SecretStorage).

---

## What the API Mesh credential's "Allowed Domains" is actually for (evidence-based, 2026-06-20)

PM asked the direct question. Answered from Adobe docs + our code (not assertion):

- **Generic meaning (Adobe docs):** "To restrict which origins can use the key, configure allowed domains."
  → Allowed Domains is a **browser-origin allowlist on the credential's API key** (a referer/origin check on
  who may use that `x-api-key`). It governs *key usage*, not the mesh's existence.
- **Our architecture does NOT use that key.** `configGenerator.generateHeaders` shows the storefront calls
  the mesh (as its commerce endpoint) sending only **`x-api-key: commerceApiKey`** (the Commerce/Catalog
  key, forwarded by the mesh to the backend) — never the API Mesh *credential's* API key. The mesh endpoint
  is consumed without that credential's key (my bare-mesh `create` returned a working endpoint with no
  credential at all).
- **Therefore the Allowed Domains value is not load-bearing for our storefront→mesh path.** Today's
  `localhost:<port>` gates a key our demos don't use → it's a placeholder satisfying the mandatory field.
  This is *why* localhost works in production.
- **Caveat (the real "specify a domain" case):** if a deployable opts into securing its mesh with its OWN
  API key (mesh-level auth tied to that credential), Allowed Domains becomes load-bearing and localhost
  would block remote storefronts. The current architecture doesn't do this; a future deployable that does
  would declare its allowed domain (catalog override) — the case the optional override is for.

**D1 takeaway:** keep deriving `localhost:<port>` for the mandatory field (matches shipped, key unused);
provide the optional catalog `domain` override for the future mesh-API-key-secured case. Not a global setting.

---

## CORRECTION: allowed-domain is NOT a pure formality (2026-06-20)

I overstated "the domain is inert / a placeholder." PM pushed back: is there really *never* a case an end
user needs the `localhost:<port>` value? Re-examining:

- **Counter-evidence in our own code:** `setupInstructions.ts` does not emit a constant placeholder — it
  **deliberately derives each selected frontend's real `localhost:<port>`**. You don't compute a precise
  per-frontend value for something unused. → the allowed-domain value **is consumed**, most plausibly for
  **local development** (storefront at `localhost:<port>` making browser calls to the mesh / its origin
  allowlist).
- **What I actually proved was narrower:** `configGenerator` shows the storefront sends the *Commerce
  catalog* `x-api-key` (not the mesh credential's key). That does NOT prove the mesh endpoint ignores the
  credential's allowed-domains as a CORS/origin gate. I conflated "doesn't send the mesh key" with "domain
  is inert" — not the same thing.
- **Honest position:** there is at least one real case (local dev), and by extension non-default scenarios
  (non-standard dev host, remote/production browser origin, mesh secured with its own key) where the user
  needs a value other than the derived `localhost:<port>`. → the allowed-domain should be **user-overridable**,
  default = derived `localhost:<port>`. NOT derive-only.

**Still unproven (needs an empirical test):** does the mesh ENDPOINT enforce the credential's allowed
domains as CORS? Test = create a mesh with a known allowed-domain, hit the endpoint with matching vs
non-matching `Origin` headers and observe. Until then, treat allowed-domain as **potentially load-bearing**.

**Settings posture — REVISED:** allowed-domain = default-derive `localhost:<port>` **+ user override**
(catalog field and/or VS Code setting), because end users can legitimately need a different value. This
supersedes the earlier "derive only, not a setting" row.

---

## DEFINITIVE: origin/CORS for the mesh lives in mesh.json, not the Console credential (2026-06-20)

PM pointed at the CitiSignal **headless** frontend (Next.js, `localhost:3000`, browser GraphQL to the mesh) —
the path my EDS-only analysis missed. Checked the actual mesh repo `skukla/headless-commerce-mesh`:

- **`mesh.json` → `responseConfig.CORS`**: `{ credentials:true, methods:[GET,POST], origin:"*" }`. The mesh
  advertises **wildcard CORS** — ANY browser origin (incl. `localhost:3000`) may call it. **This** is what
  lets the headless frontend reach the mesh — the mesh's OWN config, not the Console credential.
- **Data auth:** `mesh.json` `schemaHeaders: { x-api-key: {env.ADOBE_CATALOG_API_KEY} }` and
  `operationHeaders: { X-Api-Key: {context.headers['x-api-key']} }` → the mesh forwards the **Commerce
  catalog key** to the backend; the frontend passes it + store/customer headers. The mesh credential's own
  API key is not used.

**This finally resolves the oscillation (with direct evidence):**
- Browser→mesh origin control = **`mesh.json responseConfig.CORS.origin`** (deployable-owned; currently `"*"`).
- The Console API Mesh credential's "allowed domains" (derived `localhost:<port>` by `setupInstructions`) is
  a separate, mandatory-Console field our demos do **not** rely on at runtime (CORS is `*`, data key is the
  catalog key). It is effectively a formality **for the current architecture**.
- PM's instinct ("the port matters for frontend→mesh") is correct about *origin mattering* — but the lever
  is `mesh.json` CORS, not the credential and not a VS Code setting.

**Corrected design consequence (supersedes the prior "make allowed-domain a setting" swing):**
- Console credential `domain`: **derive `localhost:<port>`** to satisfy `domainMandatory`. No setting.
- Origin/port restriction (if a demo ever needs to lock down origins): set **`responseConfig.CORS.origin`
  in the mesh deployable's `mesh.json`** (repo-owned, part of the deploy-contract) — not the extension.
- Optional credential-domain override remains only for the (not-currently-used) mesh-API-key-secured case.

**Meta-note:** I reversed position on this 3×, each time from partial evidence (CLI create success; configGenerator
key; deliberate port derivation). The `mesh.json` CORS block is the first decisive evidence — trust it over the
earlier inferences.

---

## D2 UX rule: "what the user must provide" per deployable (capture for design, 2026-06-20)

PM point: as someone configures what to deploy, the UX must account for what THEY need to provide. The
selection/config surface classifies every input a deployable needs into three buckets and only ASKS for one:

1. **Auto-provisioned — never ask.** App Builder project/workspace/namespace, S2S + apiKey credentials,
   API subscriptions (`requiredApis`), `ow.package`, Console allowed-domain (`localhost:<port>`). (All from
   the spike automation.)
2. **Auto-wired from another deployable — never ask; show as "connected."** `providesEnvVars` →
   consumer links (mesh `MESH_ENDPOINT` → storefront; an integration that calls the mesh). Render as a
   dependency, not a field; enforce provider-before-consumer ordering.
3. **User-provided — ASK (the collection surface).** A deployable's catalog `requiredEnvVars` MINUS
   bucket 2 MINUS anything already known from the project's backend/storefront config = the residual the
   user must enter. Mesh: usually just backend connection details (often already captured at
   Connect-Commerce → may be zero new inputs). Integration: its own inputs (e.g. `ERP_HOST`, `ERP_PORT`,
   `ERP_API_KEY`).
   - **Split secret vs non-secret:** secrets → masked input → VS Code SecretStorage (never committed);
     non-secrets → Configure → `componentConfigs` → `.env`.

**Enabler:** each catalog entry declares its **own env schema** — `{ name, type: text|secret, label,
derivedFrom?/providedBy? }` — so the UX can compute the residual (bucket 3) instead of dumping all vars on
the user. This is the "catalog brings its own env schema + generic collection surface" HIGH gap; this rule
is its UX spec. Generalizes the current Commerce-shaped Configure screen.

**Net:** the configuration UX shows, per selected deployable: auto-handled (informational), connected
(dependency links), and "you provide" (the only editable fields, secrets masked). Feeds D2.
