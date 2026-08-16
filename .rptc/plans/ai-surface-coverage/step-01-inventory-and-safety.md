# Step 01 — Inventory and safety classification

**Kind:** analysis. No production code; output is a table later steps consume.

## Why safety first

The classification decides the METHOD, so it has to exist before any capture runs. Calling a
`delete_*` tool to see what it returns destroys a project. The harness in step 02 is gated on
this table's allowlist column.

## Method

1. Enumerate from source (all registration forms) — cheap, works without a running extension.
2. Reconcile against `probeInExtensionMcpTools` when an extension host is available; that is
   ground truth for what the agent sees. Record any difference rather than silently preferring
   one — a difference is itself a finding (a tool registered but not exposed, or vice versa).
3. Classify each tool:

| Class | Test | Capture method |
|---|---|---|
| `read` | no state change; safe to call repeatedly | live |
| `mutate` | changes project or cloud state, reversibly | live on a scratch project only |
| `destroy` | irreversible or removes remote resources | **static only — never called** |

4. Record the handler behind each tool (`map` + `type` for descriptor rows, or the file for
   directly-registered tools), since step 04 derives shapes from the handler's return.

## Output

`.rptc/plans/ai-surface-coverage/tool-inventory.md` — one row per tool:

| tool | class | source | handler | notes |

## Done when

Every tool from the source sweep has a row with a class, and the `destroy` set is explicitly
listed so step 02's allowlist can be derived from it rather than hand-written.
