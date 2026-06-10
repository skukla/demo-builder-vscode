# Step 05 — Config Flips (`demo-packages.json`, `block-libraries.json`)

**Repo:** `skukla/demo-builder-vscode`
**Depends on:** Steps 2 & 4 (engine + pipeline + LKG ready) AND Steps 6 & 7 (patch ledger + gate ready in the
patches repo). **Blocks:** Step 9 (cutover). **This is the cutover trigger.**
**Status:** proposed (no code yet)

## Objective

Flip the two config pointers that currently aim at `skukla/citisignal-eds-boilerplate` — the template and the
block source — to canonical and the demo team's boilerplate, and wire the new code-patch + LKG source fields.
**This step is what actually retires the fork as a template; do not land it until Steps 2, 4, 6, 7 are ready and
the teaser fixes exist as day-one patches (Step 6).**

## Scope / files

### `src/features/project-creation/config/demo-packages.json` (CitiSignal entries ~`:277–348`)

| Field | Today | After |
|---|---|---|
| `source.url` / `templateOwner` / `templateRepo` | `skukla/citisignal-eds-boilerplate` | `hlxsites/aem-boilerplate-commerce` — **mirror the `custom` package shape** (~`:109–133`) |
| `contentSource` | `demo-system-stores/accs-citisignal` | **Unchanged** (DA.live content site, not the fork) |
| `contentPatches` / `contentPatchSource` | present | unchanged; gains a **sibling code-patch source** |
| **new:** `codePatches` / `codePatchSource` | — | the patch ID list + `{owner, repo, path}` for the patches repo |
| **new:** LKG source | — | where to read `last-known-good` (per Q2/Q3; likely same patches repo) |

Apply to both CitiSignal EDS storefronts (PaaS + ACCS).

### `src/features/project-creation/config/block-libraries.json` (`demo-team-blocks` ~`:5–21`)

| Field | Today | After |
|---|---|---|
| `source` | `skukla/citisignal-eds-boilerplate@main` | `demo-system-stores/accs-citisignal@main` |
| `nativeForPackages` | `["citisignal"]` | unchanged |
| `contentSource` | `demo-system-stores/accs-citisignal` | unchanged |

**Zero installer changes** — block discovery is dynamic and dedups against destination (verified in
`blockCollectionHelpers`), so only net-new demo-team blocks install.

## Approach (to detail in TDD after approval)

1. Update `src/types/demoPackages.ts` if needed so `codePatches`/`codePatchSource` are typed on the package
   storefront config (sibling of the existing content-patch fields).
2. Edit the two JSON files. Mirror the `custom` package exactly for the template fields.
3. Confirm `getTemplateSource()` now returns canonical for CitiSignal (it just reads metadata, which now derives
   from canonical).

## Sequencing constraint (Risk R1 — hard)

Both pointers flip in this step **before** archival (Step 9). The block-source flip carries the two product-teaser
fixes as **day-one code patches** (authored in Step 6, applied post-install in Step 2), so it does **not** wait on
the demo team's PR review. After this step, nothing the extension ships should reference
`skukla/citisignal-eds-boilerplate`.

## Risks (this step)

- **R1:** flipping config before the patch ledger/gate are ready would ship broken creates. Hence the dependency
  on Steps 6–7. A pre-merge check (and Step 9 gate) greps the repo + project metadata for the old fork name.
- **Existing projects:** projects created on the old fork still carry fork metadata; their reset behavior is
  handled in Step 9 (migration), not here.

## Test / verification

- Schema/shape tests: CitiSignal mirrors `custom` for template fields; `contentSource` unchanged; new fields
  parse; `demo-team-blocks.source` resolves to the demo-team repo.
- Integration (with Steps 2/4): a CitiSignal create from this config produces a canonical@LKG storefront with the
  9 demo-team blocks installed and the patch ledger applied.

## Exit criteria

- Both config files point at canonical / demo-team; a full create succeeds end-to-end against the new config in a
  test harness; no extension config references the old fork.
