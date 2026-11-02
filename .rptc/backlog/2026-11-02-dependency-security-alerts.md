---
id: PL-90
kind: fix
area: platform
needs: []
value: high
status: backlog
---

# Work through the dependency security alerts on the repositories we own

Owner, 2026-11-02: turn on GitHub's Dependabot security alerts on all 13 repositories, the 12 components and
the extension. Done that day, each read back as on. Version-update pull requests stay off: they would add
steady upkeep across 13 repositories, and a merge reaches no SC until a release anyway.

Read the live numbers from each repository's Security tab. The first scan was still filling when this was
written: 233 open alerts at the first read and 600 about ten minutes later, so neither is a total.

## What to do first

**`citisignal-nextjs`.** It is the only repository with critical alerts on code that runs rather than on test
tools. It locks Next.js 15.4.2 and the advisories' fixes reach 15.5.28. `next dev` listens on every network
interface by default (read from Next's own command help, 15.4.2), and the extension starts it with
`npm run dev` on the SC's laptop (`startDemo.ts`). So other machines on the same network can reach it. Whether
each advisory can be used against this storefront has not been tested. Its first beta should carry the upgrade.

## Then

- **Sort by what runs.** Most alerts are `development`, so they are in test and build tools that reach neither an
  SC nor a deployed action. Those can wait for a routine dependency refresh. Start with `runtime`, high and critical.
- **The extension and the other deployed code.** The extension, `commerce-erp-integration`, `demo-erp` and
  `buildright-eds` have high `runtime` alerts. Being listed as `runtime` does not prove the code path is used. Some
  come through Adobe's own libraries, such as `jws` under `@adobe/aio-lib-ims`, and can only move with them or with an
  `overrides` entry.
- **Zero is not always clean.** `app-builder-shell` has a `package.json` and no lockfile, so its zero may only mean
  the scan had nothing exact to read. `eds-demo-patches` has no package file at its top level.
