# App Management support — architecture

Owner decision 2026-08-27 ("build App Management support"), on the research at
`.rptc/research/starter-kit-integration/research.md` plus the external pass on
Adobe's App Management docs (findings cited inline; primary sources:
`adobe/aio-commerce-sdk` monorepo docs incl. the generated app's OpenAPI spec,
developer.adobe.com/commerce/extensibility/app-management/*, Experience League
app-management pages).

## The design gate, answered

**What entity is it?** An App Management app stays a CATALOG INTEGRATION —
`kind: 'integration'` — with two new capability fields on the entry rather
than a new kind:

```json
"layout": "standalone" | "extension",        // default standalone (today's world)
"lifecycle": "deploy-only" | "app-management" // default deploy-only
```

Rejected alternatives: a new `kind` (wrong — to a demo it IS an integration;
kind drives UI grouping and deploy dispatch, and both want these treated as
integrations), and a separate entity/config file (nothing varies except the
deploy path and lifecycle — a parallel catalog would be the two-models drift
this repo keeps deleting).

**What owns it / where it lives:** the existing spine, branched:
`appBuilderComponentRunner` stays the one add path; `deployAppComponent` gains
an extension-layout branch; a new `appManagementClient` (feature: app-builder)
owns the install/associate REST calls. State stays in `appBuilderComponents[id]`
with an added `installation` sub-record (status/associatedInstance/version).

**Product-intent decisions → walkthrough queue** (recommendations attached,
nothing encoded):

1. **Install automation vs hands-back.** The generated app exposes a REAL REST
   API — POST /installation (desired-state install/upgrade), POST/DELETE
   /association, GET status, POST /installation/validation (dry run) — IMS
   clientCredentials + x-gw-ims-org-id. RECOMMEND: automate via this API with
   a hands-back fallback to Commerce Admin ("Apps > App Management >
   Associate") when the call path fails. The ONE unknown is empirical: the
   endpoint's reachable base URL (raw Runtime action URL vs something
   published) — a supervised spike against a real deploy, ~30 min.
2. **One app per workspace.** The config/association design reads
   single-app-per-workspace (singular config, reserved `app-management`
   package, one association per app) — undocumented, inferred. This
   strengthens the parked "per-SC Adobe I/O project" item (AB-2): App
   Management apps likely each want their own workspace. RECOMMEND: treat
   one-per-workspace as the working assumption; revisit AB-2's priority.
3. **ACCS manual step.** On ACCS backends the `ACCS-REST-API` service is NOT
   CLI-subscribable (Console UI only — matches our known product-profile PUT
   limitation). RECOMMEND: surface as a guided handoff in the add flow, same
   pattern as set_setting's hands-back.

## What the research settled (no decision needed)

- **Credentials solved by what we already build.** The six
  `AIO_COMMERCE_AUTH_IMS_*` inputs are the workspace OAuth S2S credential —
  the `demo-builder-s2s` credential `ensureOAuthCredentialId` already creates.
  We hold every value via the Console SDK; injection extends the existing
  two-var pattern (`AIO_RUNTIME_*`) in `runtimeCredentials`. No .env on disk;
  per-invocation env, secrets never written.
- **Init is headlessly drivable**: write `app.commerce.config.ts` first, then
  `npx @adobe/aio-commerce-lib-app init` skips prompts; `generate all` +
  `aio app build --force-build` + `aio app deploy --force-deploy --no-build`.
- **ACCS is first-class** (`commerceEnv: "saas"`); Commerce floor 2.4.5 (with
  Admin UI SDK composer install below 2.4.8); local Commerce unsupported.
- **Node >=22 <=24** (npm engines) — our prerequisites system gates per stack;
  add a node-24 requirement to this component's stack needs.
- Required Console APIs beyond the kit's three: I/O Management, I/O Events,
  I/O Events for Commerce, ACCS API — all but ACCS-REST-API fit the existing
  `requiredApis` union-PUT.
- Upgrades ride `aio app deploy` (generated post-deploy hook reconciles to
  `metadata.version`) — our redeploy path inherits upgrade behaviour free.

## Steps (implementation order; 1–3 unambiguous, 4+ post-review)

1. `step-01` — schema + types: `layout`/`lifecycle` fields (defaults preserve
   today's entries), catalog loader passthrough, tests.
2. `step-02` — extension-layout deploy branch: skip the packages rewrite
   (isolation comes from the workspace, not ow-package renaming — assumption 2
   above), still `aio app build`/`deploy`, S2S env injection alongside
   `AIO_RUNTIME_*`. Guard flips from "reject extension apps" to "reject
   extension apps unless entry declares layout:extension". Tests incl. a
   real-shape fixture from the kit's app.config.yaml.
3. `step-03` — `appManagementClient` from the OpenAPI spec (install / status /
   validate / associate), unit-tested against spec fixtures; NOT wired to the
   add flow yet.
4. `step-04` (post-spike) — wire install/associate per decision 1; state
   sub-record; dashboard row surfacing installation status.
5. `step-05` — the kit catalog entry itself + node-24 prerequisite + ACCS
   handoff; battery prompt; docs.

Supervised edges: the base-URL spike (decision 1); first real deploy+install;
anything touching a live Commerce.
