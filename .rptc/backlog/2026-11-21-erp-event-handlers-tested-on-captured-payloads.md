---
id: AB-92
kind: chore
area: app-builder
parent: AB-26g
needs: []
value: med
status: backlog
---

# The ERP integration's Commerce event handlers are tested against captured real payloads

Filed 2026-11-21 from the backlog reconciliation (AB-26g and AB-26f both named captured event
payloads as left).

commerce-erp-integration `test/fixtures/commerce/` holds only REST read answers (930e273). There are
no captured shipment, invoice or order-save EVENT payloads, and the handler tests build their events
by hand, so a field Commerce really sends differently (the AB-41 `id` versus `entity_id` failure) is
invisible to them.

Done when each event the integration subscribes to has a fixture captured from a live delivery
(redacted), and its handler test reads that fixture.
