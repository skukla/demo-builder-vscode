# Step 02 — Rename the "Custom" brand to "Starter"

Item: [[EDS-13a]]. Decision: D8. Depends on nothing.

**Reuse:** section C of `../portable-demos/reuse-map.md` lists every existing thing this step is built from and how (use as is / add to it / make it shared / build new). A new file, hook, shape or word not in that section names the row it replaces and why.

## What exists

`demo-packages.json:86` package `id: "custom"`, name "Custom (B2B + B2C)"; the loader's
rename map `RENAMED_PACKAGE_IDS` (`projectFileLoader.ts:22`, already maps `b2b` → `custom`);
pins in `demo-packages-data.test.ts:112` (exact id set) and `manifest-mirrors.test.ts`.

## Design

Rename display name to "Starter (B2B + B2C)" with a description that says what it is
("Adobe's B2B boilerplate with no brand. Build a demo from scratch."). Move the id too,
through the rename map (a name that no longer matches its id is the soft-deprecation the
repo forbids); existing projects load through the map exactly as `b2b` projects do today.
Grep every literal `'custom'` that means the PACKAGE (not the integration kind
`'custom'` in `flowStages.ts:16`, which is unrelated) before deciding the id spelling.

## Tests first

The id-set pin and the rename-map test move together; a project manifest with the old id
loads with the new one.

## Built (2026-09-12)

The id moved with the name, as the owner asked: `custom` → `starter`, "Custom (B2B + B2C)"
→ "Starter (B2B + B2C)", with a description that says what it is. The rename map gained
`custom → starter` and `b2b` now points straight at `starter`: the map is a flat table,
every retired id names the current one, so a rename never needs a second lookup (a test
pins that). Existing projects load through the map exactly as `b2b` projects do today.

Also moved: the storefront `tags` and the block library that is default for the package, the tests that name the real package,
the wizard-hook fixture that stood in for it, ADR-009's statement of the current id, the
dropin-vendoring skill's id history, and a changelog line. `docs/CHANGELOG.md` history is
untouched. `'custom'` as an INTEGRATION kind (`flowStages.ts`) is a different word and stays.

**The package icon is gone** (owner, 2026-09-12: "We don't need a package icon"). No code
read it. Removed from the type, the closed schema, every catalog entry, the shared-demo
slice, the resolver, and the Share dialog's design (no icon, no picker). The storefront-level
`icon` field is in the same state — declared, set on every entry, read by nothing — and is
left for the owner to call.

Not in scope here, noted for the import step (PL-56d): `readProjectFile` does not run the
rename map, so an exported project file carrying `selectedPackage: "custom"` must be
normalised where import reads it, as the manifest loader does.
