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
