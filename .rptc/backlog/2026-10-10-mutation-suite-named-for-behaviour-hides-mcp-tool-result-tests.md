---
id: PL-72
kind: chore
area: platform
needs: []
value: low
status: backlog
---

# The result builders' failure-flag tests sit in a suite a mutation measurement cannot count

Filed 2026-10-10, found while working PL-70 batch MUT-03.

`tests/features/ai/server/toolFailureEnvelope.test.ts` held eleven tests for one
convention (a failed tool call carries `isError: true`) across two modules. MUT-03
moved the five that drive `registerDescriptorTools` into
`toolDescriptors-failureFlag.test.ts`, which took `toolDescriptors.ts` from 8 open
gaps to 0 with no new test for seven of them.

The six that stayed drive `asText` and `asRawText` in
`src/features/ai/server/mcpToolResult.ts`. That module has no suite named for it in
`tests/features/ai/server/`, so a measurement that selects suites by file name
counts none of the six.

Not measured: what `mcpToolResult.ts` scores today, or how much the rename would
move it. It was outside the batch.

## Recommendation

Rename the file to `mcpToolResult-failureFlag.test.ts` and measure the module.
Four documents cite the old name and have to move with it:
`docs/development/handbook.md`, `docs/architecture/adr/023-error-handling.md`,
`docs/systems/mcp-server.md`, and `docs/development/conventions.md`, which is
generated from the handbook by `npm run docs:conventions`.
