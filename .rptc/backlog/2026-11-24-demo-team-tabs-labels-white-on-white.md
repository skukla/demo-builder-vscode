---
id: EDS-82
kind: fix
area: eds
needs: []
value: med
status: backlog
---

# Demo Team's Tabs shows inactive tab labels white on white

Filed 2026-11-24, found while writing the shipped block examples (EDS-71).

`blocks/tabs/tabs.css` in `demo-system-stores/accs-citisignal` (commit `31ca953`, lines 27, 47 and
55) uses `var(--color-brand-1000)`. The Demo Team library goes to Starter and CitiSignal storefronts
(`block-libraries.json`, `defaultForPackages`), and both are built from the B2B template, whose
`styles/styles.css` defines `--color-brand-300` to `--color-brand-700` only (read at `f8eb94d`).
The colour is empty, so the inactive labels disappear.

Fix in the library: use a colour the template defines (such as `--color-brand-700`), or give the
`var()` a fallback.
