# Step 03 — MCP tools for the authoring operations

**Gated on:** step 02. **Invoke the `mcp-tool-authoring` skill** — do not reproduce its
steps from memory.

## Goal

The five handlers become descriptor rows in
`src/features/ai/server/dataInstallerDescriptors.ts`, beside the eight that shipped
2026-08-17.

## Proposed rows

| Tool | Type | Gate |
|---|---|---|
| `create_datapack` | `create-datapack` | none — creating an empty private pack is cheap and reversible |
| `add_datapack_item` | `add-datapack-item` | none |
| `update_datapack_item` | `update-datapack-item` | none |
| `delete_datapack_item` | `delete-datapack-item` | `confirm: true` |
| `promote_datapack_version` | `promote-datapack-version` | `confirm: true` — this is the commit |

Read `reset_datapack`'s existing row before writing the gated ones: it is gated **twice**
(row-level and handler-level) and the comment explains why that is agreement rather than
redundancy.

## Apply the phase-2 findings from day one

These came from measuring the shipped read tools against live data. Building without them
repeats work already paid for.

1. **A page size on every list, defaulting to an agent-sized page.** An agent's first call
   is always `{}`, so the default *is* the cost.
2. **No dashboard-only fields.** `art` thumbnails and a repeated `dataTypes` array were 69%
   of `list_installed_datapacks`. A row shipped to a model is not a row shipped to a picker.
3. **Index/detail split.** The list carries identity and a count; detail carries payload.
4. **Never fabricate an envelope field.**
5. **A recorded ceiling per tool** in `tests/features/ai/server/responseCeilings.ts`, with
   the reason. The table asserts its own coverage, so a new tool without one fails the suite.

## The schema trap this exact file has already hit

When `list_datapack_export_items` shipped, its schema omitted `dataTypes` and a raw zod
default filled the gap, so **the tool was uncallable** — every call came back "Select at
least one data type to export." The schema was inviting agents to omit the argument that
had been made mandatory for safety.

So: **every field the handler guard requires must be required in the input schema.** After
wiring, prove each tool with the `mcp-live-probe` skill rather than against its own
fixtures — that is the whole point of the skill existing.

## Tests

- The descriptor-count pins move; update them deliberately, not by pasting the new number.
- Each new tool has a ceiling row with a stated reason.
- The gated tools refuse without `confirm`.
- A schema round-trip proves no required-by-guard field is optional in the schema.

## Definition of done

- Five rows, five ceilings, count pins updated.
- Each tool probed live via `mcp-live-probe`, with the serving build recorded.
- `docs/systems/mcp-server.md` updated in the same commit — the skill requires that sync.
- `gate` green.
