---
id: AB-26
kind: epic
area: app-builder
parent: AB-9
needs: []
value: high
status: active
---

# The ERP programme — every ERP slice, in one order, run by the loop

Filed 2026-09-24. The plan is `.rptc/plans/erp-programme/overview.md`; this epic is its backlog form so the unattended loop
(`.claude/skills/unattended-loop`) can pick slices with `backlog.mjs next`. Each child is
one slice; `needs` carries the dependency column of the plan's §6; the lane and the
verification block are in each child.

## Standing authorizations for this programme (owner, 2026-09-24, all three "Yes")

1. **Push `loop/` branches to `skukla/demo-erp` and `skukla/commerce-erp-integration`** (public
   repos) for backup, as the extension repo already allows.
2. **Deploy the ERP pair to a scratch workspace the loop creates and deletes** (decision 17
   of `.rptc/plans/erp-integration/`), so slices that change Commerce writes or event
   subscriptions can be proved live. Never the SC's real workspace; torn down after.
3. **Run the live sync baseline (slice V) on the demo Commerce instance**, placing and
   shipping orders — writes to demo data — and undoing them through reset.

Everything else keeps the loop's standing rails. What still needs a person: the Commerce
Admin rendering of the business-config form (a browser sign-in). Each slice's report says
which of these it used.

## Children, in the plan's order

AB-26a (composite entities) · AB-26b (Commerce API inventory) · AB-26d (headless screen
checks) · AB-26c (pair-in-a-box harness) · AB-26e (sync validation) · AB-26f (hold → Commerce)
· AB-26g (Commerce-side order changes → ERP) · AB-26h (per-source stock and small gaps) ·
AB-26i (pricing conditions) · AB-26j (business structure) · AB-26k (product master) ·
AB-26l (Home and search) · AB-26m (the entity map) · AB-26n–q (the four screen redesigns) ·
AB-19, AB-20 (live webhooks, existing) · AB-23, AB-16 (second pair, existing) · AB-26t (the
routing integration) · AB-26r (credit memo) · AB-26s (the payment leg) · AB-26u (the owner's walk-through of both systems, last).

## Shipped so far

- 2026-09-24  docs(backlog): the ERP programme as an epic with nineteen slice items, dependencies and verification blocks (`6b3cccb2b`)
- 2026-09-24  docs(backlog,plan): AB-26u — the owner's walk-through of both systems, filed so it is not forgotten (`c28810d79`)
- 2026-09-24  docs(backlog): AB-26i active — pricing conditions (`ca6c2d2bb`)
- 2026-09-24  docs(backlog): AB-26d built — the headless screen checks (`233534a9f`)
- 2026-09-24  docs(backlog): AB-26b inventory shipped to its branch; AB-26d started (`00220c487`)
- 2026-09-24  docs(backlog): AB-26a and AB-26b active — the loop's first two slices under way (`7100ade98`)
- 2026-09-24  docs(handoff): loop report through the business structure slice (`fc91c5e66`)
- 2026-09-24  docs(rptc): the loop stopped on the owner's word — report closed, PL-36 back to the backlog (`5b3a25a2e`)
- 2026-09-24  docs(rptc): the owner's answers to O4, O5, O8 and S1; Q-num points at custom order attributes for both ERPs (`afeecb448`)
- 2026-09-24  LIVE 2026-09-24 — round trip on Bodea through the extension's tools: remove_integration took the ERP Integration, Northwind ERP, their Commerce writes, app install, records and workspace away in 3m 36s (the undeploy left the integration's 8 actions running; the leftover check deleted all 8); add_integration brought the pair back fresh in 5m 16s — Acme ERP deployed, 5 APIs subscribed, integration 0.6.0 deployed and installed in Commerce, storefront republished to the CDN. Observed twice today: the Commerce install needs three rounds (transient conflict) before it takes — the existing retry covers it, cause not looked into. The fresh ERP is empty (0 partners, 0 products, no import): the walk-through's data steps are the next live thing.
- 2026-09-24  feat(app-builder): the ERP integration is named for its ERP — "Northwind ERP Integration", not "ERP Integration" (`30a5fede3`)
- 2026-09-24  VALIDATION DEBT recorded 2026-09-24 (owner: not done validating last night's and this morning's ERP work). Proven live today on Bodea: remove, first add (fresh workspace + credential), update, storefront republish with DA.live ask, ERP screen margin, integration naming. NOT yet run by a person against a deployed pair: the sync baseline / first import (ERP is empty), the loop's ERP screens with records in them, the credit-hold round trip both directions, the Mapping tab on a real Admin, the walk-through, the setup guide's story choice, decisions 3-7 and O5. Full list in .rptc/handoff/2026-09-24-loop-report.md § Validation still owed. Release order agreed: AB-16 stored-shape read → develop merged in → this list → cut from develop.
- 2026-09-24  Merge develop into loop/2026-09-24-erp-programme (180 commits; 120 files resolved hunk by hunk) (`496d8eff5`)
- 2026-09-24  feat(app-builder): the ERP's first sync from Commerce starts when its integration is installed (`daca8e0d9`)
- 2026-09-24  feat(ai): lookup_erp_record and follow_erp_order read Commerce companies and orders through the ERP integration (`d6ac0c337`)
- 2026-09-24  refactor(ai): the two ERP reads take the get_ prefix the read-only name rule recognises (`18c2fe6ea`)
- 2026-09-24  feat(ai): the ERP's own API and Runtime activations reach the agent surface (run_erp_rest, write_erp_rest, list_runtime_activations, read_runtime_activation) (`bf72a0cdb`)
- 2026-09-25  docs(report): the order round trip proven live, and the three defects it exposed (`c0ccaaba7`)
- 2026-09-24  fix(ai): the activation tools say what Runtime does not record, and the first conclusion drawn from them is retracted (`855518419`)
- 2026-09-25  docs(report): the order path proven live in both directions after the fixes (`dfac1339d`)
- 2026-09-25  docs(report): ERP-to-Commerce ship and invoice proven; the confirm mapping corrected against Adobe docs (`a11d79a49`)
- 2026-09-25  docs(report): the order mapping checked against Adobe REST tutorials and order pages (`95aaef752`)
- 2026-09-25  docs(erp): what live testing taught, pinned in the integration ledger and summarised here (`0ac3718af`)
- 2026-09-25  docs(report): credit-hold round trip proven; cart pricing webhook investigation recorded (`b25ece7c1`)
- 2026-09-25  docs(report): cart pricing proven live; the version gate and the prefix lesson recorded (`21ca91058`)
- 2026-09-25  docs(report): one numbered decisions list for everything recommended during the live validation (`59dc1f8be`)
- 2026-09-25  docs(report): Commerce Admin shipment and invoice reach the ERP; D12 resolved (`12785ca5c`)
- 2026-09-25  docs(report): D14 — the ERP refresh job overlaps itself on a slow Commerce (`332f1788c`)
- 2026-09-25  docs(report): D15 — ERP product events can apply out of order under redelivery (`79c818b99`)
- 2026-09-26  fix(app-builder): the install waits for a new workspace credential instead of failing (`523156219`)
- 2026-09-26  Order of work moved to .rptc/plans/several-erps/overview.md (owner, 2026-09-26): baseline first, freeze after contracts (r, s, v, w gated), then several ERPs (AB-16). New: AB-36, the Admin page's missing websites.
- 2026-09-26  Phase C added to .rptc/plans/several-erps/overview.md (owner, 2026-09-26): after several ERPs, reassess and clean up the ERP screens (readability) and the integration screens (Admin page, Demo Builder card), cosmetic finds collected on the way into its list.
