# Custom block libraries

An EDS storefront can install blocks from repositories beyond the built-in
collection, so a demo can carry blocks a team already maintains.

## How a library is declared

Built-in libraries live in `src/features/components/config/block-libraries.json`.
Custom ones are configured by the user in VS Code settings, and both appear as
checkboxes in the wizard's Storefront area.

The shape is in `src/types/blockLibraries.ts` and the schema beside the registry.

## What installation does

The blocks are copied into the storefront repository — they become part of the
project's code, not a runtime dependency. That is deliberate: an EDS storefront
serves its blocks from GitHub, so a block that is not committed does not exist as far
as the edge is concerned.

The consequence is that updating a library later does not update projects already
created from it. They have their own copy, and that copy is now theirs to change.

## Registering a block for authoring

A block existing in the repository does not make it available in DA.live's authoring
picker. That is a separate registration, and the
[`register-custom-block`](../../.claude/skills/) skill in a generated project is what
performs it.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). The registry loads
through `ConfigurationLoader` and its schema is validated by
`tests/templates/config-contracts.test.ts`.

## Related

- [`src/features/eds/README.md`](../../src/features/eds/README.md) — the storefront feature
