---
id: AB-41
kind: fix
area: app-builder
needs: []
value: high
status: shipped
parent: AB-26
---

# Company updates never reach the ERP: the company-saved event carries no id

Filed 2026-09-29, found live on Bodea running AB-26e §3 (Company Commerce→ERP).

## Symptom

Renamed company 21 in Commerce (REST PUT succeeded, company_name → "Kukla Studios QA"); the
ERP partner C21's name did not change in 150s.

## Root cause (verified live)

The company-saved event DID dispatch — runtime activation `company-commerce/saved` ran and
FAILED, status 1, with `{"message":"the company event carries no company id","statusCode":400}`
(read via read_runtime_activation). So this is a handler failure, not an eventing/cron gap.

The handler (`src/commerce-extensibility-1/actions/company/commerce/saved/index.js:28-31`)
reads `params.data?.value?.id` and rejects when it is not a positive integer. The Commerce
event subscription for `observer.company_save_commit_after`
(`src/commerce-extensibility-1/.generated/app.commerce.manifest.json`) declares only
`fields: [{ name: "id" }]`. The B2B Company entity's primary key is `entity_id`, not `id`
(the sales-document events in the same manifest — shipment, invoice — correctly use
`entity_id`; only product uses `id`). So the payload's `id` is empty and every company update
is rejected. Companies only ever pair at the bulk fill, never on a later edit.

## Fix

Subscribe the company event to `entity_id` (as shipment/invoice do) and read it in the
handler. A robust form that works whichever key Commerce populates:

- manifest/config: add `{ name: "entity_id" }` to the company event fields (keep `id`).
- handler: `const companyId = Number(company.entity_id ?? company.id)`.

The manifest is generated; the source is the eventing config the generator reads (locate the
`company_save_commit_after` fields declaration there, not in `.generated/`). Redeploy the
integration (re-registers the Commerce eventing) and re-run §3.

## Done when

Renaming a company in Commerce updates its ERP partner within seconds, and AB-26e §3 runs to
PASS on Bodea.

## Shipped so far

- 2026-09-29  Partial fix shipped (commit 15dd0a0, deployed): handler now reads company.entity_id ?? company.id, and a direct replay (invoke_runtime_action company-commerce/saved {data:{value:{entity_id:21}}}) SUCCEEDED and renamed ERP partner C21 to Commerce's current name live. So the handler is correct. BUT the real company_save_commit_after event still fails 'carries no company id' — it delivers neither id nor entity_id in data.value. Remaining: the Commerce event subscription did not re-register with the new field on redeploy, OR Commerce sends the company id under a different key. Next diagnostic: log params on the no-id path, redeploy, trigger a save, read the failed activation logs to see the real payload shape. §3 stays blocked on event DELIVERY (handler is done).
- 2026-09-29  DIAGNOSED definitively (diagnostic deploy ca6b24d, live): the company_save_commit_after event arrives with data.value = {} — Commerce extracts NONE of the subscription's declared fields for this event (not id, not entity_id). This was true for the original id-only subscription too, which is why it failed from the first test. My entity_id field addition had no effect because the Commerce event SUBSCRIPTION did not re-register on a plain redeploy — aio app deploy does not update an existing subscription's fields (the known 'Refresh registrations' trap). So the real fix is forcing the Commerce eventing subscription to re-register with a field that resolves for the B2B Company entity (likely entity_id, still unconfirmed until value populates). Handler is already fixed+proven. Diagnostic log still in code (ca6b24d) — remove when the real fix redeploys.
- 2026-09-29  Re-registration mechanism understood (read @adobe/aio-commerce-lib-app management-DgwAhaaJ.mjs + utils getSubscriptionChangeKind): deploy reconciles subscriptions as none/in-place/recreate. in-place fires when new fields are a SUPERSET of old and calls updateEventSubscription — which updates I/O Events metadata but does NOT re-run Commerce's field extraction (set at subscribe time), so my add-entity_id (superset) change never changed what Commerce extracts → value still {}. recreate (delete+create) fires when fields are NOT a superset and DOES re-subscribe with new fields. SOLUTION: force a recreate by setting the company event fields to entity_id ONLY (drop id) so baseline{id} is not a subset of target{entity_id}. One-line config change + redeploy, no full reinstall. Also the first real test of whether entity_id resolves for the Company entity.
- 2026-09-29  Recreate attempt (entity_id only, deploy e75c5bf) did NOT close it: company_save_commit_after still fails 'carries no company id' — entity_id also does not resolve; NO flat field resolves (value={}). Deeper than a field name. Two unknowns not separable cheaply: (1) which field the B2B Company observer actually exposes (id and entity_id both empty — may nest differently or not be flat-extractable); (2) whether the recreate even applied (reconcile uses a baseline snapshot). Needs a spike: declare a KNOWN field (company_name) + temp payload log, redeploy, read the failed activation for the real shape. Handler is correct+shipped.
- 2026-09-29  Adobe docs checked (developer.adobe.com/commerce/extensibility/events/create-events, via adobe-docs skill → Context7 + fetch). Two documented facts reframe this: (1) ACCS/SaaS supports only a LISTED set of events — 'SaaS does not support all possible events. To view the list, System > Events > Events List. Contact Support to implement others.' company_save_commit_after may simply not be SaaS-supported, which explains value={} regardless of field name. (2) The correct field for an entity observer event is entity_id, NOT id — the docs' product example payload is {entity_id, sku, is_new}. Working events here (product/order/stock/shipment/invoice) are all on the supported list; company is the outlier. DECISIVE next step (cheap, no more deploys): check the ACCS Admin System > Events > Events List for whether company_save_commit_after is present and its available fields — that settles supported-vs-wrong-field. If unsupported, the fix is a support request or a different trigger, not a field change.
- 2026-09-29  ROOT CAUSE CONFIRMED via Admin Events Subscriptions grid (owner, 2026-09-29): company_save_commit_after is registered with Fields=[id] and NEVER changed despite my code edits to entity_id across two deploys — the @adobe/aio-commerce-lib-app deploy reconcile is NOT updating this subscription's Commerce fields (in-place updateEventSubscription doesn't change fields; the recreate also didn't apply). Two-part fix: (1) FIELD — company needs entity_id, not id (the grid confirms product uses id+works, but sales docs use entity_id; company's id yields value={} because the B2B Company entity exposes entity_id). (2) RECONCILE — the deploy won't push the field change, so it needs a forced re-subscribe (delete+create) or a manual Admin edit. Event IS SaaS-supported (Events List shows it). Immediate unblock: edit the subscription's Fields id->entity_id in Admin, re-test.
- 2026-09-29  SOLVED + proven live (2026-09-29): with the company subscription's field set to entity_id (owner set it in Admin), renaming company 21 in Commerce updated the ERP partner name in ~10s. §3 now PASS. Root cause = the field: the B2B Company event exposes entity_id, not id (id yielded value={}). Code fix is on commerce-erp-integration main (app.commerce.config.ts company event fields = [entity_id], e75c5bf), and the handler reads entity_id. NEW projects will register entity_id on fresh install. SECONDARY finding (lower priority): the @adobe/aio-commerce-lib-app deploy reconcile did NOT push the field change to Bodea's EXISTING subscription across two redeploys (stayed at id) — existing projects need a forced re-subscribe or a manual Admin edit; worth a follow-up on why the reconcile skips field-only updates.
