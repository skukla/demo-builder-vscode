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
