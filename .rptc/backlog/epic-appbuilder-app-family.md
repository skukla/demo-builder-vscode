---
id: AB-1
kind: epic
area: app-builder
needs: []
value: med
status: active
---
# App Builder app family — attach a deployable app to a demo

The deploy/subscribe spine shipped (`.rptc/complete/2026-06-17-appbuilder-app-deploy-spine.md`,
steps D1–D3). What remains are the three shapes built on top of it.

**This epic previously had no file of its own** — it existed only as a heading in
the index pointing at archived work, which is why its three children were
invisible as items for months.

## Children

| | |
|---|---|
| `AB-1a` | Package-bound apps — auto-attach to a demo template. **Gated** on the first real bound integration |
| `AB-1b` | App-only / no-storefront project |
| `AB-1c` | Promote a shell-built app to a GitHub repo |

## Related

`AB-2` (per-SC Adobe I/O project) is the same territory from the other side —
where the integration gets deployed, rather than what it is.

## Shipped so far

- 2026-08-28  2026-08-27 reconciliation: the App Management arc shipped under this epic today — AB-1d (kit as seed + registry Commerce contract), AB-4 (uninstall before remove), AB-5 (install-state surface: drawer row, status/install tools, Commerce Admin link). The spine now covers the full lifecycle: add, deploy, install, status, retry, uninstall, remove. Remaining scope is unchanged: the three shapes (AB-1a gated, AB-1b, AB-1c).
