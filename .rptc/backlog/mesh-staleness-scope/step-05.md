# Step 05 — Dev Host verification

Depends on 04. **Cannot be done by tests** — the false negative step 01 fixes is invisible
from inside the suite by definition, and `demo-builder-test` is the live fixture that
produced it.

## Confirm the build first

`grep -c '<a-string-only-on-this-branch>' dist/webview/integrations-bundle.js`. A `0` means
another tree or an older build won. This burned a full session on 2026-07-30.

## Checks

`demo-builder-test` still carries the disagreement even after its mesh was fixed —
`componentConfigs['eds-accs-mesh']` holds `base` / `main_website_store` / `default` while
the backend holds `citisignal_*`. That makes it live ammunition, so **do not clean it up
before testing.**

1. **Healthy mesh, no false alarm.** The mesh is deployed with `citisignal_*` and should
   read Deployed — even though the stale duplicate is still in the manifest. This is the
   false-negative fix proving itself: the old code could have compared against that copy.
2. **The scope row is present when nothing is wrong.** It should show the deployed scope on
   a healthy mesh. If it only appears when stale, step 02 was built as a diff again.
3. **Names render** where a store view has been picked since step 03, codes alone where it
   has not. Both must look deliberate.
4. **Raise a real difference.** Change the store view in Configure → Business Structure,
   save, do NOT redeploy. Badge → Update available. The scope row must still show the
   DEPLOYED value, not the newly-configured one — that is the row's entire purpose.
5. **Redeploy clears it.** Badge returns to Deployed and the row now shows the new scope.
6. **Order-independence, for real.** Back up the manifest, hand-edit it to move
   `adobe-commerce-accs` BEFORE `eds-accs-mesh` in `componentConfigs`, reload, confirm the
   verdict is unchanged. This is the only check that exercises the actual defect on real
   data.
7. **No Customer Group anywhere**, and no ACCS mesh reading permanently stale because of it.
8. **Long values wrap** — a long store name plus its code must wrap inside the drawer
   rather than widening it.
9. **Integrations are unaffected** — no Commerce scope row on a non-mesh card.
10. **The storefront is untouched** — its detector was deliberately left alone.

## Done when

- All ten checked in a real Dev Host, with the build confirmed first
- Checks 4 and 6 in particular: 4 proves the row means "deployed", 6 proves the fix is the
  bug's and not the symptom's
