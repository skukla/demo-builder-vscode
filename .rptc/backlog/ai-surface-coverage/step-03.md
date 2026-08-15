# Step 03 — Expose the qualifying READ tools

**Kind:** TDD
**Depends on:** step 02
**Touches:** `src/features/ai/server/readDescriptors.ts`, its suite,
`docs/systems/mcp-server.md`

## Goal

Turn every `expose:read` disposition into a descriptor row. Reads first and separately from
actions: they cannot damage anything, so they can land and be judged on their own.

## RED

For each new tool, in `tests/features/ai/server/readDescriptors.test.ts`:

- The row exists, targets the right map and message type.
- Its `inputSchema` rejects a malformed call (validation is at the tool-call layer, so the
  model retries — but assert it, because the handler is ALSO reachable from a webview and
  must validate independently).
- **The read performs no writes.** Where the handler could create-on-miss, assert with a
  mock that the creating path is not called. This is the `list_console_apis` rule: it
  derives `managed` flags from the persisted union rather than probing the live credential,
  specifically so a read stays a read.

Also update the coverage test from step 01: these handlers move from excluded to exposed,
and it should fail until they do.

## GREEN

Add rows to `READ_DESCRIPTORS`. Each is roughly:

```ts
{
    tool: 'snake_case_name',
    description: 'One line saying WHEN to use it',
    map: someHandlers,
    type: 'message-type',
    inputSchema: { … },   // zod shape, when it takes arguments
}
```

Registration is already wired — `extension.ts` spreads
`[...READ_DESCRIPTORS, ...ACTION_DESCRIPTORS]` into `registerDescriptorTools`. Nothing new
to wire.

## Naming — this is the agent's search surface

Under deferred tool loading the harness ranks on NAME and the one-line description, so:

- short `snake_case`, verb-first for actions, noun-first for reads;
- the description says **when** to reach for it, not what it returns;
- distinct from every existing name — check against the 58 before choosing.

## Done when

- Each `expose:read` handler has a row and a test.
- Coverage test shows them exposed; no unreviewed entries reappear.
- `docs/systems/mcp-server.md` descriptor list updated.
- `gate` green.

## Notes

- No `AI_CONTEXT_VERSION` bump: tools ship in the bundle, not in generated project files.
  Only steps 05–07 touch generated content.
- If a handler turns out to need arguments the webview supplies implicitly (a panel-held
  selection, say), that is a step-02 misclassification. Send it back to `never:panel` with
  the reason rather than inventing a parameter to paper over it.
