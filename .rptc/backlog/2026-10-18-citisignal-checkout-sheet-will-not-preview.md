---
id: EDS-53
kind: fix
area: eds
needs: []
value: med
status: active
---

# CitiSignal's checkout label sheet will not preview on a copy

Every reset or creation onto CitiSignal publishes 14 of 15 copied sheets.
`/placeholders/checkout.json` is refused, every time:

> `400 Bad Request ([admin] JSON fetched from markup '/placeholders/checkout.json'
> is invalid: invalid sheet; unknown type — error from content-bus)`

The owner wants this fixed, not just explained (2026-10-17).

## Why it matters

The scratch project (`skukla/my-commerce-demo`) does not show it: its live site still
serves an older copy of the sheet that published before, byte-identical to the source.
A **new** CitiSignal project has no older copy, so its checkout would show raw label
keys (`Checkout.LoginForm.title`) instead of text. Not yet seen on a new project;
that is the inference from the old copy being what keeps the scratch site right.

## What is established (2026-10-17, release rows 3.17 and after)

- **Deterministic, not a one-off.** Three resets in a row, same sheet. The retry and
  the Helix reason in the log (`50904422b`) are what surfaced the message above.
- **Not how the reset sends the request.** Previewing the sheet from DA.live's own
  editor (blue button, Preview) gives the identical error.
- **Not our copy format.** Editing a cell in DA.live so DA re-saves the document
  in its own format, then previewing, still fails.
- **DA.live reads it fine.** The editor shows both tabs (`data`, `dnt`) and all 72
  rows correctly.
- **The source publishes the same content.** `main--accs-citisignal--demo-system-stores.aem.live/placeholders/checkout.json`
  serves 200, `:type: multi-sheet`, the same shape as `cart.json`, which copies and
  publishes fine.

## Ruled out, each against the 14 sheets that publish

| Suspect | Why it is not it |
|---|---|
| Double braces (`{{count}}`, 3 rows) | `placeholders` (10) and `placeholders/order` (6) have them and publish |
| Empty values (2 rows) | cart, order, payment-services, placeholders, sitemap, metadata all have them |
| A character no other sheet uses | none; the checkout character set is a subset of the others' |
| HTML in a cell (row 72, `<a href='…'>`) | `placeholders` has `<a href="…">` and `<br />` and publishes |
| Single-quoted attributes in that link | owner changed them to double quotes in DA.live and previewed: same error |
| Structure (columns, value types, sheet names) | identical to cart: `Key`/`Value`, all strings, `data` + `dnt` |

## Lead (2026-10-17, late): a template file at the same path

The B2B template (`adobe-commerce/boilerplate-b2b-template@48bed04`) ships ONE file
under `placeholders/`: `checkout.json`, a two-row leftover in the old bare-list shape
(`{"data": [...]}`, no `:type`). Every reset copies the template tree, so the project
repository has it. Of the 15 sheets, it is the only one with a repository file at the
same path, and it is the only one that fails:

| | `placeholders/checkout.json` in the repo | sheet previews |
|---|---|---|
| CitiSignal's own site (`demo-system-stores/accs-citisignal`) | 404 | yes |
| the copy (`skukla/my-commerce-demo`) | 200, from the template | no |

What DA.live stores and what its content host serves were both read with the
owner's token and are valid, identical multi-sheet JSON for checkout and cart. So the
JSON the publish service gets from DA.live is fine; the repository file is the
difference. Not yet proven: the falsifying step is deleting the repository file on
the scratch site and previewing again.

Fix, if it holds: when the content source serves a real sheet at a path, reset and
creation leave the template's repository file at that path out, the same rule the
label-sheet stubs follow (`placeholderStubPathsFor`). Both paths, or creation and
reset disagree.

## Where to look next (superseded by the lead above if it holds)

"Unknown type" reads like the publish service receiving a document it does not
recognise as a sheet at all, so the thing to see is what DA.live hands it, not
what the editor shows. That needs a signed-in read:
`GET admin.da.live/source/skukla/my-commerce-demo/placeholders/checkout.json`
(and the same for `cart.json`, to diff). No agent tool reads a stored sheet today
(`read_page` looks only for `.html`); the extension holds the DA.live token, so a
read-only tool or a one-off probe through the extension would do it.

If that read does not explain it, bisect in DA.live on the scratch site: delete half
the rows, preview, repeat. Row 72 is the first suspect to remove whole.

## Shipped so far

- 2026-10-17  fix(eds): a page refused once is retried, and the log keeps Adobe's reason (`50904422b`): the logging that named the error; the retry itself cannot clear this one

Related: [[EDS-40]], which moved sheet copying to DA.live's native JSON document.
- 2026-10-17  docs(backlog): EDS-53 records why CitiSignal's checkout sheet will not preview (`3c28a2001`)
