---
id: EDS-46
kind: feature
area: eds
needs: []
value: low
status: backlog
---

# The store step warns about a website with no products

Filed 2026-10-15 from the release walk. The scratch project was created on Main Website, which
on the shared Commerce has no products assigned. Nothing said so: the wizard offered it like
any other website, and the storefront came up with empty category pages ("Your search returned
no results") and a catalog menu that could not read a category tree.

Demo Builder already notices: the Catalog prewarm logged at creation
"No Catalog Service search index exists for scope base / main_website_store / default". It only
reaches the Debug Logs.

## What done looks like

The store step (and `create_project`'s store scope) says, beside a website it can tell has no
products or no search index, that its storefront will have no products, before the SC picks it.
A warning, not a block: a demo may be meant to start empty.

Related: the release test plan now tells the walker which website to pick.
