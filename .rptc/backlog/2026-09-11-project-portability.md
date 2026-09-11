---
id: PL-56
kind: epic
area: platform
parent: EDS-13
needs: []
value: high
status: planned
---

# Project portability: export, import and copy carry the whole project

Filed 2026-09-11 by the owner as the second track of [[EDS-13]]: the builder can export and
import a project's settings and copy a project, and that capability "has grown horridly
stale". Measured the same day: `.rptc/research/project-import-export/research.md`.

## What is wrong, in one paragraph

The settings file was designed in December 2025 to reuse component config values between
creations. The project has since grown a title, a Commerce instance, a datapack, App
Builder integrations with deploy state, block libraries, an EDS storefront with its own
state, and AI files, and the file carries almost none of it. Import then creates the new
project with integrations and mesh hardcoded empty whatever the file said, asserts GitHub
and DA.live are signed in, and ignores custom integration sources and API picks. The
format has one version number that has never changed and no migration. Both dashboard
export doors write secrets unconditionally. Edit mode is fed by the same serializer, so
every field export drops is a field Edit can delete.

## Children (filed 2026-09-11, in run order after the contract)

| Item | Kind | What |
|---|---|---|
| [[PL-56a]] | feature | The contract: v2 file, the travels/local split, no credentials in the file, names, migration |
| [[PL-56b]] | chore | Delete what is already dead (runs first, independent) |
| [[PL-56c]] | feature | Export carries the whole project, never a credential |
| [[PL-56d]] | fix | Import creates what the file says, re-proves sign-ins, tells the SC what it did |
| [[PL-56e]] | fix | Copy and Edit read the same complete file |
| [[PL-56f]] | feature | Agent tools for import and copy |
| [[PL-56g]] | chore | A feature page |

Decided 2026-09-11 (owner): everything can travel; stale context is re-proven through the
existing prompts before anything continues; credentials stay in VS Code SecretStorage and
the design keeps using it.

## Relationship to the shared-storefront track

A shared storefront is a piece of a project. The description file [[EDS-13c]] defines
must be the same slice of the project file this track defines, or the builder ends up with
two ways to describe one storefront. That is why both sit under one program.
