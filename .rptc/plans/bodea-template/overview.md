# Bodea Demo Package — Plan Overview (v2: thin-layer, ADR-006-conformant)

## Step 0: RPTC Re-initialization (ALWAYS FIRST)

If starting fresh (context was cleared), re-invoke the workflow before executing any step:

```
/rptc:feat "Plan is approved, continue to implementation. Plan: .rptc/plans/bodea-template/ (worktree feature/bodea-template)"
```

## Context

Synthesize a new **Bodea** demo package from Jen's `sayurihanki/jenhankib2bbodea` storefront
(native-commerce blocks + VIP/customer-group machinery + theme; forked ~Feb 2026, one dropin
generation behind) and the existing Custom (B2B+B2C) template (boilerplate-b2b-template +
6 `eds-demo-patches/b2b` patches). Focus: **native commerce functionality** — simulated blocks
and client-branded cruft are dropped.

**v2 note:** a fork architecture (`skukla/bodea-template` as a maintained fork) was approved
and then WITHDRAWN after research into the isle5/CitiSignal history: every fork-style template
in this system rotted (isle5: hand-sync stopped 2026-03, now 140 commits + 1 dropin major
behind; buildright: 2–3 majors behind, never shipped; Jen's own fork: 1 generation in 5 months),
while the thin-layer LKG machinery advanced daily-green for 40+ days. ADR-006 (2026-06-10,
owner-decided) rejected fork maintenance "by the numbers". Bodea therefore ships **thin-layer**,
like custom/citisignal.

## Locked decisions

1. **Thin-layer architecture.** `templateOwner/templateRepo = adobe-commerce/boilerplate-b2b-template`,
   pinned via the existing LKG machinery (`codePatchSource` path `b2b`, `lkgFile b2b/last-known-good` —
   the same 6 patches as `custom`; a separate `bodea/` ledger family is created only when the
   first Bodea-specific patch actually exists). Updates flow via the proven thin-layer path.
   **eds-demo-patches initially unchanged.**
2. **Blocks (~35) are additive**, shipped from a new block-source repo `skukla/bodea-source`
   (user-chosen 2026-08-14: backend-neutral, and deliberately NOT "-template"/"-starter" —
   this repo is never generated from) via a `bodea-blocks` library
   entry (`nativeForPackages`/`onlyForPackages: ["bodea"]`). That repo runs a CI import-map
   check validating every `@dropins/*` import in its blocks against the **b2b LKG's** vendored
   dropin generation, plus a tenant-leak grep.
3. **Theme is additive + vendored**: net-new `styles/bodea-theme.css` (+fonts) fetched from the
   block-source repo and vendored into the generated storefront, with a marker-bounded
   `<link>`/font snippet in `head.html` — the ADR-005 `pdp404HandlerPublisher` shape, which
   ADR-006 explicitly prescribes for brand CSS. This is the one NEW extension mechanism
   ("brand assets vendor point"), small and data-driven.
4. **Customer-group/VIP machinery is additive**: net-new `scripts/bodea-customer-group.js`
   module importing `CS_FETCH_GRAPHQL` (exported from `scripts/commerce.js` at boilerplate HEAD — an EXTERNAL repo, not this one)
   + `@dropins/tools/event-bus`, subscribing to auth events and setting the hashed
   `Magento-Customer-Group` header. Vendored + loaded via the same vendor point.
   Zero patches on `commerce.js`.
5. **Descope-by-default for the two remaining core deltas** (patch policy: default answer is no):
   - Configurator PDP auto-routing → replaced by **authored PDP pages** carrying configurator
     blocks (content-native, zero patches). Verify during Wave 3.
   - Header VIP nav gating → **DELETED 2026-08-17, not deferred.** The pack's three
     shared catalogs assign the SAME 11 categories, so a menu driven by catalog
     assignment renders identically for every company and group — there is nothing
     to gate. No content assumed it either (no VIP nav entry, no VIP-only page among
     60 published paths). The `/vip-config.json` allowlist it depended on was never
     authored and nothing read it. Evidence:
     [`../../backlog/2026-08-17-bodea-shared-catalogs-are-undifferentiated.md`](../../backlog/2026-08-17-bodea-shared-catalogs-are-undifferentiated.md).
6. **Block scope** (unchanged from v1): native (commerce-account-hub,
   customer-segment-personalization-block, search-bar, live-block(+premium),
   vip-member-block-real-v2, de-MCCS'd vip-hero) + native-backed (uniform-configurator, ONE of
   luxury-configurator/product-configurator-luxe, guided-selling-luxe, product-teaser) +
   ~25 neutral/marketing. DROPPED: simulated trio (medal-rack-configurator,
   product-technical-details, promo-popup) + cruft (razer-*, form-2/3/4, mccs variants,
   superseded vip prototypes, how-it-works-stats-2, AI dirs, runbooks, portability package).
7. **Content** (unchanged): DA.live site under `skukla` matching the block-source repo name —
   curated one-time copy of Jen's site (prune dropped-block + account pages, rewrite hosts),
   published; account chrome via `accountContentSource: adobe-commerce/boilerplate-b2b` overlay.
   No contentPatches (we own the site).
8. **Rollout**: package lands `hidden: true`; unhide is the release step.
   **DONE 2026-08-17** — unhidden once all four pre-unhide items closed and the
   `bodea` store scope was exercised live from the import modal against the new
   website/store view.

## Steps

| Step | What | Repo | Kind |
|---|---|---|---|
| 01 | Extension: bodea package + bodea-blocks entries, test pins, brand-assets vendor point (TDD) | demo-builder-vscode (this worktree) | Code (TDD) |
| 02 | bodea-source repo scaffold: theme CSS + customer-group module + CI guards | skukla/bodea-source (new) | External repo |
| 03 | Block port waves (marketing → commerce → configurators), doc pages | skukla/bodea-source | External repo |
| 04 | DA.live curated content copy + publish + closure check | DA.live | Manual/scripted ops |
| 05 | End-to-end verification, descope decisions confirmed, unhide, release | demo-builder-vscode + live | Code (small) + manual |

Step 01 can land first, hidden. 02→03→04 sequential; 05 needs all.

## Open items — RESOLVED 2026-08-17 (three of four; one is a decision)

**1. `configDefaults` store/website/view codes — READ, then FIXED.**
Read live 2026-08-17 from the instance the Bodea project targets. It carried no
Bodea scope: websites were `admin` / `base` (Main Website) / `citisignal`. The
declared defaults (`base` / `main_website_store` / `default`) were valid — those
codes exist — but they are the GENERIC Main Website, shared with `custom` and
`isle5`, so two branded demos on one instance landed on top of each other.

A Bodea website, store and store view were then created, and the codes re-read
from the live store structure rather than assumed from the name: **`bodea`
(Bodea Website, id 3) / `bodea_store` / `bodea_us`**. `configDefaults` now points
at them, matching the CitiSignal pattern — the only other branded package with a
scope of its own. The pin in `demo-packages-bodea.test.ts` moved with it and
records why.

**2. VIP group-hash determinism — ANSWERED from code; no two-instance run needed.**
`hashCustomerGroupUid` is `SHA-1(base64-decode(uid))` hex, and the UID is base64
of the group's NUMERIC id (`MA==` is base64 `"0"`, the guest group). The datapack
ships customer groups by NAME — "Platinum Buyer", "ServerSavvy Solutions" — and
the service resolves name→id at import, so the id, and therefore the hash, is
assigned by whichever instance the pack lands on. **Hashes are not portable.**
That is not a problem, because nothing depends on one: `/vip-config.json` was
never authored (404 on the published site) and no block reads it. The shipped
mechanism resolves the group at RUNTIME — `bodea-customer-group.js` emits
`bodea/customer-group-changed` carrying the live UID, and `guided-selling-luxe`
consumes it. **Resolution: do not author a hash allowlist.** A sheet of
hard-coded hashes would be copied to every new project's DA site and be wrong on
any instance whose group ids differ.

**3. Configurator keeper — RESOLVED by the port.** `product-configurator-luxe`
exists nowhere in `bodea-source`, the extension config, or the block set; it was
dropped during Wave 3. `luxury-configurator` and `guided-selling-luxe` survive,
and both have published doc pages. Nothing to choose and nothing to update.

**4. VIP nav gating — DELETED, not deferred.** The insertion point was checked
rather than assumed (`blocks/header/header.js`, the `if (navSections)` loop) and
is not clean: a patch there would inject a fetch, a subscription and an allowlist
matcher, unlike the six surgical patches that exist. But that is the secondary
reason. The primary one is that **the data cannot express it** — all three shared
catalogs assign the same 11 categories, so a catalog-driven menu is identical for
everyone. No content assumed a gate, nothing read the `/vip-config.json` the
design depended on, and no code was ever written. Carried as "deferred" it would
read to the next person as supported-and-postponed, and cost them the afternoon
it cost to disprove. The measurement and the order of operations, should
catalog-driven menus ever be genuinely wanted, are in
[`../../backlog/2026-08-17-bodea-shared-catalogs-are-undifferentiated.md`](../../backlog/2026-08-17-bodea-shared-catalogs-are-undifferentiated.md).

## Verification (end-to-end)

1. Extension: `gate` skill green per step-01/05 commit; pin suites are the spec (TDD).
2. bodea-source CI: import-map check vs b2b LKG generation + tenant-leak grep red = no merge.
3. Live: `aem up` against the curated DA site during port; dogfood full creation in the
   Dev Host (hidden flipped locally): create → LKG pin + patches → content copy + overlay →
   bodea-blocks install + doc pages → theme/module vendor → publish → VIP login flow →
   account journeys → configurator page → reset round-trip (thin-layer reset re-pins to LKG).
