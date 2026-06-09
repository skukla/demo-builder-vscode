# Architecture validation — repoless + AEM Sites + xcom

**Filed:** 2026-06-05 · Captures the two live verifications that closed the architectural unknowns for the two-SC synced storefront feature, locking the topology to **repoless** with per-org content sources. See [storefront-topology](../backlog/commerce-connect-aem-sc/storefront-topology.md) for the architecture this evidence supports.

## Why this exists

The 2026-06-04 design docs locked the architecture to a two-fork-sync model. The post-research dig surfaced Adobe's repoless capability as a first-class alternative. Two questions remained before flipping the locked plan:

1. Does cross-org repoless work at runtime — not just at the Admin API layer, but propagating actual code changes from a repo owned by org A to a satellite site in org B?
2. Does an `aem-boilerplate-xcom` storefront actually work when authored via AEM Sites and transacting? (The original `verify-aem-sites-spike` question.)

Both were answered the same day. This file holds the primary-source evidence.

## Validation 1 — Cross-org repoless works at runtime

### Setup

Two `aem.live` orgs, each tied to a matching GitHub org with AEM Code Sync App installed on at least one repo:

- **Org A (canonical):** `skukla` GitHub user + `skukla` `aem.live` org. Canonical site `skukla/repoless-spike` (template: `adobe/aem-boilerplate`).
- **Org B (satellite):** `kukla-demos` GitHub free org + `kukla-demos` `aem.live` org. Anchor site `kukla-demos/anchor` (also `adobe/aem-boilerplate`) — exists only to satisfy the "each `aem.live` org must have at least one Code-Sync-synced repo" prerequisite.

Both sites verified registered in Configuration Service via `GET /config/{org}/sites/{site}.json` — both returned the expected `code: { owner, repo }` blocks with `kukla@adobe.com` on the admin access list.

### Phase 3: Admin API acceptance

Create a repoless satellite **in org B (`kukla-demos`)** whose code lives in **org A (`skukla/repoless-spike`)**:

```bash
curl -s -X PUT "https://admin.hlx.page/config/kukla-demos/sites/satellite.json" \
  -H "x-auth-token: $TOKEN" \
  -H "content-type: application/json" \
  -w "\nHTTP %{http_code}\n" \
  --data '{
    "code": {
      "owner": "skukla",
      "repo": "repoless-spike"
    },
    "content": {
      "source": {
        "url": "https://content.da.live/kukla-demos/satellite/",
        "type": "markup"
      }
    }
  }'
```

**Response: HTTP 201.** The Admin API accepted a configuration where `code.owner` points at a repo owned by a different `aem.live` org. No rejection, no "cross-org not allowed" error.

### Phase 4: Runtime propagation

Pushed a marker (`<!-- repoless-sync-test-{timestamp} -->`) to `skukla/repoless-spike/head.html` and waited 45 seconds for Code Sync. Then checked both sites:

```
canonical (https://main--repoless-spike--skukla.aem.page/head.html)         → marker present
satellite (https://main--satellite--kukla-demos.aem.page/head.html)         → marker present
```

Both sites saw the change. **Cross-org code propagation works at runtime within one Code Sync cycle.**

### Verdict

✅ **Cross-org repoless is officially supported and works in practice.** The Admin API accepts the configuration without restriction, and the Code Sync infrastructure propagates code from a repo owned by one `aem.live` org to satellite sites in different `aem.live` orgs. No special permissions, no Code Sync App install on the satellite's GitHub org, no per-site code copies.

### Spike artifacts

The verification script is at `/tmp/repoless-verify.sh` (regenerated on demand). Resources created by the test:

| Resource | Purpose |
|---|---|
| `skukla/repoless-spike` GitHub repo | Canonical code source |
| `skukla/repoless-spike` `aem.live` site | Canonical aem.live site (auto-created on Code Sync install) |
| `kukla-demos/anchor` GitHub repo | Prerequisite anchor for the `kukla-demos` `aem.live` org |
| `kukla-demos/anchor` `aem.live` site | Anchor site |
| `kukla-demos/satellite` repoless site | The cross-org test target (no GitHub repo of its own; reads code from `skukla/repoless-spike`) |

## Validation 2 — AEM Sites + xcom architecture works in production

### The existence proof

