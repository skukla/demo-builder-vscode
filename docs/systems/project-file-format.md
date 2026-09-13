# The project file, and the shared-demo file

Two files let a demo leave the machine it was built on. Both are plain JSON, both are
versioned, and neither ever carries a credential.

| File | Name | Lives | Written by | Read by |
|---|---|---|---|---|
| Project file | `<project-name>.project.demo-builder.json` | wherever the SC saves it | Export (projects dashboard; the `export_project_settings` tool) | Import from File, Copy from Existing |
| Shared-demo file | `demo.demo-builder.json` | the root of a storefront repository | "Share this demo", or a colleague by hand | "Add a demo" |

They are one family with the project manifest, `.demo-builder.json`, which stays in the
project folder and never leaves the machine. The kind is spelled out before the shared
suffix, and each file also carries a `kind` field (`project` or `demo`) so a reader can tell
what it was handed regardless of the name.

The types are in `src/types/projectFile.ts`. The schemas beside the manifest's, in
`src/core/state/config/`, are generated from those types by
`scripts/generate-manifest-schema.js` and kept fresh by
`tests/templates/manifest-schema-freshness.test.ts`, so the schema cannot drift from the
type and the committed schema cannot drift from the generator.

## What a project file carries

Everything the manifest persists that describes the demo rather than the machine:

- the project's title and slug, and where the file came from (source project, extension
  version, and the source project's repository and content site as provenance only);
- the package, stack, addons and block libraries it was built with, and, for a project
  built on an added demo, that demo's description and its repository;
- component selections and config values, with every registered credential removed;
- the Commerce connection (address, environment id, store codes), minus credentials, and the
  discovered store structure;
- the datapack it was built for;
- the Adobe org, project and workspace ids and names, which import verifies against the
  signed-in org rather than trusting;
- App Builder integrations by catalog id, custom apps by link, and attributed API picks;
  never their deploy state, endpoints or timestamps;
- saved AI prompts.

What stays local and is never in the file: paths, dates, statuses, component instances and
versions, installed snapshots, publish state, AI file hashes, the pinned flag.

## Where a project's storefront is looked up

One function answers "what storefront is this project on":
`resolveStorefrontForProject` in `src/features/components/services/storefrontResolver.ts`.
It reads the project's own row first (`demo` on the manifest, present when the project was
built on an added demo) and the shipped catalog second, and hands back the package, its
storefront for the project's stack, and which of the two answered. Reset, republish, the
dashboards, the AI bundle and the config generator all go through it, so a project on a
colleague's storefront behaves like one on a shipped brand. The catalog JSON itself is
imported by the resolver and the package loader only; a test pins that.

## Credentials never travel

The file shares the demo's shape, not a login. Credentials live in VS Code's secret storage
on the machine that entered them (`src/features/components/services/commerceCredentialStore.ts`
reads there first). `SECRET_ENV_KEYS` in `src/core/config/envVarKeys.ts` is the register
of what counts as a credential; the reader strips every registered key on the way in,
whatever the file claims. A receiver types their own credentials once, in the Commerce
area, and import names which ones are needed.

## Reading an older file

The reader is `readProjectFile` in `src/core/state/projectFileReader.ts`. A version-2 file
passes through. A version-1 file (the settings export written before September 2026, with
no `kind` field) is migrated on read: its flat console-API picks fold under the
unattributed key, its exported-but-never-read fields are dropped, its `includesSecrets`
stamp is dropped with the field it labelled, and its repository and site become provenance.
The file on disk is never rewritten. A file newer than the extension knows is read as far
as this build understands it and flagged, never refused.

## What a shared-demo file may say

Exactly what a shipped catalog entry in `src/features/components/config/demo-packages.json`
may say about a demo, because the shared-demo shape is derived from the catalog's type: a
name, a description, store-code defaults, storefront config flags, whether a mesh is
required, the datapack the demo expects, and the integrations it depends on. Two things the
file may add that the catalog expresses elsewhere: which shipped block libraries to pre-tick,
and a content source with an index path.

A shared-demo file is optional. When it is absent, "Add a demo" reads what the repository
already holds. When it is present, its values win, and the SC is told what it overrode.
Unknown fields warn and never refuse, so a file written for a newer extension still adds on an
older one.

How to make a storefront addable, and what a colleague needs from you, is
[sharing-a-demo.md](sharing-a-demo.md).

The catalog schema, `src/features/components/config/demo-packages.schema.json`, is closed:
a field the package or storefront type does not have fails validation, which is the check
that a config field lives in three places (the JSON, its schema, and its type).
