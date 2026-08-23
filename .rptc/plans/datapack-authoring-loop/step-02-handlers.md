# Step 02 — Handlers for the authoring operations

**Gated on:** step 01.

## Goal

Reach the five client methods through the handler layer, so both the webview and (next
step) the MCP surface dispatch into one place.

## Where

A new `authoringHandlers` map in `src/features/data-installer/handlers/`, merged into the
feature's exported map the way `exportHandlers` already is — that file's own comment
records why it is separate: **the import spine was already at its size limit.** Same
reasoning applies again; do not grow `importHandlers`.

## The standing bar — read this before writing any handler

Phase 4 of the AI-surface work established a disqualifier that is not in
`mcp-tool-authoring`: **does the return value carry the OUTCOME, or only the DISPATCH?**
Several handlers in this repo push their result through `context.sendMessage` and return a
bare `{success: true}`. Exposed as a tool, that hands an agent something that cannot fail
and answers nothing.

Every handler in this step must return its payload. None of these operations is
long-running, so none of them has an excuse to be fire-and-forget.

## Handlers

| Message type | Calls | Guard |
|---|---|---|
| `create-datapack` | `createDatapack` | name + version + owner required; `shared` defaults **false** |
| `add-datapack-item` | `addDataItem` | pack id + dataType + row |
| `update-datapack-item` | `updateDataItem` | as above |
| `delete-datapack-item` | `deleteDataItem` | as above, plus confirm |
| `promote-datapack-version` | `promoteVersion` | pack id + version |

## Guards

`prepareExport` in `exportHandlers.ts` is the model: refuse a half-named target **before**
the request goes out, because the catalog is shared infrastructure and the service will not
stop a pack written under the wrong name.

Two rules specific to authoring:

1. **`shared` defaults to `false` and an agent cannot set it true.** Nothing in this loop
   needs to publish into the shared catalog, and the whole point of the private-pack model
   is that publishing your own version never touches the packs other teams read. If a
   shared pack is ever wanted, that is a deliberate UI action with a named-target confirm —
   not a boolean an agent can flip.
2. **Deleting a row needs the same seriousness as `reset_datapack`.** There is no undo.

These handlers need only the IMS bearer, so they use `resolveDataInstallerAccess` and
**must not** call `resolveProjectCredentials` — requiring Commerce credentials for a pack
edit would block exactly the users this loop is for.

## Tests

- Each guard refuses its own bad input with a message naming what is missing.
- `shared: true` from a payload is ignored or refused — pin it, because this is a policy
  the compiler will not keep.
- A handler returns the client's payload rather than a bare success.
- No handler reaches for Commerce credentials.

## Definition of done

- Five handlers, merged into the feature map, each returning an outcome.
- `gate` green.
