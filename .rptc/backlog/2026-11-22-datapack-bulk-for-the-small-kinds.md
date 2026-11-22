---
id: DI-18
kind: feature
area: data-installer
needs: []
value: low
status: backlog
---

# Datapack installs: the smaller kinds through Commerce's bulk API

Filed 2026-11-22, when items were linked to their plans. Step 2 of
`.rptc/complete/datapack-batching/overview.md`, the plan behind [[DI-8]]. The plan's other steps
shipped (`26f6cdb78`, `9dd98255e`, `ad99a2362`, and a live Luma install and removal on
2026-11-06); this one was never built.

## What is left

Assignments, categories, attributes, options, attribute sets, customer groups and cart rules are
still sent one object at a time. The step: send each kind through `POST async/bulk/V1/<route>`,
one bulk call per kind (per level for categories), reading each new id from
`bulk/{uuid}/detailed-status` (`result_serialized_data`), as the plan proved for customer groups
on the ACCS sandbox on 2026-11-06.

Checked 2026-11-22: `detailed-status` appears nowhere in `src/`, and the only bulk caller is
`bulkProducts.ts`.

`low` because installs already finish in minutes: products and customers, the big kinds, go
through the Import API. This only helps packs with many categories or attributes.
