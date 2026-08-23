# Data Installer — MCP write tools (import / export / validate / reset)

> ## CLOSED 2026-08-23 — shipped: 8 of the 9 named handlers are descriptor-row tools
>
> `DATA_INSTALLER_DESCRIPTORS` (`dataInstallerDescriptors.ts`) carries
> `start_datapack_import`, `validate_datapack_import`, `reset_datapack`,
> `start_datapack_export`, `get_datapack_import_target`,
> `list_datapack_import_scopes`, `get_datapack_import_status`,
> `list_datapack_export_items` — the exact handler types this item listed as
> unexposed. The six reads it named remain as the positive control.
> `delete-datapack` and `async-process-status` stay withheld as intended, with
> the reasoning quoted in `readDescriptors.ts`. The appended "prerequisites has
> no surface" section is also dead (`check_prerequisites` +
> `install_prerequisite` shipped).
>
> **The one-line residue:** `provision-accs-credentials` is still handler-only
> (`importHandlers.ts`) with no descriptor row — expose it or record the
> decision not to, next time this surface is touched.

**Provenance:** scoped 2026-08-16 during phase 4 of `.rptc/plans/ai-surface/`, as a fast-follow.
Phase 4's plan puts `src/features/data-installer/` out of scope ("Stage 2 owns it and another
session owns that feature"), and that exclusion is the largest single hole in the agent surface.
Filed so the exclusion is a scheduled decision rather than a permanent one.

**Status:** not started. Fast-follow to phase 4.

## The asymmetry

Six data-installer READS are exposed and were all optimised in phase 2. Zero writes are.

| Exposed read | After phase 2 |
|---|---|
| `check_datapack_service` | 121 bytes |
| `find_datapacks` | 4,207 (was 10,456) |
| `get_datapack` | small |
| `get_datapack_activity` | 5,709 (was 25,056) |
| `list_datapack_data_types` | 417 |
| `list_installed_datapacks` | 4,055 (was 16,611) |

The unexposed writes, read from the handler maps rather than counted by a regex:

| Handler | Map | What it is |
|---|---|---|
| `start-datapack-import` | `importHandlers` | the actual import |
| `validate-datapack-import` | `importHandlers` | dry-run check before importing |
| `get-datapack-import-status` | `importHandlers` | progress of a running import |
| `get-datapack-import-target` | `importHandlers` | which instance an import would hit |
| `list-datapack-import-scopes` | `importHandlers` | selectable scopes |
| `reset-datapack` | `importHandlers` | undo an import |
| `provision-accs-credentials` | `importHandlers` | mint the credential an import needs |
| `start-datapack-export` | `exportHandlers` | the actual export |
| `list-datapack-export-items` | `exportHandlers` | what an export would contain |

`OPERATION_MODE` is defined as `import | export | delete | validate` and is currently used only
to describe and filter READS — the type says the write surface was always intended.

## What changed, and why now is different

**The credential blocker moved.** Actions were withheld partly because a datapack import needs an
OAuth S2S credential that only exists inside an Adobe I/O project. Develop has since landed the
shared-credential broker (ADR-014, `66da3b9f`/`b076a751`/`6b446d99`), and research established
that **one Commerce credential reaches every instance in its org**
(`.rptc/research/data-installer-credential-home/`). The reason for the exclusion should be
re-tested against that before it is inherited.

## Apply these from day one, not as a later pass

Every one of these came from phase 2 measuring the READ tools against live data. Building the
write tools without them repeats work already paid for:

1. **A page size on every list, defaulting to an agent-sized page.** An agent's first call is
   always `{}`, so the default IS the cost. `get_datapack_activity` returned 100 of 1,099 rows
   (25,056 bytes) for exactly this reason.
2. **No dashboard-only fields.** `art` thumbnails and the repeated `dataTypes` array were 69% of
   `list_installed_datapacks`. A row shipped to a model is not a row shipped to a picker.
3. **Index/detail split.** The list carries identity and a count; the detail call carries the
   payload. Applies directly to `list-datapack-import-scopes` and `list-datapack-export-items`.
