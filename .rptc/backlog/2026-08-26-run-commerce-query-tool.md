---
id: AI-1h
kind: feature
area: ai
parent: AI-1
needs: []
value: med
status: shipped
layer: C
---
# run_commerce_query — the agent finds the endpoint, then has to leave to use it

## Index hook

*The item in one paragraph.*

**The only gap the prompt battery found, and the agent wrote its own
specification.** Asked "how many products are in the catalog for this project?",
the agent searched, found `get_commerce_endpoints`, called it correctly, got the
endpoint and the store-scope headers — **and then hand-wrote two `curl`s**,
because nothing on our surface runs a query. It reached the right answer (30
products) by leaving. Scored `TOOL-INSUFFICIENT`: not a discoverability problem,
a missing capability. Note what a plain hit/miss score would have said about this
run: `HIT`. Filed 2026-08-26.

## The specification, written by the agent

Verbatim from the battery run, second attempt (the first omitted the
`Magento-*` headers and it corrected itself):

    curl -s -X POST '<commerce-graphql>' \
      -H 'Content-Type: application/json' \
      -H 'Store: bodea_us' \
      -H 'Magento-Store-Code: bodea_store' \
      -H 'Magento-Store-View-Code: bodea_us' \
      -H 'Magento-Website-Code: bodea' \
      -d '{"query":"{ products(filter: …) { total_count } }"}'

Everything before the `-d` is what `get_commerce_endpoints` already returns. The
tool is that call, with the query as the only argument.

## Why it is `med` and not `high`

The historical evidence is thinner than it first looked. Of 35 hand-built `curl`
calls in the transcript corpus, 25 are Commerce queries and **24 of those are
from June**, before `get_commerce_endpoints` existed. Only one is recent.

So the honest case rests on the battery run, not on volume: when an agent DOES
need to query, it currently must leave. That is worth closing, and it is not
evidence of a hot, frequent problem.

## Build notes

Reuse, do not re-derive. `buildCommerceEndpoints` already assembles the endpoint
and headers from `buildConfigGeneratorParams` + `generateHeaders`, so the query
tool and the storefront config cannot disagree about where to point. EDS services
already POST GraphQL (`commerceStoreDiscovery.ts` and siblings).

Read-only by intent: a query tool that can run mutations is a different risk
conversation. Decide that before writing the schema, not after.

## How to tell whether it worked

    `commerce-query` reaches for the shell:  yes today  ->  target no

Binary, one prompt, but run the whole battery — a new tool changes the catalog
every prompt sees, so the check is also "nothing else moved".

Filed 2026-08-26.

## Shipped so far

- 2026-08-26  docs(backlog): what the battery found — two bugs, one gap, one theory killed (`770f7987b`)
- 2026-08-26  VERIFIED live: { productSearch(phrase:"", page_size:1) { total_count } } returns 30 products in one call, 112 bytes — the same answer the agent hand-assembled two curls for. Mutation refused, unknown field returns the GraphQL error, missing endpoint named with what IS available.
