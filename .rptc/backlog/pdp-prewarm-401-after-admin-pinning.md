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

## Direction CHOSEN 2026-08-15: Fix A now, Fix B behind an Adobe answer

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

### The open question that sizes the work

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

Probe hygiene note: the probe key was deleted afterwards (204, verified by
re-listing). The DELETE path needs the URL-SAFE id — the listing's dict key,
where `/` is written `_` — not the `id` field; using the `id` field returns 400.
A first cleanup check reported success wrongly by comparing the wrong field.

Fix A stands on its own and is why this stopped being urgent.

### Decide deliberately before building

One shared action serves every storefront, so giving it a publishing credential
means one identity with admin rights on every customer's site. Reasonable for a
demo tool, but it should be a decision rather than a side effect — and the
credential must not land in the public repo (settings/env only).

## Also fix regardless of direction

`catalogPrewarmService.ts:220` claims failed paths fall back to smart-404. They
do not. Correct the message even if the auth fix lands first.
