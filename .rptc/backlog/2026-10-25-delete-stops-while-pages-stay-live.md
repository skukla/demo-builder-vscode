---
id: EDS-65
kind: fix
area: eds
needs: []
value: high
status: active
---

# A storefront delete goes on deleting while its pages are still live

Filed 2026-10-25.

## What happened

Deleting `scratch-1022` (agent `delete_project`, repository and DA.live site both
ticked) left the storefront serving on `main--scratch-1022--skukla.aem.live`. The home
page and every page checked answered 200 afterwards. Everything else was gone: the
DA.live content (97 files), the site's permission row and config, the GitHub
repository and the project folder.

The Debug Logs show why. Helix refused every call with `401 [admin] not
authenticated`: the listing of published pages, all 77 unpublishes ("Unpublish
complete: 0/77 live, 0/77 preview"), the product-page listing and the Admin API key
delete. DA.live accepted the same sign-in and deleted the content 20 seconds later.
The teardown's own check then said so ("4 of 4 pages checked ... still answer"), and
the delete carried on regardless: `tearDownStorefront` never stops, by design ("a
half-torn storefront is worse than a fully torn one"), and the project delete then
removed the repository Helix is keyed on.

The sign-in check at the start of the delete (`ensureDaLiveAuth`) passed. So that
check cannot be the gate: DA.live and Helix answered the same token differently.
`get_auth_status` a few minutes later said DA.live was not signed in at all. Which of
the two is right about the token is not known yet; a fresh sign-in followed by
`cleanup_dalive_site` on the orphaned site is the check that says.

## Why it matters

This breaks the first never-compromise property: whatever can be done can be undone.
With the source and the repository gone, the only route left to the live pages is the
Helix Admin API by hand. The SC is told the project is deleted while its storefront is
still on the internet.

## The fix

The live check the teardown already makes is the gate. When it finds pages still
answering (`still-live`), the teardown stops before deleting anything the unpublish
needs again: the Admin API key, the DA.live content, the site config. The project
delete then keeps the repository and the project, and says why: the pages could not
be taken off the live site, so sign in to DA.live again and delete again.

`unknown` (could not tell) does not stop it. That is also the answer for a site whose
content is already gone and whose home page no longer answers, and stopping there
would leave an SC unable to finish a delete.

Row 7.4 of the release test plan walks the button version of this.

## Shipped so far

- 2026-10-25  fix(eds): a storefront delete stops while its pages are still live (`d3ebc9945`)
