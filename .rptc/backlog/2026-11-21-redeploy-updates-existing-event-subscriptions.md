---
id: AB-90
kind: fix
area: app-builder
parent: AB-41
needs: []
value: med
status: backlog
---

# Redeploying the ERP integration updates its Commerce event fields on existing projects

Filed 2026-11-21 from the backlog reconciliation (AB-41 named it as a secondary finding worth a
follow-up; no item carried it).

When AB-41 changed the company event's field from `id` to `entity_id`, the deploy's reconcile did not
push the field change to the subscription that already existed; it took a forced re-subscribe. The
integration's own `docs/sync-validation.md` (lines 70, 87) notes "no targeted refresh tool exists",
and Demo Builder has no refresh path. So any future field change ships to new projects only.

Done when a redeploy (or update) brings an existing project's event subscriptions to the fields the
new version declares, proved by changing one field and reading the subscription back.
