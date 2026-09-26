---
id: AB-36
kind: fix
area: app-builder
needs: []
value: high
status: active
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
