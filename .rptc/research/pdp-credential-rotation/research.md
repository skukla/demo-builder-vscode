# How the shared PDP-publish action should get, and keep, a Helix credential

**Date:** 2026-08-15
**Mode:** Hybrid — two codebase passes (`demo-builder-vscode`, `accs-discovery-service`)
plus Adobe platform docs.
**Feeds:** `.rptc/backlog/pdp-prewarm-401-after-admin-pinning.md` (Fix B).
**Status:** design decided; three items to verify before building.

---

## The question

Storefront setup pins a site admin, which sets `requireAuth: "auto"` and closes the
whole Helix admin API to anonymous callers. The shared `prepublish-pdp` action
publishes PDP paths on behalf of every storefront and publishes anonymously, so it
401s. Its other caller is JavaScript in the visitor's browser, which can never hold a
credential — so the action itself must authenticate.

Fix A (shipped, `3d73419b`) routes the setup-time prewarm through the extension's own
authenticated Helix path. This research covers what remains: the RUNTIME path, and how
whatever credential it uses stays valid.

## The fact that decides it

**SCs routinely add products to a demo after setup.**

An earlier draft of this research recommended not building a credential system at all —
reasoning that Fix A covers the seeded catalog and post-setup churn is a rare tail. That
was wrong, and it was wrong in the way that matters: the runtime smart-404 fallback is a
MAIN path, exercised whenever an SC adds a product, which is routine. A design that
requires the SC to remember to re-run a refresh before clicking their new product is not
a fix; it reintroduces the cold-path failure prewarm exists to prevent, at the least
forgiving moment.

Everything below follows from taking that usage pattern seriously.

## What is already true (measured, not assumed)

| Fact | Where |
|---|---|
| Publish-role Admin API Key clears the lock on a PDP path: **200** | probe 2026-08-15; controls 401 (no auth) / 200 (user bearer) |
| **Org-scoped** keys work across every site in the org | probe: one key published to two sites |
| IMS S2S (client_credentials) token is **refused** (401) | probe; token has a technical-account `user_id`, no `email` claim, and the admin roster is email-keyed |
| Keys expire in **1 year** | probe response + `admin-apikeys` doc |
| The action reads `params.HELIX_ADMIN_API_KEY` but it is declared **nowhere** | `actions/prepublish-pdp/index.js:95-97`; absent from `app.config.yaml`, `.env`, `.env.example` |
| The action has **no persistence of any kind** | 0 hits for state/files libs across `actions/`; control `require('@adobe` → 4 hits |
| …but `@adobe/aio-sdk@5.0.1` already exports `State` and `Files` | `Object.keys(require('@adobe/aio-sdk'))`; both libs present in `node_modules` |
| A working IMS **caller-auth** chain already exists, with 10 pinned tests | `actions/lib/ims.js`; guards `discover-stores` only |
| `prepublish-pdp` is the only write endpoint, and is unauthenticated | guards are structural: charset pattern on org/site/branch, and only `/products/{urlKey}/{sku}` paths |
| Exactly one direct extension→action channel exists today | `GET <overlayUrl>/__version`, anonymous (`storefrontProbe.ts:116-135`) |

## Two designs ruled out, and why

### 1. A long-lived org key as an action input

