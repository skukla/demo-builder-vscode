# Catalog prewarm 401s on every new storefront, because we pin an admin first

**Filed:** 2026-08-15, reported by the `feature/bodea-template` session and
routed here for develop. Not Bodea-specific.
**Severity:** BROKEN FEATURE, not a slow-PDP annoyance. Prewarm failure is
certain and total, AND the runtime smart-404 fallback fails identically — see
"Resolved 2026-08-15" below, which closes what this item originally filed as an
open hypothesis.

**Shipped state:** admin pinning is NEW in `v1.0.0-beta.129` (verified:
`configAccessRecovery.ts` does not exist at tag `v1.0.0-beta.128`). That release
is cut, tagged and published, so every storefront created from beta.129 onward
gets broken product pages. Storefronts created on earlier builds have no pinned
admin and are unaffected.

## Symptom

Fresh storefront creation, ACCS backend, seeded catalog:

```
[Catalog Prewarm] Enumerated 39 SKUs; pre-warming PDP URLs in batches of 5
[Catalog Prewarm] Complete: 0/39 succeeded, 39 failed
```

100% — systemic, not per-SKU.

## The chain, verified

**1. The prewarm POST carries no credentials.** `prewarmOne`
(`src/features/eds/services/catalogPrewarmService.ts:341-358`) builds a URL with
`org` / `site` / `path` query parameters and calls `fetch` with a method and a
timeout signal — **no `headers` key at all**. Read directly, 2026-08-15.

**2. The action gets a 401 from Helix.** The reporting session called it with the
same shape `prewarmOne` builds:

```
POST .../api/v1/web/accs-discovery/prepublish-pdp?org=…&site=…&path=%2Fproducts%2F…
→ 502  {"error":"Preview failed (401)","success":false}
```

**3. We close that door ourselves, two minutes earlier in the same run.**

```
[ConfigAccess] Granted admin on <org>/<site> to 1 user(s)
[ConfigAccess] Pinned <masked> as an admin on <org>/<site>
```

The rule is already written down in `.claude/skills/eds-publish-and-config`: a
site with ANY `access.admin` role closes the WHOLE admin API, and from then on
preview, publish, bulk and cache-purge all require the DA.live IMS bearer. The
skill even notes that storefront setup now pins an admin at registration, so this
is the normal state rather than an edge case.

So: **admin pinned at registration → `requireAuth: auto` → the anonymous
`prepublish-pdp` action can no longer preview.** The rule was known. What it
missed is that an *external* action publishes on the storefront's behalf too, and
that action was never given a way to authenticate.

## Resolved 2026-08-15: the fallback fails too, and no live test was needed

This item originally asked someone to test whether the runtime fallback also
401s. It does, and the evidence was already inside this file.

The snippet vendored into the storefront's `scripts/delayed.js` builds its
request like this (`pdp404Snippet.ts:170-176`):

```js
const triggerUrl = `__TRIGGER_URL__?org=__ORG__&site=__SITE__&path=${encodeURIComponent(lc)}`;
await fetch(triggerUrl, { method: 'POST' });
```

Same endpoint, same query parameters, same method, and the same absence of auth
headers as `prewarmOne`. **The live call the reporting session already made IS
the smart-404 request** — there is no difference between them to test. So a PDP
that was never pre-published cannot self-heal, and BYOM PDP routing is broken
end to end on any site with a pinned admin.

Visitor-visible behaviour: the snippet paints a "Loading product…" spinner, and
because the 502 wrapping the 401 counts as 5xx it burns its one retry plus a 1s
backoff before giving up.

The prewarm summary (`catalogPrewarmService.ts:220`) still tells the user
`(failed paths fall back to smart-404 at runtime)`. That reassurance is now
false and should be corrected whichever fix is chosen — a wrong all-clear is
worse than the failure it papers over.

## Scope

Every package carrying `byomOverlayUrl` — `custom`, `citisignal`, Bodea — on any
storefront created since admin pinning landed.

## Pointers

- `catalogPrewarmService.ts:341-358` (`prewarmOne`, unauthenticated POST), `:203`
  (batch runner), `:62` (`BATCH_SIZE`)
- `derivePrepublishUrl` in `pdp404HandlerPublisher.ts`
- The action itself lives in the separate `accs-discovery-service` repo

## Direction CHOSEN 2026-08-15: Fix A shipped, Fix B designed

