# Can an end user validate that PDP prerender works on their storefront?

**Date:** 2026-08-10
**Question:** Before cutting a release, have we done all we can to let an end user
confirm the smart-404 / PDP prerender path is working on their storefront?
**Method:** three parallel `rptc:research-agent` passes (feature discovery, request-path
tracing, validation-surface inventory), then direct verification of the load-bearing
claims. Claims below are marked **[verified]** where read first-hand this session and
**[agent]** where reported with file:line but not re-read.

---

## Answer

No — and the first problem is not a missing check. **The check we already ship reports
a false green.**

A user running `Demo Builder: Diagnostics` against a storefront whose prerender is
completely broken currently sees:

```
  PDP /products/default: HTTP 200 (prerendered)
  → Storefront delivery looks correct.
```

---

## 1. The false green

**[verified]** `PDP_PROBE_PATH = '/products/default'` — `src/commands/diagnostics.ts:68`.

**[verified]** The leg sets `prerendered` on a 200 whose body contains
`class="product-details"` — `src/features/eds/services/storefrontProbe.ts:34`, `:166-173`.

**[verified]** `/products/default` is **the authored source template that `render-pdp`
reads**, not a prerendered output. `accs-discovery-service/actions/render-pdp/index.js:103`
fetches exactly `https://main--{site}--{org}.aem.live/products/default`, and `:45` routes
it explicitly as a "catch-all" that is *not* a PDP.

It is an ordinary authored page published by normal publishing. It returns 200 with that
div whether or not:

- the content overlay is registered with the Configuration Service,
- `render-pdp` is deployed or reachable,
- `prepublish-pdp` works,
- the smart-404 snippet was ever vendored.

We probe the **input** to the prerender chain and label it the **output**.

### Provenance

Not a knowing tradeoff — a drift between plan and implementation. The original plan
(`.rptc/plans/storefront-delivery-probe/overview.md`) specifies the row
*"Was this PDP prerendered? `GET /products/...` → 200 + product markup"* and never
mentions `/products/default`. The path was chosen at implementation time and rationalised
in a comment (`diagnostics.ts:61-67`): a real SKU "would 404 whenever that SKU simply has
no page, which reads like a broken storefront."

That concern is real. The answer is to resolve the ambiguity, not to probe something that
cannot fail.

---

## 2. Three silent successes at setup time

| # | What | Where | Effect |
|---|---|---|---|
| a | The `warning` field is sent but never rendered | **[verified]** sent at `storefrontSetupHandlers.ts:417`; `StorefrontSetupStep.tsx` contains **zero** `warning` references | "Product detail pages will not load" reaches the webview and is dropped. Only the changed `message` string survives |
| b | Overlay failure is gated on the URL being truthy | **[verified]** `storefrontSetupPhase3.ts:285` — `if (edsConfig.byomOverlayUrl && !registered)` | BYOM disabled or `overlayUrl` invalid → no flag, no toast, plain `"Storefront setup completed successfully!"` for a storefront that can never serve a PDP |
| c | `installSmart404Handler`'s result is discarded | **[verified]** bare `await` at `storefrontSetupPhase2.ts:109` and `edsResetRepoHelper.ts:301` | `Pdp404InstallResult` (`pdp404HandlerPublisher.ts:35`) has no consumer in `src/` or `tests/`. A skipped install reaches only the debug log |

For (b) the trigger is easy to hit: `demoBuilder.byom.overlayUrl` rejects any non-https,
non-loopback, or >2048-char value and logs to the debug channel only
(`edsHelpers.ts:235-237`, `:292-295`) **[agent]**.

---

## 3. What exists today

### The probe — `src/features/eds/services/storefrontProbe.ts` **[agent, file:line]**

Read-only by construction, GET-only, enforced by test. Four legs:

| Leg | Signal | Verdict on failure |
|---|---|---|
| site reachable | `GET /` | `"Storefront unreachable at {baseUrl} (HTTP {status})."` |
| smart-404 handler | `GET /scripts/delayed.js` contains `SMART_404_MARKER_START` | `"…PDP fallback is incomplete: smart 404 handler missing. Reset the storefront to reinstall."` |
| eager redirect | `GET /404.html` contains `SMART_404_HEAD_MARKER_START` | same shape, names the missing piece |
| PDP | `GET {pdpPath}` → 200 + `class="product-details"` | **see §1 — cannot fail as wired** |

