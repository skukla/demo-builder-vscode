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
- 2026-10-19  fix(erp): adding an ERP that owns nothing says so once (`3058e656d`)
- 2026-10-18  docs(release-test): row 4.2 passes on Justrite (`cacf8078c`)
- 2026-10-18  perf(erp): the Add another ERP store read starts when a project screen opens (`7436216cb`)
- 2026-10-18  perf(erp): read the store's product pages four at a time (`86bf9644a`)
- 2026-10-18  perf(erp): every store read reuses the kept Commerce sign-in, signed in ahead (`445d5150b`)
- 2026-10-18  fix(erp): Add another ERP reads in short sentences and keeps its height (`cad406855`)
- 2026-10-18  fix(erp): Add another ERP waits for the store read and says how long it took (`53bbbf875`)
