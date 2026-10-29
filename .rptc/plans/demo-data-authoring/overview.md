# AI-10 — the demo-data authoring skill

Unattended loop, 2026-10-04 (night 4, stream A). Lane: to the supervised edge. The skill and
its checks are built; running it against a real store is the owner's.

## Staleness check

- "A bulk-safe product write does not exist" — **stale**: `write_commerce_rest` gained `bulk:true`
  (V1/async/bulk, proven on the ACCS sandbox 2026-09-30, logged on the item).
- "Image upload tool" — **moot on the shared sandbox**: the AEM Assets integration refuses
  `products/{sku}/media` (403). Images go to AEM Assets, a separate step. Not built.
- Owner note 3 (2026-10-01): "the 'requires confirm' refusal and an expired Adobe session both
  answer as plain text, so a script read both as success" — **half fixed already**: the confirm
  refusal carried `isError`; every other refusal of `run_commerce_rest`, `write_commerce_rest`
  and `run_commerce_query` (sign-in, bad path, PaaS backend, Commerce 4xx/5xx, network failure)
  did not. **Fixed tonight.**
- Owner note 1 (a read-only visibility check per customer group): `run_commerce_query` already
  takes `customerGroupId`, so the check is a procedure over existing tools, taught by the skill,
  not a new tool.

## Design gate

- **What entity is this?** A generated skill in the project's AI bundle — the established kind
  (`DEMO_BUILDER_ALWAYS_ON_SKILLS`, written by `skillsWriter.ts`). Not a datapack (owner,
  2026-10-01: sharing finished work is the datapack; this is an agent working the store), and not
  a new MCP tool.
- **What owns it?** `src/features/project-creation/templates/skills/author-commerce-data.md`,
  registered in `src/types/ai.ts` and `skillsWriter.ts`, delivered on creation, regenerate and the
  activation sweep through the one writer (hash-and-skip). `AI_CONTEXT_VERSION` 35 → 36 so existing
  projects receive it. The four ai-defaults gate seams are untouched: the skill needs no
  ai-defaults MCP package, only Demo Builder's own tools.
- **Alternatives rejected.**
  - *Conditional on an ACCS backend.* The REST tools already refuse a PaaS backend with the
    reason, and `import-datapack` (the sibling skill) is always-on for the same reason: a new
    gate is a fifth predicate to keep in step for no behaviour gained.
  - *A dedicated "load catalog" tool.* It would hard-code an order of operations Commerce does not
    enforce and the brief varies; the walls are knowledge, and knowledge is a skill.
  - *Folding it into `import-datapack`.* The owner asked for the two purposes kept apart.
- **Product intent left to the owner:** the one-sentence SC prompt ("Build the demo data for
  <brief> on the <website> site; <ERP> owns <lines>") — wording is theirs; the skill accepts any
  brief. Whether the worked Justrite/AccuformNMC load scripts are committed as a fixture: they
  live outside this repo and carry customer names, so not tonight (public repository).

## What was built

1. `asRawTextMarkingErrors` (`src/features/ai/server/mcpToolResult.ts`): an answer starting
   "Error: " carries `isError`. Used by `run_commerce_rest`, `write_commerce_rest`,
   `run_commerce_query`. Tests pin a refusal, a Commerce error and a network failure as errors,
   and a result as not.
2. The `author-commerce-data` skill: plan before writing, the order of operations, the silent
   create failures as rules, bulk loads with the status poll, B2B category grants, the per-group
   visibility table, "Error: wrote nothing", and the undo list. Its own test pins each of those
   against the shipped template, plus that it carries no tenant id or instance host.

## Undo

The skill tells the agent to keep the list of what it created and offer it as the undo list
(DELETE through `write_commerce_rest`, children before parents), and to prefer a datapack —
removable in one call — whenever one fits.

## Owner's live check

In a scratch project on the ACCS sandbox, paste a brief ("five products in one new category, one
configurable with two sizes, visible to guests and one company") and watch the agent follow the
skill: a plan first, bulk create, the category granted to both shared catalogs, and the
per-group check before it reports done.