**Read the last two sections first — the ones dated latest.** What follows is a
working log, so the early sections record dead ends (S2S refused, "Fix B does
not work") that LATER sections overturn. Current state:

- **Fix A — SHIPPED** (`3d73419b`). Prewarm publishes through the extension's
  authenticated Helix path. Covers every SKU in the catalog at setup.
- **Fix B — designed, not built.** An Admin API Key DOES clear the lock; the
  design is "the extension registers its org's key with the action". See
  "DESIGN DECIDED" below and
  `.rptc/research/pdp-credential-rotation/research.md`.

User decision: **the admin grant stays** — it is what the site-access repair
story rests on — so direction 3 (stop pinning) is off the table.

**Direction 2 is structurally dead and should not be revisited.** Threading a
token from the extension per call can only ever fix prewarm. The other caller is
JavaScript running in the visitor's browser on a public storefront; shipping a
DA.live IMS bearer there would publish a credential to every visitor. A fix that
leaves the runtime path broken is not a fix.

That leaves direction 1: the action holds its own credentials.

### Split the fix: most of it needs no Adobe dependency at all

Found 2026-08-15 while scoping the token work. **The extension can already
publish on a locked site** — `helixService.previewPage`/`publishPage` send
`Authorization: Bearer <daLiveToken>`, with a comment naming this exact
scenario ("once the site has any `access.admin` role..."). Only the prewarm path
bypasses it: `catalogPrewarmService` does not import `HelixService` at all, it
just POSTs anonymously to the external action.

And the action is not doing anything the extension can't. `prepublish-pdp`
does exactly three things: a SKU-existence check, `callAdmin('preview')`, then
`callAdmin('live')` (`index.js:57,65,71`). `helixService.previewAndPublishPage
(org, site, path, branch)` is the same preview-then-live pair, authenticated.
The SKU gate is redundant at prewarm time — prewarm enumerates its SKU list from
the catalog, so every path it submits exists by construction.

So the work splits cleanly:

**Fix A — prewarm, entirely in this repo, no Adobe dependency, unblocks the
shipped bug for the normal case.** Route prewarm through
`previewAndPublishPage` instead of the anonymous action. Every SKU in the
catalog at setup gets pre-published, so PDPs work on new storefronts again.

**Fix B — runtime self-heal, needs the action to authenticate.** Only covers
SKUs added to the catalog AFTER setup. Blocked on the credential question below.

Fix A does not merely buy time — it shrinks B from "PDP routing is broken" to
"catalog churn after setup isn't self-healing", which is the failure mode the
feature had before prewarm existed. Do A first.

### What the action needs, and what it already has

`accs-discovery-service` is local at `adobe-demo-system/accs-discovery-service`
(clean on `main`). Two relevant facts found by reading it:

- `prepublish-pdp/index.js:93-100` **already has an auth hook**, and its comment
  is now false:

  ```js
  // Sends an org-scoped Helix API key when configured;
  // otherwise no auth (demo-builder storefronts have open admin today).
  if (params.HELIX_ADMIN_API_KEY) headers.authorization = `token ${params.HELIX_ADMIN_API_KEY}`;
  ```

  Storefronts no longer have open admin. Worse, **this hook sends the wrong
  credential type**: per `eds-publish-and-config` rule 5 (measured 2026-08-14 —
  identical publish POST returned 202 before the grant, 401 after, 202 again with
  the bearer), a site with any `access.admin` role requires the DA.live IMS
  **bearer**; rule 4 records an API key being refused for this class of guard.
  So `HELIX_ADMIN_API_KEY` is not the switch to flip.

- `actions/lib/ims.js` already exports `getCommerceToken(clientId, clientSecret)`
  — a working IMS server-to-server client-credentials exchange against
  `POST /ims/token/v3`. So the action can already mint IMS tokens unattended;
  the machinery is not the problem.

**The problem is WHICH client the token comes from.** The bearer that works
today is a USER token issued to DA.live's own IMS client: the extension
validates `payload.client_id !== 'darkalley'` (`edsHelpers.ts:195`) and sources
it from an interactive login (`daLiveAuthService`, or the `da-auth-helper`
cache at `~/.aem/da-token.json`). An S2S token minted from our own App Builder
project carries a different `client_id` and a different scope set
(`COMMERCE_SCOPES` today is Commerce-oriented).

Whether `admin.hlx.page` accepts a third-party S2S token at all is an
ADOBE-SIDE question that cannot be settled by reading either repo. Note this
ecosystem is demonstrably picky about client identity — the 2026-06-12
`discover-stores` fix existed precisely because introspection has to target the
token's OWN `client_id`.

Two ways to resolve it, cheapest first:
1. Mint an S2S token from the App Builder project and try one authenticated
   `POST /preview` against a locked site. 2xx settles it.
2. Ask Adobe / check developer.adobe.com (the `adobe-docs-lookup` skill routes
   this; no doc MCP indexes those pages).

If S2S is refused, Fix B needs a different shape entirely — do NOT reach for a
stored long-lived user token, which expires and belongs to a person.

### The open question that sizes the work — ANSWERED below, see the probe

Does *any* valid DA.live bearer clear the lock, or must the identity be on that
site's `access.admin` roster? The 2026-08-14 measurement used the extension's
bearer, which belonged to the pinned admin, so it does not separate the cases.

- **Any valid bearer** → the action just needs its own credentials. Done in the
  other repo.
- **Roster-gated** → storefront setup must ALSO grant admin to the service
  identity alongside the human. That half is cheap and lives in this repo:
  `ensureSiteAdmin` is already read-merge-write, so adding a second admin does
  not disturb existing grants.

**Falsifier, one call:** publish a path on an admin-locked site using a bearer
belonging to someone *not* on that site's admin list. 2xx = any bearer works;
401 = the roster is the gate.

### PROBE RUN 2026-08-15 — Fix B as designed DOES NOT WORK

Ran against `skukla/demo-builder-test` (confirmed locked: `access/admin.json`
returns 200 with 1 admin listed), POSTing `/preview` on a deliberately
nonexistent non-product path so nothing real could publish. All three legs:

| Credential | Result |
|---|---|
| none | **401** — negative control: the site really is locked |
| S2S bearer minted from the action's own `IMS_CLIENT_ID/SECRET` | **401** |
| `darkalley` user bearer (what the extension holds) | **404** — positive control: request shape is right, auth cleared the gate |

The S2S token minted fine (`/ims/token/v3`, `grant_type=client_credentials`)
and carries `client_id: d03b8f48…` rather than `darkalley`. **Helix refuses
it.** So "give the action its own credentials" does not work as written — the
whole premise of Fix B.

**And rostering it is not an obvious workaround:** the S2S token carries a
technical-account `user_id` but **no `email` claim**, while the site admin
roster is email-keyed (`{"role":{"admin":["user@adobe.com"]}}`). There is
nothing to add to the list.

What the probe does NOT separate: whether the refusal is about client identity,
roster membership, or scopes (the mint used the Commerce-oriented
`COMMERCE_SCOPES` the action already has, since that is what it can actually
issue today). Any of the three could be the gate — but the missing email claim
makes the roster path look unpromising regardless.

### SOLVED 2026-08-15 — an Admin API Key clears the lock. Fix B is UNBLOCKED.

S2S was the wrong instrument, not a dead end. Per
[Admin API Keys](https://www.aem.live/docs/admin-apikeys), keys are created
against the **org, profile OR site** config and are recognised as admin
credentials — the doc notes the site config carries an
`access.admin.apiKeyId` property and that "both API Key Id sources are
respected". The auth form is `Authorization: token <key>` or `X-Auth-Token` —
**exactly what `prepublish-pdp` already sends** via its `HELIX_ADMIN_API_KEY`
branch.

Measured on locked `skukla/demo-builder-test`, key minted with
`{"roles":["publish"]}`:

| Request | Result |
|---|---|
| API key, **PDP-shaped path** (`/products/…`) | **200** ✅ |
| no auth, same path | 401 (negative control) |
| user bearer, same path | 200 (positive control) |
| API key, ordinary non-product path | 401 `error from content-bus` |

That last row is the important subtlety: an ordinary path resolves against
DA.live, which needs its OWN content-source credential
(`x-content-source-authorization`, see `helixService.previewPage`). A PDP path
resolves through the **public BYOM overlay**, so no content-source auth is
needed — which is why the key alone suffices for exactly our use case and would
NOT suffice for general publishing.

**So the fix is: mint a publish-role Admin API Key and give it to the action.**
The extension can mint one — it holds the admin role, and
`helixService.createAdminApiKey(org, site)` already implements this call.

**The one open design question is SCOPE.** The action is shared across
storefronts, so a per-site key means the action needs a site→key lookup. The doc
says keys may be created at ORG level (`POST /config/{org}/apiKeys.json`), which
would let one key cover every site in an org — a much better fit. NOT tested:
creating an org-wide publish credential is a bigger footprint than a throwaway
site key and should be a deliberate decision. Test it before designing storage.

Whatever the scope, the key is a publish-capable secret: it belongs in
settings/env, never in the public repo, and never in the browser snippet.

### ORG SCOPE CONFIRMED + the canonical project does the same thing

**Org-scoped keys work** (measured 2026-08-15). One key created at
`POST /config/{org}/apiKeys.json` with `{"roles":["publish"]}` published a PDP
path to BOTH `skukla/demo-builder-test` and `skukla/bodea-template-test` (200
each; no-auth control 401 on both). So the shared action needs ONE key PER ORG,
not a site→key lookup. Deleted after the probe, verified by re-listing.

**Adobe's canonical implementation takes the same approach.**
`adobe-rnd/aem-commerce-prerender` declares `AEM_ADMIN_API_AUTH_TOKEN` as an
action input in its `app.config.yaml`, and its README describes it as a
"Long-lived authentication token for AEM Admin API (valid for 1 year)",
obtained by a setup wizard that exchanges a temporary 24-hour admin.hlx.page
token. So "the publishing service holds a long-lived admin credential" is the
canonical pattern, not a workaround — our API-key expiry was also 1 year,
matching.

**But their rotation story does not transfer.** Prerender is ONE DEPLOYMENT PER
STOREFRONT (the exact property ADR-005 rejected for multi-tenancy), so its
credential is per-deployment and rotating means re-running the setup wizard for
that one storefront. Our action is shared across every storefront, so a manual
wizard re-run is not available and an expiry takes down PDP publishing for
everyone at once — silently, surfacing as "PDPs 404", which is precisely the
failure this item started as.

### DESIGN DECIDED 2026-08-15: the extension registers its SITE's key

> **Revised later the same day: SITE-scoped, not org-scoped.** The section below
> was written for org scope; the correction and its reasoning are in
> "SCOPE CORRECTED" at the end of this item. Everything else — the registration
> flow, the storage constraints, `ac36fc7`'s constraint — holds unchanged.

Full research: `.rptc/research/pdp-credential-rotation/research.md`.

**The fact that drives it, and that an earlier draft of this item got wrong:
SCs routinely add products to a demo AFTER setup.** The runtime smart-404
fallback is therefore a MAIN path, not a rare tail — closing the gap with
"re-run prewarm from the extension" is not good enough, because the SC adds a
product minutes before (or during) a demo and clicks it.

**Two tempting designs are both ruled out:**

1. *Long-lived org key as an action input.* The Helix org IS the GitHub owner
   (`skukla/demo-builder-test` → org `skukla`), and SCs use their own GitHub
   namespaces, so orgs are per-SC. A `{org: key}` param map needs an entry per
   SC and a param update per new SC.
2. *Any scheme where a human supplies the secret.* Already built and deleted
   here: `ebd795e` added a shared secret (via query param, because Helix does
   not reliably forward custom headers to overlay actions but DOES preserve the
   overlay URL's query string), and `ac36fc7` removed it because it "coupled
   enabling BYOM to out-of-band coordination (admin generates a secret, every
   SC pastes it)." Do not reintroduce that coupling.

Both failures point the same way: the credential must be provisioned
automatically, per org, by software that already holds admin — the extension.

**The design:**

1. Extension mints an **org-scoped** key with `roles: ['publish']`.
   `createAdminApiKey` already implements site-scoped minting with
   SecretStorage persistence and delete-old-before-mint; it needs org scope and
   the narrower role. NOTE it currently requests `['admin']` and has **no
   production caller at all** — the minting path is dead code today, live only
   in tests. `deleteAdminApiKey` IS live, on project teardown.
2. Extension POSTs the key to a new `register-publish-key` action, presenting
   the DA.live IMS bearer it already holds.
3. That action authenticates the caller with the EXISTING `validateCallerToken`
   + `validateCallerEmailDomain` chain (`actions/lib/ims.js`, 10 pinned tests,
   already guarding `discover-stores`). Fail-closed when the allowlist is
   absent, as `discover-stores` does.
4. It encrypts and stores the key per org in `aio-lib-files`, then
   `prepublish-pdp` reads its org's key at request time instead of finding
   `HELIX_ADMIN_API_KEY` undefined.
5. **Rotation falls out for free.** The extension already re-mints every
   ≤7 days against a ~1-year key; it re-registers on the same cycle. No human,
   no paste, no redeploy — which is exactly what `ac36fc7` demanded.

**Storage constraints (measured against Adobe docs, see the research file):**
- NOT `aio-lib-state`: Adobe "strongly discourage[s]" it for secrets, and its
  TTL is capped at 365 days with infinite TTL explicitly rejected.
- `aio-lib-files` persists indefinitely, but encrypt before writing (Adobe
  requires this for app submission) and store a **per-write IV alongside each
  ciphertext** — Adobe's own sample threads one shared IV, which is a real
  GCM break, not a nitpick.
- Master key as an action default param: encrypted at rest by Runtime, shown
  as a hash by `aio rt action get`, and rotatable via
  `aio runtime action update --param` without a code redeploy. Our actions set
  `require-adobe-auth: false` + `final: true`, so `final` genuinely blocks
  invoke-time override (it does NOT when `require-adobe-auth: true`).
- `aio-lib-files` is **US-only**; State has an EU region, Files does not. Weigh
  if demos ever run in-region for EU.

**Verify before building:**
- That SCs really do use distinct GitHub namespaces (inferred from the DA.live
  org model — it is what makes the param map unworkable).
- That `validateCallerToken` accepts a `darkalley` DA.live token. It
  introspects against the token's OWN client_id so it should, but has only been
  exercised with CLI tokens.
- That `aio runtime action update --param` without a source file preserves
  deployed code. Undocumented; and Adobe warns twice that ALL params must be
  passed in one call or the omitted ones disappear.

Probe hygiene note: the probe key was deleted afterwards (204, verified by
re-listing). The DELETE path needs the URL-SAFE id — the listing's dict key,
where `/` is written `_` — not the `id` field; using the `id` field returns 400.
A first cleanup check reported success wrongly by comparing the wrong field.

Fix A stands on its own and is why this stopped being urgent.

### SCOPE CORRECTED 2026-08-15: SITE-scoped keys, and don't delete the minter

Org scope was chosen for a reason that turned out to be false — that it saved
the action a per-site lookup. It does not: **every request already carries both
`org` and `site`** (`pdp404Snippet.ts` builds `?org=&site=&path=`, and
`appendOverlayParams` requires both), so `org/site` is exactly as cheap to key
on as `org`. With that gone, site scope wins on every remaining axis:

| | org-scoped | site-scoped |
|---|---|---|
| Blast radius if leaked | every AEM site in that GitHub owner, demo or not | one storefront |
| Revoke on project delete | impossible — would break sibling projects | correct, and already wired |
| Lookup cost in the action | same | same |
| Keys to mint | fewer | more, but minting is automatic |

Consequence worth noting: **the "do SCs use distinct GitHub namespaces?" question
is now MOOT.** It only mattered for keying an org-wide param map.

**And `createAdminApiKey` should NOT be deleted** — an earlier draft of this item
said it should. Under site scope it is already the right shape: the right
endpoint (`/config/{org}/sites/{site}/apiKeys.json`), keyed `org/site`,
SecretStorage-persisted, delete-old-before-mint, with teardown revocation
already wired at `projectDeletionService.ts:408`. Two real bugs were fixed
instead (see below). Deleting it would also have stranded the pre-`beta.106`
`admin` keys permanently, because the id fix is what makes revoking them work
at all.

**Two bugs fixed in that code, both measured live:**

1. It requested `roles: ['admin']` while its own docstring claimed publish. Now
   `['publish']` — least privilege, and confirmed sufficient.
2. Both DELETE paths interpolated the RAW key id. Helix returns a base64 id, so
   roughly half contain `/`, which splits the URL path. Now converted to
   base64url (`toUrlSafeKeyId`). Only `/`→`_` was measured; `+`→`-` is included
   from the same mapping.

Neither was visible to the suite: every fixture used a clean id like
`old-key-id`, so the encoding was never exercised. The new tests use a real
Helix id.

**End-to-end probe, 2026-08-15**, against locked `skukla/demo-builder-test`,
issuing the same request shapes the patched code now sends:

| Step | Result |
|---|---|
| mint `roles: ['publish']` | 200 (id contained `/`) |
| publish a PDP with that key ALONE | **200** — publish scope suffices |
| no-auth control | 401 — site genuinely locked |
| revoke with URL-safe id | 204 |
| revoke with raw id | **400** — the old bug, reproduced in the same run |
| cleanup | 0 probe keys remaining |

So the EXTENSION half of Fix B is proven end to end.

### ACTION-HALF AUTH PROVEN 2026-08-15

`validateCallerToken` accepts the `darkalley` DA.live token the extension
already holds. Probed against the DEPLOYED `discover-stores` on Stage:

| Request | Result |
|---|---|
| no auth | 401 `Missing Authorization header` (control) |
| **DA.live bearer** | **400 `Missing required parameter: accsEndpoint`** |
| garbage bearer | 401 `Token is invalid or expired` (control) |

A 400 is the parameter check, which sits AFTER token validation, the
allowlist-present gate and the email-domain check — so the token cleared every
auth gate. `register-publish-key` can reuse that chain verbatim, and the
extension needs no new credential.

Still unproven, and unreachable by probe: the endpoint itself, the encrypted
per-site store, and `prepublish-pdp` reading the key. Those need code and a
Stage deploy. Once deployed the same approach finishes the chain in two calls —
POST a key to the register endpoint with the DA.live bearer, then hit
`prepublish-pdp` anonymously as the browser does and expect 200 on a locked site.

### A SITE CONFIG WRITE DESTROYS THE KEY — measured 2026-08-15

**This is a required part of the design, not an optimization.**

`apiKeys` is a top-level key INSIDE the site config document, beside `access`.
`updateSiteConfig` is delete-then-re-register and runs on EVERY project edit, so
it takes the key with it — the same mechanism that ate the admin roster.

Measured on `skukla/demo-builder-test` (full backup taken first; config and
roster restored and verified by re-read afterwards):

| Step | Result |
|---|---|
| mint publish key | id `uKC2O/Sn+AM/…` — contained BOTH `/` and `+` |
| keys before delete | 1 |
| `DELETE` site config | 204 |
| re-register | 201 |
| **keys after** | **0 — WIPED** |
| `access/admin` after | 404 — wiped, as already known |

Two consequences, one of them not obvious:

1. **You cannot capture-and-restore a key the way `captureSiteGrants` restores
   the roster.** An email list is readable; a key value is not — per
   `aem.live/docs/admin-apikeys` it "is never stored in our system and can not
   be retrieved at a later time", and the listing returns metadata only. There
   is nothing to restore. The only workable shape is **re-mint and re-register
   after any site config write.**
2. **There is a latent cache bug in TODAY's code.** `createAdminApiKey` persists
   the key in SecretStorage for `min(7 days, server expiry)`, but a config write
   destroys it server-side. The extension would serve a cached value for a key
   that no longer exists and publish with it → 401. Any config write must
   invalidate the local entry too (`HelixService.apiKeyCache` + the persisted
   store), not just re-mint.

Incidental but useful: that key id carried `+` as well as `/`, which MEASURES
the `+`→`-` half of `toUrlSafeKeyId` that was previously only inferred.

### Manage Site Access QuickPick — needs updating

`manageSiteAccess.ts` answers "who can administer this storefront" with the
email roster only. Once publish keys exist on sites, a credential that can write
to the site is invisible there and revocable through no UI. Worth listing keys
alongside admins — `deleteAdminApiKey` already exists to do the removing.

The sharper reason: given the wipe above, a key shown in that picker can vanish
on the next project edit while the extension still believes it holds one. Any
key surface must read through to the server rather than trusting local state.

### Decide deliberately before building — SUPERSEDED, kept for the reasoning

This section worried that one shared action holding a publishing credential
means one identity with admin on every customer's site. The DESIGN DECIDED
section answers it: keys are minted PER ORG by that org's own SC and scoped to
`roles: ['publish']`, so no single identity spans customers and no key exceeds
publish. The standing rule stands — the credential lives in settings/env or the
encrypted per-org store, never in this public repo.

## Also fix regardless of direction

`catalogPrewarmService.ts:220` claims failed paths fall back to smart-404. They
do not. Correct the message even if the auth fix lands first.
