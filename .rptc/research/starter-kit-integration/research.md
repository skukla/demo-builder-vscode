# Can we scaffold Commerce integrations from adobe/commerce-integration-starter-kit?

**Answer: not through the pipeline we have — the kit on `main` is rejected at
our standalone-app gate before a deploy is even attempted.** The item's premise
("add a catalog entry pointing at the kit") fails on first contact with both
repos' reality. What remains is a modeling decision, framed at the end.

Hybrid research, 2026-08-27, two independent report-only passes: the kit repo
via `gh` reads, and our spine on branch `loop/2026-08-27-starter-kit`. Facts
below are cited to their source; the synthesis section separates inference.

## The kit on main is a different GENERATION than the item assumed

The item (filed 2026-08-26) described `src/`, `install.yaml`, an onboarding
script, and the "6-file handler structure". The repo's `main` is the
**v4.0.0 "App Management" generation** (release 2026-07-16; old code preserved
on the `legacy` tag):

- **No onboarding scripts.** `package.json` has no `onboard`, no
  `commerce-event-subscribe`, no build/deploy scripts. README: "Event
  subscriptions, installation, and authentication are declared in
  `app.commerce.config.ts` and managed by App Management, so the manual
  onboarding scripts are no longer needed."
- **The root `app.config.yaml` is a 9-line EXTENSION shell** — one extension
  `commerce/extensibility/1` including `src/commerce-extensibility-1/
  ext.config.yaml`, where the real runtime manifest lives (~11 packages:
  per-entity `*-commerce`/`*-backoffice`, `webhook`, `starter-kit`, generated
  `app-management`).
- **Provisioning is service-side**: `app.commerce.config.ts` declares two
  event providers, 21 events, registrations, and a Commerce webhook; generated
  `app-management` actions (installation/association/app-config) execute the
  install, fed by `AIO_COMMERCE_AUTH_IMS_*` S2S env at deploy.
- `install.yaml` declares 3 required Console APIs (`commerceeventing`,
  `CloudIntegrationSDK`, `AdobeIOManagementAPISDK`); nothing in-repo consumes
  it (inferred: the aio/Console template install spec).
- **Node `^24.0.0`**, ESM, `postinstall` + `pre-app-build` hooks via
  `@adobe/aio-commerce-lib-app`. NOT a GitHub template repo; the blessed
  per-integration path is App Management's "initialize your app", not forking.

## Our spine, and where the kit hits it

From the codebase pass (all file:line in the agent report, key points):

1. **The standalone-app gate rejects it outright.** `addAppBuilderComponent`
   requires `app.config.yaml` to declare `application.runtimeManifest.packages`
   at the CLONE ROOT and explicitly refuses extension apps
   (`appBuilderComponentRunner.ts:459-467`, `appConfigPackages.ts:51-57`).
   The kit's root config declares `extensions:` — refused at step 4 of 7.
2. Even without the gate, our deploy REWRITES the packages map to
   `deriveOwPackage(id)` and re-stringifies the YAML (comments lost) — a
   transform designed for standalone apps, meaningless against an extension
   shell (`appConfigPackages.ts:80-123`).
3. **We inject exactly two env vars at deploy** (`AIO_RUNTIME_NAMESPACE/_AUTH`,
   fresh per invocation). The kit's install actions want six
   `AIO_COMMERCE_AUTH_IMS_*` values. Worse, integrations get NO `.env` at all
   by design, and there is no mechanism delivering an integration's
   `envSchema` values to deployed actions — a latent gap the shipped catalog
   never exercises (`appBuilderComponentRunner.ts:110-111, 369-386`).
4. **We have no create path for IO Events.** `IoEventsClient` is DELETE-only,
   built for teardown (`ioEventsClient.ts` — list/delete only). The kit's
   provisioning (providers, registrations, Commerce eventing) would be the
   first create path we ship — or we lean on App Management to do it, which
   we also don't drive. (Flag from the pass: the comment at
   `ioEventsClient.ts:41-42` claims the extension "creates" these — false as
   written; no create path exists.)
5. `install.yaml`'s three APIs map cleanly onto our union-PUT subscription
   spine (`requiredApis` → `subscribeRequiredApis`) — the ONE part that fits
   as-is; whether `commerceeventing`/`CloudIntegrationSDK` are free-service
   subscribable is org-data we could not verify offline.
6. The `legacy` tag DOES have the shape our spine expects (standalone layout,
   the scripts the item described) — but it is deprecated, needs OAuth1
   Commerce credentials (PaaS-flavored), our source schema has no `tag` field
   (`owner/repo/branch` only), and its onboarding scripts hit the same
   no-create-path wall in (4): actions would deploy, events would not flow.

## Synthesis — the four real options

| option | what it is | cost | what you get |
|---|---|---|---|
| A. Pin `legacy` | catalog entry on the old generation (+`tag` support in source schema) | small-medium | deprecated code, events dead without onboarding we cannot run — half an integration |
| B. Support extension apps + App Management | new deploy path (no packages rewrite), S2S env injection, drive the install step | large — a designed feature, not an entry | the kit as Adobe ships it TODAY, and the future shape of Commerce extensibility |
| C. `aio-commerce-lib-app` init flow | scaffold per-integration via Adobe's initializer instead of cloning the kit | medium; new scaffold mechanism beside git-clone | the blessed path; per-integration identity handled by the tool |
| D. Skills-only (status quo+) | keep the blank shell as scaffold; the kit's 7 skills (already shipped) teach agents to build the kit's per-event structure INSIDE the shell | zero new code | the item's original pain partially addressed; no kit runtime |

## The design-gate question (per the loop contract): what IS the kit in our model?

The catalog-entry entity assumes: a public GitHub repo, standalone app config,
deploy = `aio app deploy`, identity = our derived ow-package. The kit on main
violates the assumptions structurally — it is an **extension app with a
service-managed lifecycle** (deploy + install + Commerce-side config). Forcing
it into the current entity would encode a guess; option B effectively defines
a NEW entity (or a new `kind`/capability flags on the existing one:
`layout: extension`, `lifecycle: app-management`, S2S env contract).

**This is product intent → owner's decision.** Recommendation, held loosely:
**B, scoped as its own designed feature** — it is where Adobe has moved and
the only option that yields the real kit — with **D as the immediate stance**
(costs nothing; the skills already teach the structure). A is a dead end
dressed as a shortcut; C competes with our whole clone-based model and should
be weighed only if B's sizing comes back ugly.

Could not establish offline: free-service subscribability of the kit's three
APIs; whether `aio app deploy` under our runner executes the kit's
`pre-app-build` hook; App Management's install trigger surface (Console vs
Commerce Admin). All three belong to option B's plan, not to this decision.
