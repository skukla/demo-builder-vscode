---
id: PL-56a
kind: feature
area: platform
parent: PL-56
needs: []
value: high
status: backlog
---

# The portable-project contract: one versioned file, and the storefront slice of it

Filed 2026-09-11 (owner decision: one contract, not two). The first item of the program;
[[EDS-13a]], [[EDS-13c]] and the rest of [[PL-56]] build against it.

## What it defines

1. **The project file.** What a project carries when it leaves the builder: everything the
   manifest persists that is not machine-local state, minus secrets unless asked. Today's
   `SettingsFile` (`src/types/settingsFile.ts`) is version 1 and carries roughly a third of
   the manifest (`.rptc/research/project-import-export/research.md`, "What export writes vs
   what a project holds"). This item writes version 2 as a typed shape, a JSON schema beside
   it, and the migration rule the manifest already has (`MANIFEST_FORMAT_VERSION`).
2. **The storefront slice.** The part of that file that describes a storefront (name,
   description, icon, store codes, B2B flags, mesh posture, default block libraries) is the
   same shape a colleague may commit to their repo as the shareable-storefront description
   file, and the same shape a shipped `demo-packages.json` entry has. One definition, three
   places it can live: our catalog, a repo, a project file.
3. **Secrets.** Which fields are secrets (`SECRET_ENV_KEYS` is the register), and the rule
   that any file an SC might send to someone else is secret-free by default.
4. **Names.** The storefront description file's filename (must not collide with the project
   manifest `.demo-builder.json`), the project file's extension, and the words the SC sees
   for each.

## Why first

Both tracks were about to define a storefront description independently. Deciding the
shape once, typed and schema-checked, is the cheapest point to prevent two.

## Done when

The type, the schema, the migration rule and the filenames are in the repo, pinned by
`tests/templates/config-contracts.test.ts` (schema/data) and
`config-interface-contracts.test.ts` (type/JSON agreement), and `docs/` states the
contract for a reader who is not us.
