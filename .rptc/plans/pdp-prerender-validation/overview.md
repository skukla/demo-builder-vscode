# PDP prerender validation — make the check tell the truth, then make it mean something

## Context

Research: `.rptc/research/pdp-prerender-validation/research.md` (2026-08-10).

We already ship a storefront probe with a PDP leg. It probes `/products/default` — the
authored source template that `render-pdp` *reads* — and labels a 200 there
`prerendered`. That page serves 200 whether or not the overlay is registered, the action
is deployed, or the snippet was ever vendored. A user with a completely broken prerender
chain currently sees:

```
  PDP /products/default: HTTP 200 (prerendered)
  → Storefront delivery looks correct.
```

Three setup-time failures are equally silent: a `warning` the webview drops, an overlay
check that skips itself when BYOM is off, and an install result nobody reads.

## Scope

Recommendations 1–3 from the research, plus two follow-ons from the 2026-08-10 research
addendum. Recommendations 4 (dashboard badge) and 5 (MCP tool) are explicitly **out**;
both get cheaper once step 03 exists.

| Step | Source | Blocks release? |
|---|---|---|
| `step-01` — stop reporting a false green | rec 1 | **Yes** |
| `step-02` — close the three setup silent successes | rec 3 | **Yes** |
| `step-03` — probe a real SKU end to end | rec 2 | No |
| `step-04` — replace the `suffix` inference with the schema | addendum | No |
| `step-05` — make the shared action report its own version | addendum | No |

Steps 01, 02 and 04 are independent. Step 03 builds on 01's renamed leg. Step 05 is
cross-repo and has an ordering constraint inside it (5a deploys before 5b ships).

Step 04 is comment-and-doc only and can be done in any spare moment. Step 05 is the one
that pays forward: it turns "does the deployed action match HEAD?" from a forensic
exercise into a line in the diagnostics report.

## Principles for this work

1. **A diagnostic that can't fail is worse than no diagnostic.** Every leg added or
   renamed here must have a test that proves it goes red on the real failure.
2. **Ambiguity is reported as ambiguity.** `verdictFor` already refuses to call a PDP 404
   a failure. Keep that. The fix for "a 404 might just mean no page" is to remove the
   ambiguity by choosing a SKU we know exists, not to probe something that always passes.
3. **GET only.** Enforced by an existing test (`storefrontProbe.test.ts`). A diagnostic
   that writes can break the demo it was called to explain. Step 03 must not reuse
   `prewarmOne`, which POSTs.
4. **Name the boundary in the output.** Roughly half the known failure modes render a
   valid-looking 200 with an empty product block. The verdict should not imply we checked
   what we cannot see.

## Settled before planning (do not re-investigate)

Both were open questions on the research doc; both are closed there with method notes.

- **The deployed actions match HEAD.** `prepublish-pdp` deployed 2026-07-12 22:48:36 -0400,
  27 minutes after HEAD `9207b91`. Step 05 exists so this stays cheap to re-check.
- **`suffix: ".html"` on the overlay is correct and specified**, per the Admin API
  `ContentConfig` schema. Step 04 records that in the code.

## Out of scope (recorded, not chased)

- Dashboard "Frontend" badge is locally persisted, not network-derived — a second false
  green. Rec 4.
- No MCP tool wraps the probe. Rec 5.
- Three hand-copies of `encodeSkuForUrl` with no drift gate. Step 03 catches drift
  *in practice* for the probed SKU; it does not add a gate.
- `.rptc/plans/storefront-delivery-probe/` shipped as `04bc98c3` and should move to
  `.rptc/complete/`.

## Verification

`gate` after each step. Step 03 additionally needs a live Dev Host run against a real EDS
project — a fetch-only unit test cannot prove we picked a SKU that exists.
