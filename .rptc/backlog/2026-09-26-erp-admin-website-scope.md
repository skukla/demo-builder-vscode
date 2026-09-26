---
id: AB-36
kind: fix
area: app-builder
needs: []
value: high
status: built
parent: AB-26
---

# The integration's Admin page lists no websites to set things for

Filed 2026-09-26 from the owner: "I don't see websites in the drop-down under the Mapping
tab." The Mapping tab's scope list shows Default Config only, while Bodea has four websites.
Per-website settings (the sales organisation per website today; which ERP serves a website
under several ERPs) are what routing and structure rest on, so this is Phase A step A6 of
`.rptc/plans/several-erps/overview.md`.

Research first (running 2026-09-26): `.rptc/research/erp-admin-website-scope/research.md` —
where the scope list comes from (the integration's `erp/settings` over
`@adobe/aio-commerce-lib-config`'s scope tree), whether and when the tree is synced from
Commerce, the options to fix it, and how website scope should work once one integration serves
several ERPs. The fix follows the research.

## Cause (research 2026-09-26, checked against the code the same day)

The websites are very likely stored; the page's picker throws them away.
`@adobe/aio-commerce-lib-config` keeps the scopes as a TREE: `global`, then a `commerce` node
whose children are websites, then stores, then store views (lib `dist/es/index.mjs` builds
`children` under the `commerce` node, level `store_view`). The integration's `scopeChoices`
(`web-src/src/settings-view.js`) looks at the top level only and drops `global` and
`commerce`, so Default Config is all that is left. Its tests passed on an invented flat list.

Three more defects surface once the picker is fixed: `dressField` (`mapping-view.js`) compares
the value's origin, an object, with a string, so every website setting reads "Inherited"; the
picker labels choices with `name` where the library sets `label`; and `settingScopes`
(`src/lib/settings.js`) reads Commerce's websites only once, so a website added later never
appears. Adobe's docs say the scope list is not kept in step with Commerce and the merchant
refreshes it by hand (Manage Scopes → Sync commerce scopes).

The fix: walk the whole tree with the library's field names, compare `origin.level`, a
"Refresh websites" action on the page (the refresh path exists and nothing calls it), keep the
old list when Commerce cannot be read, and replace the invented test data with a tree captured
from a real read. For several ERPs: an ERP does not own websites (one website sells several
ERPs' products); only the sales organisation needs both an ERP and a website, and lib-config
has no per-ERP dimension, which B3 decides. Owner questions are in the research file.

## Shipped so far

- 2026-09-26  commerce-erp-integration a2a13a8, deployed to Bodea: the picker walks lib-config's tree (websites and their store views; stores and Admin left out), a value's origin level is compared properly (website values stop reading Inherited), a commerce node with no websites counts as unread, Refresh websites reads Commerce again (erp/settings ?refresh=true), a failed read keeps the last list with a note. Tests and the preview use the tree lib-config builds from Bodea's real websites. Proven live: the refreshed tree from the deployed action holds the four websites and their store views, same shape as the tests. Not seen live: the picker's popup inside the Admin frame (it would not render in a screenshot).
