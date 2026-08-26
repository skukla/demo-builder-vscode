---
id: AI-1k
kind: feature
area: ai
parent: AI-1
needs: []
value: med
status: backlog
layer: C
---
# The agent can query Commerce now, but has to discover the schema every time

## Index hook

*The item in one paragraph.*

**`run_commerce_query` closed the "I cannot run a query" gap and exposed the next
one: the agent does not know what to ask for.** Measured 2026-08-26 across three
runs of the `commerce-query` prompt — it guessed `products(search:…, pageSize:…)`,
got a GraphQL error, spent a round trip on `__type(name:"Query")` introspection,
then used `productSearch(phrase:…, page_size:…)` and got the answer. The trap is
specific and not "the schema is unknown": **`products` and `productSearch` BOTH
exist and behave differently** — `products` is Commerce Core, `productSearch` is
Live Search, and their arguments are not interchangeable. The agent picked a real
field with the wrong argument shape. Sixty root Query fields, two of them a near
name-collision. Filed 2026-08-26.

## What was measured

Three runs, all reaching the right answer, all paying for the discovery:

    1. run_commerce_query  { products(search: "", pageSize: 1) { total_count } }
       -> HTTP 400: Field "products" of type "Query" must have a selection of subfields
    2. run_commerce_query  { __type(name: "Query") { fields { name ... } } }
       -> 1,798 bytes / ~450 tokens of schema
    3. run_commerce_query  { productSearch(phrase: "", page_size: 1) { total_count } }
       -> {"data":{"productSearch":{"total_count":30}}}

The introspection call is cheap in bytes and expensive in the unit that matters:
`AI-1e` measured the ROUND TRIP as the cost, not the payload.

## Why it is not "give the agent the schema"

It already has it — `run_commerce_query` can introspect, and did, unaided. Adding
a `get_commerce_schema` tool would replace one round trip with a different one.

The gap is guidance, not access. Sixty root fields, and the two an agent will
reach for first are named four characters apart:

| field | is | takes |
|---|---|---|
| `products` | Commerce Core | `filter`, `search`, needs a subfield selection |
| `productSearch` | Live Search | `phrase`, `page_size` |

## Options, none chosen

- **Name the entry points in the tool's own description.** Cheapest possible: the
  description is already the agent's search surface, and "use `productSearch` for
  catalog counts and search, `products` for a known SKU" may be the whole fix.
- **Return the available fields WITH a field error.** The backend already says
  "Field X must have a selection of subfields"; the tool could add the candidates.
  Turns two round trips (fail, introspect) into one.
- **Teach it in the generated bundle** — `ai-context-authoring` territory, and it
  reaches every project rather than every call.

Worth measuring which, rather than doing all three: the prompt is already in the
battery and the metric is calls-to-answer, currently 2–3.

## Caveat

One prompt, one backend shape (ACCS with Live Search). A PaaS project without
Live Search has no `productSearch` at all, so guidance that names it
unconditionally would be wrong there. Check both backends before writing any.

Filed 2026-08-26.