Good properties worth preserving: short-circuits on an unreachable root so a down site
isn't reported as "reinstall"; refuses to call an ambiguous 404 a failure; names the
missing piece rather than dumping the legs.

### Setup-time surfaces that do work **[agent]**

- Create path: toast + changed completion message on overlay-registration failure
  (`storefrontSetupPhase3.ts:284-307`, message at `edsHelpers.ts:308-310`).
- Reset path: log + progress line `"⚠️ Product pages not registered — reset again to
  enable product detail pages"` (`edsResetService.ts:158-171`), no toast by design
  (headless-safe).
- Unapplied-patch toast covers the SKU-encoding patches (`patchReportHelper.ts:123-140`),
  fired once, dismissible, invisible to MCP/headless callers.
- Generated `AGENTS.md` carries a "when PDPs 404, check in this order" list
  (`aiContextWriter.ts:253-289`).

### What does not exist **[agent, searched]**

- No MCP tool exposing probe / PDP / overlay state.
- No dashboard badge or project-card status for it. The "Frontend" badge reads
  `project.edsStorefrontStatusSummary`, a locally persisted string written by
  republish/reset/configure — it says "Published" regardless of what is serving.
- No test for `diagnosticsReport.ts:193-216` (`storefrontLines`); the fixture in
  `tests/commands/diagnostics-copyReport.test.ts` never sets `storefront`.
- No automated check that the three hand-copies of `encodeSkuForUrl` agree
  (`pdpUrlEncoding.ts`, the `product-link-sku-encoding` patch in `eds-demo-patches`,
  and `check-sku-exists.js`).

---

## 4. Silent failure modes, ranked

From the request-path trace **[agent]**. "Silent" = the user believes it works.

| # | Failure | Reachable by a fetch-only probe? |
|---|---|---|
| 1 | BYOM off / invalid URL → create reports plain success | **Yes** — nothing serving the overlay |
| 2 | `render-pdp` falls back to its generic bundled shell and that shell is **written into the content bus permanently** (any 403/404/timeout on the authored fetch) | **Yes** — served page lacks the storefront's own markup |
| 3 | `/products/default` edited after setup never reaches already-published PDPs; no re-prewarm outside create/reset, plus a 5-min action cache | Partly |
| 4 | Cross-repo encoder drift, three copies, zero detection. `eds-demo-patches` has **no published release**, so patches resolve to unpinned `main` | **Yes** — if the probe builds the path with our encoder |
| 5 | `sanitizeUrlKey` vs canonical `sanitizeName` — a fourth hand-copy, currently identical, ungated | **Yes**, same mechanism as 4 |
| 6 | SKU-encoding patches not applied (`critical: false` in all ledgers) → lossy links for prose SKUs | No — page renders 200, empty block |
| 7 | `daLiveOrg ≠ repoOwner` on an existing repo (repo list unfiltered, selection sets site but not org) | **Yes** |
| 8 | Deleted SKU whose PDP was already published → cached 200, empty block | No |
| 9 | Catalog Service becoming case-sensitive on `products(skus:)` | No — 200, empty block |
| 10 | The shared action is one stage deployment in another repo, baked into every registration at registration time | **Yes** |
| 11 | Prewarm skipped for PaaS → cold path on every first click during a live demo | No |
| 12 | Missing CSP nonce → eager redirect skipped, visible 404 flash, self-heals | No |

**The boundary.** Modes 6, 8, 9 render **200 with a structurally valid shell and an empty
product block**. No fetch-only probe distinguishes those from success; it needs page JS or
a Catalog Service cross-check. `storefrontProbe.ts:16-21` already states this limit.
Roughly half the modes are reachable — saying which half in the verdict is part of doing
this honestly.

---

## 5. Recommendations

| # | Change | Confidence | Cost |
|---|---|---|---|
| 1 | Stop calling `/products/default` "prerendered" — report what it proves | High | ~1h |
| 2 | Probe one **real SKU**, path built with the same `sanitizeUrlKey` + `encodeSkuForUrl` the storefront uses | High | 1–2d |
| 3 | Close the three setup silent successes (§2 a/b/c) | High | hours |
| 4 | Surface it outside the palette via the `onOpenChecks` registry | Medium | medium |
| 5 | Wrap as an MCP descriptor row | High | ~6 lines after (2) |

