---
id: AB-15
kind: fix
area: app-builder
parent: AB-9
needs: [AB-23]
value: med
status: backlog
---

# Refuse an ERP integration that would collide with another project's

Filed 2026-09-17, from a code-only spike (owner asked whether several ERP integrations can
be added without conflicting; findings in `.rptc/plans/erp-linked-tiles/overview.md`).
Nothing was run live.

## What collides

- **Two projects on the same Adobe workspace.** Both deploy into one Runtime namespace
  with fixed package names (the integration's, and `demo-erp` from `deriveOwPackage`), so
  the second deploy replaces the first. The ERP's screen key is stored per project and
  passed at deploy, so the second project's key replaces the first's and its Open ERP link
  stops working. The ERP database collections and the integration's triggers and ledger
  are shared. Removing either project deletes the other's packages (the runtime
  verification deletes leftovers it attributes by name).
- **Two workspaces pointed at one Commerce instance.** Webhook and event subscription
  names are fixed per App Management app id, so the second install finds them "already
  subscribed" and skips them: Commerce keeps calling the first workspace's actions, and
  either uninstall deletes both. Two ERPs would also write prices and company fields into
  the same catalog, and each reset would revert the other's ledgered writes. The Admin menu
  id is the same for both; what Commerce does with that is unknown.

Twice in one project is already refused. Separate workspaces with separate Commerce
instances share nothing the spike could find.

## What AB-17's answer changes (2026-09-20)

**The first case goes away.** Each integration and each system gets its own workspace,
created by and recorded on ONE project (AB-17 answered; AB-23 builds it), so two projects
cannot land in the same namespace — there is nothing left to collide over. The refusal
this item was going to add for that case should not be written.

**The second case stays**, and stays a refusal for now. Two workspaces pointed at one
Commerce instance still collide on webhook and event subscription names, because those
are named from the App Management app id, not from the workspace. AB-17's local spike
showed the id CAN vary per build, and that webhooks, event names and provider instance
ids all carry it — so this could become a fix rather than a refusal. It needs the live
check first (AB-17's step 6: two copies with different ids on one Commerce, the first
copy's webhooks untouched), and the id is fixed at first install and cannot change on an
upgrade.

So this item shrinks to: refuse the Commerce-instance collision, name the other project,
and say plainly that projects on another machine are invisible to the check.

## The fix

At add time, before anything deploys, refuse either setup and name the other project:
"<project> already has the ERP integration in this workspace" / "... on this Commerce
instance". The extension knows its own projects, so the check can read their manifests;
projects on another machine are not visible, which the refusal text and the docs should
admit.

Making the setups coexist (per-project names for packages, collections, webhooks and
subscriptions) is a larger change; do it only when a demo needs it.

## Done when

The Commerce-instance collision is refused before deploy with a message naming the other
project, with tests, and `erp-integration.md` says what is and is not supported —
including that the check cannot see projects on another machine. The workspace collision
needs no refusal once AB-23 has landed; a test should show that two projects can no longer
reach the same workspace.

## Shipped so far

- 2026-09-20  Rewritten around AB-17's answer: the two-projects-one-workspace case disappears with AB-23 and needs no refusal; the Commerce-instance collision remains, and a per-copy app id could later make it a fix.
