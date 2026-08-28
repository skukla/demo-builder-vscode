---
id: AI-1l
kind: question
area: ai
parent: AI-1
needs: []
value: high
status: open
layer: C
---
# Does a tool make the agent faster, or just move where it gets stuck?

## Index hook

*The item in one paragraph.*

**A tool can be worse than no tool, and we now have the measurement that shows
it.** `run_commerce_query` was built because an agent hand-wrote curls to query
Commerce. Reading all nine runs of the `commerce-query` prompt afterwards:
**every single first attempt was the correct query** — nine of nine, byte
identical — and Claude had assembled the right endpoint AND the right headers by
hand before the tool existed. It never lacked knowledge. What the tool added was
an `endpoint` enum, and when it rejected the agent's correct reading
("catalogService"), the agent **abandoned a query that was already right**, tried
another, introspected the schema, and came back to exactly where it began. We
invented a failure mode that curl did not have. Filed 2026-08-26 as a question,
not a task: it has no "done", it is the test every future tool should pass.

## The evidence

Nine runs. The first tool call, every time:

    { productSearch(phrase: "", page_size: 1) { total_count } }   endpoint: catalogService

| what the tool did | calls |
|---|---|
| no tool yet — hand-written curl | 4–5 |
| refused the endpoint (our bug) | 5 |
| accepted it | **2** |

The middle row is the point. Adding the tool made things WORSE than curl until
the constraint was removed, and it looked like the agent failing to know the
schema. It was the agent recovering from us.

## The rule this suggests

**A tool should remove work, not add vocabulary.** The parts that earned their
keep were the ones the agent could not do cheaply itself: assembling the store
headers, and saving the round trips. The part that cost was the part we invented —
an enum of endpoint names the agent had to guess correctly, where curl only ever
needed a URL.

Every constraint a tool adds is a new way for a correct request to be refused.

## What this does NOT say

It does not say the tool was a mistake. Fixed, it halves the calls. It says the
*abstraction* needed to be smaller than the thing it replaced, and ours started
bigger.

Nor does it generalise from one tool yet. That is why it is a question.

## How to answer it

The battery already measures calls-to-answer per prompt. For any new tool:

1. Record calls-to-answer BEFORE it exists (the agent doing it by hand).
2. Ship it, measure again.
3. **If it did not go down, the tool is not helping — and check whether its own
   arguments are what the agent is getting wrong.**

Two things worth checking against existing tools, since this was found by
accident on the newest one: which of our tools take an enum or a mode the agent
must choose, and whether any of those choices can be inferred instead.

Filed 2026-08-26.

## Shipped so far

- 2026-08-26  docs(backlog): drop AI-1k, file AI-1l — the tool was the obstacle (`a16188edb`)
