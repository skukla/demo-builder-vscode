# Step 01 — Pack-authoring operations on the client

**Gated on:** nothing. Start here.

## Goal

Five service operations reach `src/` for the first time: `create-datapack`,
`add-data-item`, `update-data-item`, `delete-data-item`, and version `promote`. No
handlers, no tools, no UI — the containment layer only.

## Where they go, and why not on the read client

`DataInstallerWriteClient` (`services/dataInstallerWriteClient.ts`). Its own doc comment
sets the rule: **two classes because "do we have credentials yet?" is a type question the
compiler answers.** Pack authoring is a write, so it goes on the write client even though
some of these calls touch no Commerce instance.

There is one honest tension. `create-datapack` and the data-item operations need only the
IMS bearer — no Commerce credentials at all — so putting them on the credentialed class
demands something they do not use. Resolve it by **not** widening `ExportRequest` /
`ImportRequest`: give the new methods their own narrow request types that carry no
`credentials` field. The class is the home; the method signatures stay honest about what
each call needs. Do not add a third client — that is where the two-endpoint sprawl starts.

## The operations

| Method | Action | Notes |
|---|---|---|
| `createDatapack` | `create-datapack` | `datapack_name`, `display_name`, `owner`, `description`, `version`, `shared`. Duplicate `(name, version)` → **409**; surface that as a distinct outcome, not a generic API error |
| `addDataItem` | `add-data-item` | create-only; proven working on the shared deployment |
| `updateDataItem` | `update-data-item` | upsert |
| `deleteDataItem` | `delete-data-item` | single row |
| `promoteVersion` | `POST /datapacks/{name}/promote` | the atomic commit — note the **path parameter**, which `actionUrl` already supports (`dataInstallerConfig.ts:116`, 4th arg) |

## Contract rules to honour

- **Never fabricate an envelope field.** The catalog endpoint sends no `total`, and a
  `?? items.length` fallback once made `find_datapacks` answer `total: 20` for a 23-row
  catalog. Omit what the service does not give.
- **409 is a verdict, not a failure.** A duplicate `(name, version)` is the service telling
  the caller the pack identity is taken. Parse it into a typed outcome the way a failed
  export is `success: true` with reasons — an agent that gets a thrown error cannot tell
  "already exists" from "service down".
- **Pass identifiers through untouched.** No derivation, no formatting. The write client's
  existing comment on `commerceInstance` says why.
- **No `vscode` import.** Injected `fetchImpl` and token provider, like its siblings.

## Parsers

New parsers in `dataInstallerParsers.ts` beside the existing thirteen, following their
shape: take `unknown`, return the domain type, never trust a field's presence.

- `parseDatapackCreated` — the created pack's identity + whether it was a 409
- `parseDataItemWrite` — the per-row write outcome
- `parsePromoteOutcome` — resulting version state

Types go in `types.ts` next to `DatapackId` / `DataItem`, which already exist and should be
reused rather than re-declared.

## Tests

`tests/features/data-installer/services/` — the suite already has the fixture conventions.

1. Each method builds the request body the service documents. **Assert the argument**, not
   just the outcome: a mock cannot see a malformed call, and this feature has four shipped
   bugs proving it.
2. 409 on `createDatapack` produces the duplicate outcome, not a throw.
3. A response missing an optional field does not invent one.
4. `promoteVersion` puts the pack name in the **path**, not the body.
5. Non-2xx with a service message surfaces that message, per `DataInstallerApiError`.

## Definition of done

- Five methods, five parsers, narrow request types with no unused `credentials`.
- `gate` green (invoke the skill — do not hand-run its commands).
- Nothing else in `src/` references the new methods yet. That is step 02.