**Release gating:** 1 and 3 block. A check that says "looks correct" for a broken
storefront is worse than no check, and both are small. 2 is the feature itself. 4 and 5
can follow.

Why (2) earns its cost: our code builds the path and the storefront's code serves it, so a
single request exercises the encoder contract end to end — the one mechanism that closes
failure modes 4 and 5, which today have three hand-copies and no gate.

Precedents to copy: `storefrontProbe.ts` itself (same target, same shape, same host);
`githubCredentialProbe.ts:184-225` for turning independent legs into one ordered verdict;
`meshVerifyCheck.ts:54-86` for the three-way `ok`/`warning`/`unknown` split if this reaches
a badge.

---

## 6. Open questions

### CLOSED — the deployed actions match HEAD

Answered 2026-08-10 without probing or publishing. `accs-discovery-service/.env` carries
`AIO_RUNTIME_NAMESPACE` + `AIO_RUNTIME_AUTH` for `285361-249darkllama-stage`, the same
namespace in the default `overlayUrl`, so the namespace can be queried directly:

```
aio runtime action get accs-discovery/prepublish-pdp   # "updated": 1783910916157
```

| | |
|---|---|
| HEAD `9207b91` committed | 2026-07-12 22:21:07 -0400 |
| `prepublish-pdp` deployed | 2026-07-12 22:48:36 -0400 (+27 min) |
| Commits to `actions/` after HEAD | none |
| Uncommitted changes in `actions/` | none |

The deploy postdates the commit, so the SKU-existence gate is live. All three actions
deployed within 4 seconds of each other — one `aio app deploy`.

Two method notes worth keeping. `aio runtime action get --code` **cannot** read these —
it returns `Error: Cannot display code because it is not plaintext` (the bundle is
binary), and a naive grep of that 63-byte error file reports "gate not found." A positive
control caught it. And `aio runtime action list` prints a local-format datetime with no
zone; the `updated` epoch-ms field from `action get` is what makes the comparison sound.

### CLOSED — `suffix` on the overlay is documented and correct

The authoritative schema is public: **`https://www.aem.live/docs/admin.html#schema/ContentConfig`**
(a Redoc page; the spec is embedded in the server-rendered HTML, so strip tags and read it
rather than expecting a `.yaml`). It defines `content.overlay` as a *Markup Content Source*:

| field | required | notes |
|---|---|---|
| `type` | yes | value `"markup"` |
| `url` | yes | uri |
| `suffix` | no | string |

Its own example is literally
`"overlay": { "type": "markup", "url": "…", "suffix": "string" }`.

So `configurationService.ts:199` is right, and the reason is no longer empirical: our PDP
paths are extensionless (`/products/{urlKey}/{sku}`) while the overlay serves `.html`, and
`suffix` is the field that tells Helix what to append when fetching from the overlay. The
comment at `:186-198` should be updated from "observed once on citisignal-b2b" to cite the
schema — the behaviour is specified, not luck.

Why this looked undocumented: `https://www.aem.live/docs/config-service-setup` covers
`content.source` and never mentions `overlay` at all, and the one worked example
(`/developer/content-fragment-overlay`) puts `suffix` on `source` and omits it from
`overlay` — it is optional, and that example did not need it.

**Also documented, and new to us:** *"the overlay config is tied to the base content and
not to the site config — it is not possible to have multiple sites with different overlays
on the same base content."* Our model is safe today because each storefront has its own
DA.live content source, but two storefronts sharing a base content source could not carry
different overlays. Worth remembering before any content-source-sharing work.

### Still open

- Whether `daLiveOrg ≠ repoOwner` has occurred in the field. The path is unguarded in code;
  no field report found.
- Whether the mirrored encoder in `eds-demo-patches` is currently equivalent. Same
  algorithm by inspection; no normalized diff attempted.

## Related

`docs/architecture/eds-byom-pdp-routing.md` · ADR-005 (BYOM routing) · ADR-007 (SKU URL
encoding) · ADR-012 (diagnostic surfaces — MCP wrapping still planned) ·
`.rptc/plans/storefront-delivery-probe/` (shipped as `04bc98c3`; still in `plans/`, belongs
in `complete/`) · `.claude/skills/eds-publish-and-config`
