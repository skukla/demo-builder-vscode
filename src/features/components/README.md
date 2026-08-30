# Components

The catalog. What a demo project can be built from, and what installing one means.

## Behaviour lives in JSON, not in classes

Five registries under `config/`, each with a schema beside it:

| | |
|---|---|
| `components.json` | every installable component |
| `stacks.json` | frontend + backend combinations, and global addons |
| `demo-packages.json` | the brands on the Welcome screen — storefront config, addons, content |
| `app-builder-components.json` | deployable App Builder integrations |
| `block-libraries.json` | EDS block library definitions |

**Adding support for something is usually a row, not a class.** Check the registry
before writing code — that is the first question this feature exists to answer.

Every file has a `.schema.json` sibling and a test that validates one against the
other, so a malformed row fails the build rather than the demo.

## `providesServices` / `requiredServices`

Components declare the Adobe services they need and the ones they supply. Two things
read those declarations: the Review screen, which shows a provided service as
"(built-in)" rather than as a requirement, and `.env` generation.

**Nothing computes a missing-service set.** A resolver that did was deleted as
over-engineered; if you find documentation describing one, it is describing code that
no longer exists. See
[service-resolution-pattern.md](../../../docs/architecture/service-resolution-pattern.md).

## Related

- [component-system.md](../../../docs/architecture/component-system.md) — the model
- [`appbuilder-component-authoring`](../../../.claude/skills/appbuilder-component-authoring/SKILL.md)
  — adding a deployable integration
