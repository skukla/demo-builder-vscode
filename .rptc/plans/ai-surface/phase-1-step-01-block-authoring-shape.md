# Phase 1 · Step 01 — `get_block_authoring_shape`

**The highest-ROI single item in the program**, and the smallest. Ships first, alone, because it
is independent of the six content tools and validates the seam they will use.

## What it replaces

A subagent spent **~121,000 tokens** deriving eight blocks' authoring shapes by reading their JS
during the Bodea build. The answer was already sitting in `component-definition.json`, in a field
the promote flow writes on every promotion and no tool reads back.

## The field — CORRECTED against real data

This plan originally named one field, `plugins.da.unsafeHTML`, on the strength of it being what
the promote flow writes. **Measured against the real `bodea-template-test` storefront, only 4 of
78 components carry it.** An implementation built on that assumption would have failed on 74
blocks — and its fixtures passed, because a made-up shape is still valid JSON. `typecheck:tests`
cannot catch this class of error; only real data can.

`plugins.da` is present on **78 of 78** components, and carries one of three conventions:

| Convention | Keys | Real count |
|---|---|---|
| Positional table | `rows`, `columns` | 36 |
| Key-value cells | `name`, `type`, `fields[{name, selector}]` | 35 |
| Literal markup | `unsafeHTML` | 4 |
| Declares nothing | — | 3 |

**Which convention a block uses is itself the answer** an agent needs, so the index reports it.

Two sibling files complete the picture, and neither is optional in practice:

- `component-filters.json` — what may nest inside. `cards` reports two columns; its real content is
  `card` children. Without this an agent authors flat cells and the block renders empty.
- `component-models.json` — the field names/labels. Best-effort: 38 of 78 components resolve no
  model fields (27 name a model id with no entry, 11 name none), which is normal, not an error.

## Shape

`get_block_authoring_shape(projectName, blockName?)`

Mirrors the house pattern already set by `get_block_source`: **omit the narrow argument to get a
cheap index, pass it to get the payload.**

| Call | Returns |
|---|---|
| `blockName` omitted | `{ blocks: [{id, title, authoring: 'table'\|'fields'\|'html'\|'none'}] }` |
| `blockName` given | `{ id, title, description?, authoring, childComponents?, fields? }` |

## Measured on real data, not estimated

| | |
|---|---|
| Index, whole 78-block catalog | 5,577 bytes ≈ 1,400 tokens |
| `cards` detail | **92 bytes** |
| `accordion` detail | 129 bytes |
| `card` detail (both conventions + model) | 432 bytes |

The plan's "~200 tokens against ~121,000" claim holds, with room to spare.

## Why the index half is not scope creep

`list_blocks` lists `blocks/` **source directories**. That is a different set from what is
registered in the authoring library — a block can exist on disk and never be promoted, which is
exactly the state every un-promoted block is in. Without the index, an agent has no way to learn
which ids this tool accepts, and would guess from `list_blocks` and get errors. The index answers
"what can I author with", which is the actual question.

## Errors

| Case | Behaviour |
|---|---|
| No EDS storefront | throws — reuses `resolveStorefrontPath`'s existing message |
| `component-definition.json` missing/unparseable | throws, naming the file |
| Block not registered | throws, and **names `get_block_source` as the next step** — the block may exist on disk unregistered, which is a different problem than a typo |
| Model/filter file absent or id unmatched | **not an error** — the fields/children keys are simply omitted |

Read-only, no confirm gate, no auth. Pure filesystem read inside the project root, so it goes in
`mcp-server.ts` beside `get_block_source` rather than in `features/ai/server/` (which is where the
extension-context tools that need DA.live auth live).

## Traps this step must respect

- **Path containment**: reuse `assertInsideProject` exactly as `getBlockSource` does. The
  storefront path comes from the manifest, which is user-writable.
- The registry is **groups[]-nested** — a flat `components[]` scan misses entries. Measured: **76
  of 78** real components live outside group 0, so that mistake hides almost the whole catalog.
  Both existing writers iterate groups; so must this.
- **Never build a fixture for this file from the promote flow's output.** Promotion writes the
  rarest of the three conventions. Copy fixtures from a real storefront.

## Done when

An agent can ask for a block's authoring markup and get it in ~200 tokens, and can discover which
ids are valid without reading a single block's source.
