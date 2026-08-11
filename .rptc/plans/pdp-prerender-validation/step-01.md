# Step 01 — Stop reporting a false green

**Research rec 1. Blocks release.**

## Problem

`storefrontProbe.ts:166-173` sets `pdp.prerendered` from a 200 on
`/products/default` (`diagnostics.ts:68`). That path is `render-pdp`'s authored *input*
(`accs-discovery-service/actions/render-pdp/index.js:45, :103` — routed explicitly as a
non-PDP catch-all). The leg cannot go red for any prerender failure.

## Change

Report what the request actually proves. `/products/default` is worth probing — the
overlay has nothing to serve without it, so its absence *is* a real finding — but it must
be named as the template, not as a prerendered PDP.

1. Rename the result field. `pdp?: { path, status, prerendered }` →
   `authoredTemplate?: { path, status, published }`. Keep it optional and keep the
   "only when a path was supplied" contract.
2. Rename `PDP_BLOCK_CLASS` usage accordingly, or drop the body check — decide during
   implementation whether `class="product-details"` adds anything over a 200 for this
   path. Note in the docstring whichever way it goes and why.
3. `PDP_PROBE_PATH` → `AUTHORED_TEMPLATE_PATH`, with the comment rewritten: it currently
   justifies the path as a stand-in for a real SKU, which is the bug.
4. `verdictFor`: the `!prerendered` branch becomes a template branch —
   *"PDP fallback installed, but the overlay's source template {path} returned {status}.
   Publish it or reset the storefront — PDPs render from this page."*
5. `diagnosticsReport.ts:193-216`: relabel the line. No `(prerendered)` suffix anywhere.
6. The all-green verdict must stop over-claiming. `"Storefront delivery looks correct."`
   asserts more than four GETs can know. Replace with something bounded, e.g.
   *"Storefront delivery looks correct (fallback installed, template published). No SKU
   was checked."* — step 03 replaces that last clause.

## Tests

`tests/features/eds/services/storefrontProbe.test.ts` — 10 existing cases, several
reference `pdp`; update them with the rename rather than adding a parallel set.

New/changed cases:
- Template published → `published: true`, verdict does not claim a SKU was checked.
- Template 404 → `published: false`, verdict names the template and says PDPs render
  from it.
- **Control:** assert the string `prerendered` appears nowhere in the result or the
  verdict. This is the whole point of the step — without it the rename can be half-done
  and still pass.
- Existing GET-only test must keep passing untouched.

`tests/commands/diagnostics-copyReport.test.ts` currently never sets `storefront`
(fixture at `:29-56`), so `storefrontLines` has **no coverage at all**. Add a case that
sets it and asserts the rendered lines — otherwise step 01's relabel is unverified at the
render layer.

## Done when

- No occurrence of `prerendered` in `storefrontProbe.ts`, `diagnosticsReport.ts`, or
  `diagnostics.ts`, verified by grep **with a positive control**.
- `storefrontLines` has a test.
- `gate` green.