Attractive because Adobe documents exactly this rotation mechanism
([Credential Rotation](https://developer.adobe.com/app-builder/docs/guides/app_builder_guides/deployment/credential-rotation)),
params are encrypted at rest, and `aio rt action get` shows values as hashes.

It fails on cardinality. **The Helix org IS the GitHub owner** — `skukla/demo-builder-test`
is org `skukla` — and SCs use their own GitHub namespaces. So orgs are effectively
per-SC, a `{org: key}` param map needs an entry per SC, and every new SC becomes a manual
param update.

### 2. Anything where a human supplies the secret

This was already built here and deliberately removed:

- `ebd795e` added a shared secret, moving it to a **query parameter** because Helix does
  not reliably forward custom headers to overlay actions but does preserve the overlay
  URL's query string. (Keep that transport fact — it is the only confirmed channel into
  the action from Helix.)
- `ac36fc7` deleted the scheme: *"The shared-secret design coupled enabling BYOM to
  out-of-band coordination (admin generates a secret, every SC pastes it)."*

Both dead ends point the same direction: the credential must be provisioned
**automatically, per org, by software that already holds admin** — which is the
extension.

## The design

1. **Extension mints a SITE-scoped key** with `roles: ['publish']` — see "Scope
   corrected" below; this originally said org-scoped. `createAdminApiKey` already does
   exactly this: right endpoint, keyed `org/site`, SecretStorage-persisted,
   delete-old-before-mint, with teardown revocation wired at
   `projectDeletionService.ts:408`. Two bugs were fixed in it rather than replacing it
   (`roles: ['admin']` → `['publish']`, and raw→URL-safe key ids in both DELETE paths).
2. **Extension registers the key** with a new `register-publish-key` action, presenting
   the DA.live IMS bearer it already holds.
3. **The action authenticates the caller** with the existing `validateCallerToken` +
   `validateCallerEmailDomain` chain, fail-closed when the allowlist is absent — the same
   shape `discover-stores` already uses.
4. **The action stores the key per org, encrypted**, and `prepublish-pdp` reads its org's
   key at request time.
5. **Rotation falls out for free.** The extension already re-mints every ≤7 days against a
   ~1-year key; it re-registers on the same cycle. No human, no paste, no redeploy —
   precisely what `ac36fc7` demanded.

### Storage constraints

- **Not `aio-lib-state`.** Adobe: *"we strongly discourage using the State SDK to store
  secrets for reuse within Adobe I/O Runtime actions."* Independently disqualifying: TTL
  is capped at **365 days**, with infinite TTL explicitly rejected — nothing there is
  permanent.
- **`aio-lib-files`**, which persists indefinitely. Encrypt before writing (Adobe requires
  this for app submission) and store a **per-write IV alongside each ciphertext**.
  Adobe's own reference sample threads a single shared IV; GCM key+IV reuse is a real
  break, not a nitpick.
- **Master key as an action default param** — encrypted at rest by Runtime, rotatable via
  `aio runtime action update --param` without redeploying code.
- **`final` protects us here.** Default params are normally overridable at invoke time;
  `final: true` blocks that, and Adobe documents that `final` has no effect when
  `require-adobe-auth: true`. All three of our actions set `require-adobe-auth: false`,
  so the protection holds. Still treat every caller-supplied param as hostile and never
  let one substitute for a stored value.
- **`aio-lib-files` is US-only** (East/West US). State has an EU region; Files does not.
  Weigh only if demos must run in-region for EU.

## Scope corrected: SITE-scoped, not org-scoped

Org scope was chosen on a false premise — that it spared the action a per-site lookup.
It does not. Every request already carries both `org` and `site` (`pdp404Snippet.ts`
builds `?org=&site=&path=`; `appendOverlayParams` requires both), so keying on
`org/site` costs exactly what keying on `org` costs. With that gone:

| | org-scoped | site-scoped |
|---|---|---|
| Blast radius if leaked | every AEM site under that GitHub owner | one storefront |
| Revoke on project delete | impossible without breaking siblings | correct, already wired |
| Lookup cost | same | same |
| Keys to mint | fewer | more, but automatic |

**This also makes the GitHub-namespace question moot** — it was only load-bearing for
keying an org-wide param map, which site scope does not use.

**Measured end to end 2026-08-15** on locked `skukla/demo-builder-test`, issuing the same
shapes the patched code sends: mint `roles:['publish']` → 200 (id contained `/`); publish
a PDP with that key alone → **200**; no-auth control → 401; revoke with URL-safe id → 204;
revoke with raw id → **400** (the old bug, reproduced in the same run); cleanup left 0
probe keys. The extension half of Fix B is therefore proven; the action half is not.

## The rotation trigger is not just time — it is any site config write

Measured 2026-08-15. `apiKeys` lives INSIDE the site config document, beside
`access`. `updateSiteConfig` is delete-then-re-register and runs on every project edit,
so it destroys the key: keys before delete 1 → `DELETE` 204 → re-register 201 → keys
after **0**. `access/admin` went to 404 in the same run, which is the already-known
mechanism.

**Restore is impossible, so this is not the grants bug again.** `captureSiteGrants` works
because an email roster is readable. A key value is not — per `admin-apikeys` it "is never
stored in our system and can not be retrieved at a later time", and the listing returns
metadata only. The only workable shape is **re-mint and re-register after any site config
write**, which the extension can do with the DA.live bearer it already holds.

**And it exposes a latent bug in today's code.** `createAdminApiKey` persists for
`min(7 days, server expiry)`, but a config write destroys the key server-side. The
extension would serve a cached value for a key that no longer exists and publish with it →
401. A config write must invalidate `HelixService.apiKeyCache` and the persisted entry, not
merely schedule a re-mint.

So the rotation design has two triggers, not one:
1. time — the existing ≤7-day re-mint, well inside the ~1-year server expiry
2. **event — any site config write** (create, reset, edit, repair)

## The action half: authentication is proven

`validateCallerToken` accepts the `darkalley` DA.live token, probed against the DEPLOYED
`discover-stores`: no auth → 401 `Missing Authorization header`; DA.live bearer → **400
`Missing required parameter: accsEndpoint`**; garbage bearer → 401 `Token is invalid or
expired`. The 400 is the parameter gate, which sits after token validation, the
allowlist-present check and the email-domain check — so the token cleared them all. The
register endpoint can reuse that chain verbatim.

Unreachable by probe until built: the endpoint, the encrypted per-site store, and
`prepublish-pdp` reading the key.

## Verify before building

1. ~~That SCs use distinct GitHub namespaces.~~ **Moot** under site scope — it only
   mattered for keying an org-wide param map.
2. ~~That `validateCallerToken` accepts a `darkalley` DA.live token.~~ **PROVEN** — see
   "The action half" above. (`discover-stores` still has no test for its guard chain; only
   the lib beneath it is covered.)
3. **That `aio runtime action update --param` without a source file preserves deployed
   code.** Undocumented. And Adobe warns twice that **all** params must be passed in one
   call — omitted ones silently disappear.

## Could not establish

- **Whether State or Files are encrypted at rest by Adobe.** No primary page says either
  way. This is the most important open question and warrants a support ticket rather than
  an assumption — it decides whether application-level encryption is defence-in-depth or
  the only defence.
- **Which "Secret Vault" Adobe means** when it redirects secret storage there. Unqualified,
  no product named. Adobe also states App Builder offers no third-party API management.
- **How default params are encrypted** — algorithm, key management, who can decrypt.
- **Any documented master-key rotation or dual-key read window.** Rotating the master key
  implies re-encrypting every tenant blob; Adobe documents no procedure.

## Loose ends found along the way (unrelated to rotation)

- `syncStorefront.ts:504` reads secret `demoBuilder.daLive.imsToken`, which **nothing in
  the codebase writes** — its comment claims otherwise. The Helix publish leg therefore
  always silently skips, and the test passes because it mocks the key into existence.
- `createAdminApiKey` is dead code with no production caller and mints `roles: ['admin']`
  despite a docstring claiming publish scope.
- `dist/application/actions/accs-discovery/probe-helix-admin.zip` has **no source in git**
  and may still be deployed to Stage with unknown params.
- The App Builder project has a **Stage workspace only, no Production**.
- Unset `.env` keys deploy silently as empty strings (`utils.js:718`), so a typo ships an
  empty credential and surfaces on first request rather than at deploy.

## Sources

Probes run 2026-08-15 against `skukla/demo-builder-test` and `skukla/bodea-template-test`,
each with negative (no auth) and positive (user bearer) controls; all probe artifacts
deleted and verified by re-listing.

- [Admin API Keys](https://www.aem.live/docs/admin-apikeys)
- [Security Overview — App Builder](https://developer.adobe.com/app-builder/docs/guides/app_builder_guides/security/)
- [Credential Rotation](https://developer.adobe.com/app-builder/docs/guides/app_builder_guides/deployment/credential-rotation)
- [Creating Actions — default params and `final`](https://developer.adobe.com/runtime/docs/guides/using/creating_actions/)
- [Storage Options — quotas and limits](https://developer.adobe.com/app-builder/docs/guides/app_builder_guides/storage/)
- [Credentials management — multi-tenant AES-256 pattern](https://developer.adobe.com/commerce/extensibility/app-development/best-practices/credentials/)
- [App submission guidelines — encryption requirement](https://developer.adobe.com/commerce/extensibility/app-development/app-submission-guidelines)
- `adobe-rnd/aem-commerce-prerender` — `app.config.yaml`, README (canonical comparison)
