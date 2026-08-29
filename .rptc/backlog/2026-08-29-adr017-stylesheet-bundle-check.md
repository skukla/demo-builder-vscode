---
id: PL-18
kind: feature
area: platform
needs: []
value: high
status: backlog
title: Enforce ADR-017 §6 — a component may not use a CSS class its bundle cannot load
---

# ADR-017 §6 is stated but unenforced — the check that closes it

Filed 2026-08-29, when ADR-017 was written. The ADR names this as its own
weakest link rather than leaving it as an omission.

## The rule

Each webview is its own esbuild entry (`WEBVIEW_ENTRIES`, 8 of them), and a
feature stylesheet reaches a bundle only through a side-effect `import`
somewhere in *that entry's* graph. So a component reused across surfaces can be
styled on one and unstyled on the next.

## Why it needs a check rather than review

The failure is **completely silent**. No compile error, no console warning, no
failing test — the element just renders raw. Verified 2026-08-29: nothing in
`tests/sop/` or `tests/templates/` checks this today.

It has already shipped once. On 2026-07-31 `DestinationStage` used
`.service-action-link`, defined in EDS's `connect-services.css`. That sheet
reaches the wizard bundle only because `StorefrontStep.tsx` imports it. On the
integrations surface the class did not exist and the "Change" button rendered as
a raw grey box — reported as "this UI looks broken". Its styling in the wizard
had been working by accident the whole time.

That is the shape this repo keeps paying for: something that works for a reason
nobody chose, until a second caller appears.

## Sketch of the check

Per entry in `WEBVIEW_ENTRIES`:

1. walk the import graph (esbuild can emit it — `metafile: true` already
   produces one, so prefer reading that over re-implementing resolution)
2. collect every CSS file in that graph, and every class selector each defines
3. collect every class each reachable component *uses* — `className="..."`,
   `cn(...)`, and `UNSAFE_className`
4. flag a class used but not defined in any sheet the bundle loads

Ledger + reason contract like the other two architecture enforcers, so existing
accidents can be listed rather than blocking the first run.

## The traps to expect

- **Dynamic class names.** `cn('foo', cond && 'bar')` is fine; a template
  literal built from props is not statically resolvable. Those need to be
  skipped explicitly and COUNTED, not silently dropped — a check that quietly
  ignores what it cannot parse reports clean for the wrong reason.
- **Spectrum's own classes** (`spectrum-*`) come from the library, not from our
  sheets. Exclude them, and prove the exclusion is not swallowing real misses.
- **Positive control is mandatory.** Plant a component using a class from a
  sheet its entry does not import; the check must fail. Without that, a zero
  from this check is indistinguishable from a zero from a check that cannot see.

## Done when

The check runs in CI, fails on a planted violation, and its ledger carries a
reason per existing accident. ADR-017 §6's "not yet enforced" paragraph is
deleted in the same commit.
