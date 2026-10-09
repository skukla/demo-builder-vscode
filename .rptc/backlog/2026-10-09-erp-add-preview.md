---
id: AB-75
kind: feature
area: app-builder
needs: []
value: med
status: built
---

# Preview what every ERP will own before "Add another ERP"

Filed 2026-10-09 (owner request, the same day as AB-74).

## Why

The Add ERP dialog showed one count per option for the NEW ERP only. The SC could not see what
the other ERPs would keep, what nobody would own, or what two rules would both claim, until
after the add had deployed and the ownership pass had run. Two more owner requests came with
it: the website list said "The store has no websites." while the store was still being read,
and the dialog's text was cramped and worded as riddles ("Yes: attribute. No: websites.").

## What was built

- "After adding" in the dialog: one line per ERP with its count, its rule in words and up to
  three SKUs, then "Nobody: N" and "Claimed by two ERPs: N" when not zero. Worked out with the
  one resolver (`previewErpAdd` over `rulesAfterAdd` and `ownersAcross`), the catch-all
  included, and it follows the name and the rule as the SC changes them. A new ERP that would
  own nothing by erp_owner is told to use Assign products on its card after adding (AB-74).
- While the store is being read, the counts, the website list and the preview each show the
  house loading view; "no websites" only when the read answered none; a failed read says why.
  Add works before the read answers, as AB-72 requires.
- Every line rewritten in plain short sentences, the two options each with a sentence under
  them and their count on its own line; sections on Spectrum's size-300 gap. Strings live in
  `ADD_ERP_COPY` and `PICKER_COPY`.
- `add_erp` without `confirm` now answers the same preview and deploys nothing; the gate moved
  from the descriptor into the handler, as for the AB-74 tools, and the dialog sends
  `confirm: true`.

## Not verified

The dialog was not rendered in a real webview; the visual baseline captures surfaces at load
and cannot open this modal. Tests run it over the shared Spectrum mock.

## Shipped so far

- 2026-10-09  feat(erp): preview what every ERP will own before Add another ERP (`f9f690f94`)