4. **Never fabricate an envelope field.** The catalog endpoint sends no `total`, and a
   `?? items.length` fallback made `find_datapacks` answer `total: 20` for a 23-row catalog once
   a page size applied. Omit what the service does not give.
5. **A recorded ceiling per tool** in `tests/features/ai/server/responseCeilings.ts`, with the
   REASON. The table asserts its own coverage, so a new tool without one fails the suite.
6. **Progress that is pollable, not streamed.** `start-datapack-import` is long-running; the
   webview learns via `sendMessage`. An MCP tool must return a job handle and let
   `get-datapack-import-status` be called, or it returns a dispatch rather than an outcome.

## The disqualifier to check first

Phase 4's standing bar: **does the return value carry the OUTCOME, or only the DISPATCH?** Several
of these handlers push their result through `context.sendMessage` and return a bare
`{success: true}` — measured on the EDS equivalents (`handleGetGitHubRepos`,
`handleCheckGitHubAuth`), which do exactly that. Exposing one unchanged hands an agent a tool that
cannot fail and carries no answer. Read each handler before assuming it qualifies; the fix is
usually to return the payload it already computed, which is a change to the handler, not the tool.

## Safety — the reason for the original exclusion, unchanged

- The datapack catalog is **shared infrastructure**: 23 shared entries other teams depend on.
- `delete-datapack` **cascades**, there is no undo, and there is no visible ownership guard.
- Datapack AUTHORING (create/update/delete datapack, add/update/delete data item, promote version)
  stays behind UI actions with a named-target confirm. **This item is about import/export/validate/
  reset against an instance — not about editing the catalog.**
- Withheld deliberately elsewhere and still withheld: `DELETE get-installed-datapacks`, whose only
  effect is to make the tracking lie, and `async-process-status`, which reports `in_progress` for
  jobs that finished hours ago.

## A measurement caveat that affects scoping

`ai-coverage-scan` reported 31 unexposed data-installer handler types. **That number is wrong.**
Its extractor matches handler keys by regex across a whole file and catches nested object keys —
`auth: context.authManager`, and `success`/`data`/`context`/`error` inside handler bodies. Reading
the three maps directly gives **9 real unexposed handlers**, plus four names
(`missing-paas-admin`, `needs-accs-credentials`, `no-credential-service`, `unsupported-backend`)
that are keys in a `CREDENTIAL_MESSAGES` lookup, not handlers at all.

A depth-aware parser written to check this ALSO failed its own control, so the accurate count came
from reading the maps. Do not size this work from the scan; the scan's own SKILL.md says "the
count is only as good as the two regexes", and this is that limit biting. **Fixing the extractor
is worth its own item** — the same inflation applies to every other map it reports.

## Kickoff prompt

> Read `.rptc/plans/ai-surface/overview.md` and `phase-2-response-quality.md` first — phase 2
> measured every read tool against live data and the optimisations in this item are its findings,
> not suggestions. Then read the nine handlers named above IN FULL before designing anything: the
> question that decides whether each can be a tool is whether its return value carries the outcome
> or only the dispatch. Start with `validate-datapack-import`, which is the safest (a dry run) and
> establishes the response shape the others follow.

---

# Related: prerequisites has no agent surface at all

Filed alongside the above, from the same phase-4 pass. Not data-installer work, but the same
shape of gap and too small for its own file.

`prerequisites` is the only feature with **zero** MCP tools and **zero** skills. Its three
handlers (`check-prerequisites`, `continue-prerequisites`, `install-prerequisite`) are all
disqualified as written: `handleCheckPrerequisites` streams each result through
`context.sendMessage('prerequisite-status', …)` and stores the outcome in `context.sharedState`,
returning a bare status. Headless it does all the real work, sends every result into a no-op,
discards the state, and returns `{success:true}`.

"Is this machine set up to build a demo?" is a fair question for an agent, and today it cannot
ask it. The answer is a NEW headless read over the same check services — not exposing the
streaming handler. Scope it as one read (`check_prerequisites`) returning per-prerequisite
`{name, required, installed, version, problem?}`; leave installation behind the UI, since
`install-prerequisite` runs package managers.
