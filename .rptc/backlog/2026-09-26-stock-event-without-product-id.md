---
id: AB-35
kind: fix
area: app-builder
needs: []
value: med
status: built
parent: AB-26
---

# The Commerce stock handler fails on a stock event with no product_id

Filed 2026-09-26. Renaming smartcable in the ERP reached Commerce in about five seconds, as it
should. Right after, the integration's `stock-commerce/updated` handler failed twice (11:05:57 and
11:06:25 UTC, Runtime activations 996afd55… and 7a2909f6…), answering 400 "the stock event carries
no product_id". So the product save the ERP caused made Commerce send a stock event of a shape the
handler does not accept, and every such save now leaves a failed run behind.

Not yet known: what that event carried instead (read it with `read_runtime_activation`, which
now follows the sequence), and whether it is an echo of the integration's own write that should
be recognised and skipped, or a real stock change keyed some other way (sku, source item).

## Shipped so far

- 2026-09-26  commerce-erp-integration 2d725ba: main hands the check and transformer the event's data and both read data.value one level further in, so every real stock event failed; their tests handed them the whole event. Fixed, with a test driving main itself. Proven live 11:32 UTC: an ERP rename now brings 'Product smartcable updated: stock 1000' into the ERP journal, which the 11:05 and 11:06 renames never did.
