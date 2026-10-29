---
id: AB-39
kind: question
area: app-builder
needs: []
value: low
status: shipped
---

# Loop branch labels use AB-16 sub-ids that are not their backlog items

Filed 2026-09-28 (overnight loop). Noticed while validating AB-16c's second-ERP-look gap.

## What diverged

Loop branches in both ERP repos are named with `ab-16<letter>` labels that do NOT correspond
to backlog items at those ids — and the labels disagree even between the two repos:

- `demo-erp`: `loop/ab-16j-maintenance-mode`, `loop/ab-16k-net-price`
- `commerce-erp-integration`: `loop/ab-16j-maintenance-health`, `loop/ab-16k-contract`,
  `loop/ab-16n-clear-activity`, `loop/ab-16n-reset-closes-orders`, `loop/ab-16o-own-name`

So `ab-16j` means "maintenance-mode" in one repo and "maintenance-health" in the other; `ab-16k`
means "net-price" vs "contract". Meanwhile the backlog itself had only AB-16a–i until this
session, when the loop filed **AB-16j** (ERP-settings agent tool) and **AB-16k** (Admin-page
design divergence) — valid at the time (`backlog.mjs check` passed), but now colliding in name
with those branch labels. All the `main..loop/ab-16<x>` branches are already merged (nothing
ahead of main), so they are historical labels, not live work.

## The question / recommendation

The backlog (`.rptc/backlog`) is the single source of truth; branch names are not a registry.
Recommendation: leave AB-16j/AB-16k as filed (they are referenced in this session's commits and
memory; renumbering would churn immutable trailers), and reconcile by either (a) confirming the
merged `ab-16j/k/n/o` branch work is logged to whatever backlog items it belongs to
(`backlog.mjs unlogged` covers commits that name an item), and (b) deleting or renaming the
stale merged branches so the labels stop implying a backlog id. Low value; hygiene, not work —
raised so a future reader cross-referencing a branch name against the backlog is not misled.

## Shipped so far

- 2026-09-29  Deleted the 7 stale ab-16j/k/n/o loop branches (5 commerce + 2 demo-erp), all local-only and merged to main; also removed the merged keymap branch. Backlog ids AB-16j/k kept as filed.
- 2026-09-30  2026-09-30: the premise was half right — the feature branch HAD filed items at AB-16j (maintenance mode) and AB-16k (net price in force), invisible to the loop. On merge, the loop's ids were kept (46 references in code, tests and commits) and the feature branch's two items became AB-16q and AB-16p (7 references).
