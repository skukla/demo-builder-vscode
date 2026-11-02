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
written: 233 open alerts at the first read, then 600, then 846, so none of those is a total.

## What to do first

**`citisignal-nextjs`.** GitHub lists critical `runtime` alerts on three repositories, and this is the one that
needs no second look. It locks Next.js 15.4.2 and the advisories' fixes reach 15.5.28. `next dev` listens on every network
interface by default (read from Next's own command help, 15.4.2), and the extension starts it with
`npm run dev` on the SC's laptop (`startDemo.ts`). So other machines on the same network can reach it. Whether
each advisory can be used against this storefront has not been tested. Its first beta should carry the upgrade.

The other two need a read before anyone acts on the label. `bodea-source`'s are `vitest` and `tinypool`, which are test
tools by name, yet its lockfile does not mark them as development. `demo-builder-vscode`'s is `proxy-addr`, under `express`
under the MCP SDK. The name `proxy-addr` does not appear in the built extension, which does not prove it is absent.

## Then

- **Sort by what runs.** Most alerts are `development`, so they are in test and build tools that reach neither an
  SC nor a deployed action. Those can wait for a routine dependency refresh. Start with `runtime`, high and critical.
- **The extension and the other deployed code.** The extension, `commerce-erp-integration`, `demo-erp` and
  `buildright-eds` have high `runtime` alerts. Being listed as `runtime` does not prove the code path is used. Some
  come through Adobe's own libraries, such as `jws` under `@adobe/aio-lib-ims`, and can only move with them or with an
  `overrides` entry.
- **Zero is not always clean.** `app-builder-shell` has a `package.json` and no lockfile, so its zero may only mean
  the scan had nothing exact to read. `eds-demo-patches` has no package file at its top level.

## Shipped so far

- 2026-11-02  citisignal-nextjs moved to Next.js 15.5.28 on main (844c896), which reaches no SC until its first beta. Its checks job passed, GitHub marked all 37 Next.js alerts fixed, and no critical alert remains there. Lint, typecheck, format, build, pages and a remote image through the optimizer passed locally; nothing ran against a live Commerce backend. It still has high runtime alerts on other packages, including sharp. Whether to keep the dev server open to the network is still the owner's to say.
