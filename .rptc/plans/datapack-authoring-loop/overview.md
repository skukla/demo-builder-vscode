# Datapack authoring loop — export, modify, publish your own

**Activated:** 2026-08-23 from [`../../backlog/2026-08-23-datapack-authoring-loop.md`](../../backlog/2026-08-23-datapack-authoring-loop.md),
which stays as the filed record. This file is the design; the step files are the work.

**Branch:** `claude/datapack-authoring-loop` (off `develop`). A peer session owns
`develop` — land through them, never push it from here.

---

## Why

A user in a Demo Builder project should be able to, through the skills already in that
project: **export a datapack, change its data to fit his use case, and publish his own
version of it.** The agent should recognise that a series of edits belong to one pack, and
where the job spans several tools or MCPs, the demo-builder MCP supplies the orchestration
skill — which appears in the skills modal automatically.

Today an SC who wants a variant of a shared pack has no path that ends in a pack. He can
edit a live instance, and that is where it stops: the edit lives on one instance, dies with
the next reset, and cannot be handed to anyone.

---

## What already exists — measured on `develop`, 2026-08-23

More is built than the backlog item assumed, and the shape of what is missing is narrow.

**The whole read half of pack editing is already shipped.** `dataInstallerClient.ts`:

| Method | Line | What it gives the loop |
|---|---|---|
| `getDataItem` | 165 | one row of one data type out of a pack |
| `batchGetDataItems` | 178 | **the source rows to edit** — Route B's input |
| `getExportDataTypes` | 202 | what the service can capture |
| `getProcessorOrder` | 212 | the ordering export does NOT do for you |

**The instance half is shipped and verified live.** `dataInstallerWriteClient.ts` carries
`listExportItems` (206), `startExport` (240), `checkCredentials` (264), `validateImport`
(300), `startImport` (314), `startDelete` (345).

**Eight MCP tools shipped 2026-08-17** in `e187cada`
(`src/features/ai/server/dataInstallerDescriptors.ts`): the four target/scope/status/
export-list reads plus `validate_datapack_import`, `start_datapack_import`,
`reset_datapack`, `start_datapack_export`.

**The generated `import-datapack` skill already teaches the capture direction** — 156 lines
at `src/features/project-creation/templates/skills/import-datapack.md`, including the two
traps worth keeping: export is **not** ordered by the service (ask `get-processor-order`
with `operationMode: "export"`), and re-exporting a data type **rewrites** it in the pack
rather than appending.

**Skills surface themselves.** `inspectSkills` walks `.claude/skills/` and classifies what
it finds (`src/features/ai/skillInspector.ts`, exported at `src/features/ai/index.ts:18`),
so a new generated skill needs no modal wiring.

### What is missing — the actual work

Five service operations have **zero occurrences anywhere in `src/`** (verified by
`git grep`, control-checked against a term known present):

`create-datapack` · `add-data-item` · `update-data-item` · `delete-data-item` · `promote`

That is the gap. Everything else the loop needs is standing.

---

## Two routes, and why we build the one that works

| | Route A — instance-first | Route B — pack-first |
|---|---|---|
| Shape | edit the instance (Admin/API) → selective export of changed types | `batchGetDataItems` the source rows → write edited rows into a private pack → import to verify |
| Good for | broad capture, anything the API cannot reach | surgical, known edits |
| Status | **blocked** — export's store step 500s | **works today** on the shared deployment |

Route A is blocked by one thing, measured and re-confirmed: the export processor fetches
instance data correctly and then fails to store it, because the shared deployment's export
path has no database address (`docs/systems/data-installer.md` §6b; re-confirmed live
2026-08-23 against a Bodea instance whose custom customer groups cleared the exclusions at
`excluded: 0`). It is the service's own secret; the extension neither holds nor sends it.

**So Route B is the plan.** `add-data-item` is proven working on the same deployment — the
gap is specific to the export processors' bulk store path, not to writes in general.

**Do not ship skill guidance for Route A until an export actually succeeds.** A skill that
confidently walks a user into a 500 is worse than no skill (the third-party-tooling item's
rule). Step 04 marks Route A gated inside the skill text.

---

## The atomicity model — already correct, needs naming not building

The service supplies the semantics; the skill's job is to teach them.

- **A pack identity is `(datapack_name, version)`** and versions of one name coexist by
  design. A duplicate pair is a 409, not an overwrite.
- **`shared: false` on `create-datapack`** makes the pack the user's own. This is why the
  acceptance test targets a private `bodea-differentiated` and never a new version of the
  shared `bodea` — no shared-registry pollution, and the `confirmName` tension disappears.
- **Item edits accumulate on a working version; `promote` is the commit.** That is what
  "recognise atomic updates to the same pack" means in practice — the agent keeps writing
  rows against one working version and promotes once, rather than minting a version per
  edit.

---

## The architecture constraint, and why it does not block this plan

The backlog item records a binding constraint from the user: **there must be ONE pack
registry.** Packs live in the database, so a second deployment is a second registry and the
org's packs diverge. Three shapes are on the table (adopt the existing deployment; full
cutover onto App Builder Database; partition), and the choice is organisational.

**None of that gates Route B.** Every client here reads its endpoint from
`demoBuilder.dataInstaller.apiBaseUrl`. Whichever shape wins changes a setting, not this
code. Build against the endpoint that is configured; the decision reroutes it later.

The one thing to avoid is baking the current deployment's identity into anything — no
hard-coded base URL, no assumption that a pack id is globally unique across registries.

---

## Sequence

| Step | What | Gated on |
|---|---|---|
| [01](step-01-pack-authoring-client.md) | Five pack-authoring operations on the write client, with parsers and types | nothing |
| [02](step-02-handlers.md) | Headless handlers returning outcomes, not dispatches | 01 |
| [03](step-03-mcp-tools.md) | Descriptor rows, confirm gates, response ceilings | 02 |
| [04](step-04-orchestration-skill.md) | The generated orchestration skill; `AI_CONTEXT_VERSION` 18 → 19 | 03 |
| [05](step-05-bodea-acceptance.md) | The Bodea round trip, live | 04 |

Steps 01–04 are buildable now. Step 05 is the proof.

---

## Traps carried forward

- **A cast at a call boundary is a silenced type error.** This feature's own history is the
  evidence: `stackBackend` reached the import handler as `''` for every real project and
  twelve tests agreed. Build the object the callee declares.
- **A mock cannot see a malformed call.** Where the thing under test is *how* the client is
  invoked, assert the argument or drive the real collaborator with `jest.requireActual`.
- **Never send `MONGO_URI`.** The service's own error text invites callers to pass it "in
  params". It is the service's secret, we do not hold it, and a database URI has no place
  in a request body. `buildExportBody` already carries that as a comment.
- **Redact before committing.** This repo is public and `.rptc/` is tracked: no colleague
  names, no internal endpoints, no live record ids in any writeup this plan produces.
  That rule is now enforced by `tests/sop/no-colleague-names.test.ts`, which matches
  attribution constructions rather than names (a denylist of real names in a public repo
  would publish what it protects).