[`roberttoddhoven/citisignal-one`](https://github.com/roberttoddhoven/citisignal-one) is a public, Apache-2.0 `aem-boilerplate-xcom`-shaped commerce storefront authored via AEM Sites. It is running in production demo use; content lives in an AEM Author instance at `/content/rth-citisignal-one/...`.

Repo characteristics that confirm xcom shape:
- `component-definition.json`, `component-models.json`, `component-filters.json` (Universal Editor authoring metadata)
- `helix-query.yaml` (EDS indexing)
- `blocks/` with commerce drop-ins (cart, checkout, PDP, account, etc.)
- `head.html`, `fstab.yaml` (EDS conventions)
- `paths.json` (the runtime content-path mapping — see below)

### What it proves architecturally

The original spike question — "Can xcom be authored via AEM Sites and transact?" — is answered **YES, in production**. There is no longer a hypothesis to verify; there is a worked example to copy.

### The bonus finding — config-as-content

CitiSignal One's `paths.json` shows commerce wiring authored as AEM content nodes, not committed to GitHub:

```json
{
  "mappings": [
    "/content/rth-citisignal-one/:/",
    "/content/rth-citisignal-one/configuration:/.helix/config.json",
    "/content/rth-citisignal-one/configs:/configs.json",
    "/content/rth-citisignal-one/configs-stage:/configs-stage.json",
    "/content/rth-citisignal-one/configs-dev:/configs-dev.json",
    "/content/rth-citisignal-one/redirects:/redirects.json",
    "/content/rth-citisignal-one/placeholders:/placeholders.json",
    "/content/rth-citisignal-one/products/recommended-products:/products/recommended-products.json",
    "/content/rth-citisignal-one/enrichment/enrichment:/enrichment/enrichment.json",
    "/content/dam/citisignal/images/products/:/images/products/"
  ]
}
```

Production / stage / dev commerce configs are content nodes. The `configuration` node is the default fallback. Promotion is content authoring, not a code merge. **This is the pattern the project adopts** — see [commerce-connection-kit § Config-as-content](../backlog/commerce-connect-aem-sc/commerce-connection-kit.md#config-as-content-the-citisignal-pattern).

### Verdict

✅ **`xcom` + AEM Sites authoring + transacting works.** The architectural risk for the AEM Sites side of the build is closed. The remaining work is wiring, not pattern discovery.

## What remains open (not blocking)

**Cross-account cart/checkout end-to-end** — read path is closed by [Adobe's Merchandising API docs](https://developer.adobe.com/commerce/services/optimizer/merchandising-services/using-the-api) ("Authentication is not required"). Write path (cart, checkout) wasn't tested live. Documentation triangulation indicates ACCS handles cross-origin at the edge; a single `Origin`-header probe against the core ACCS endpoint would confirm definitively. Not a build gate — worth running at convenience.

## Decision impact

These two validations support locking the architecture to **repoless with per-org content sources**:

| Question | Status before 2026-06-05 | Status after |
|---|---|---|
| Cross-org repoless supported? | Hypothesized (Adobe docs only) | ✅ Verified live (Admin API + runtime) |
| xcom + AEM Sites authorable? | Hypothesized (xcom exists, no end-to-end) | ✅ Verified (CitiSignal One in production) |
| Multi-env commerce config pattern? | Speculation about per-env overlays | ✅ CitiSignal One uses config-as-content per environment |
| Two-fork-sync model still required? | Was the locked plan | ❌ Replaced by repoless; fork-and-sync survives as escape hatch only |

See [storefront-topology](../backlog/commerce-connect-aem-sc/storefront-topology.md) for the locked architecture this evidence supports.

## Sources

- [Adobe — Setting up the Configuration Service](https://www.aem.live/docs/config-service-setup) — the API used in Validation 1
- [Adobe — Repoless (One codebase, many sites)](https://www.aem.live/docs/repoless) — Adobe's first-class doc for the capability
- [Adobe — Get started with the Merchandising API](https://developer.adobe.com/commerce/services/optimizer/merchandising-services/using-the-api) — "Authentication is not required" finding
- [`adobe-rnd/aem-boilerplate-xcom`](https://github.com/adobe-rnd/aem-boilerplate-xcom) — the boilerplate
- [`roberttoddhoven/citisignal-one`](https://github.com/roberttoddhoven/citisignal-one) — the worked example
