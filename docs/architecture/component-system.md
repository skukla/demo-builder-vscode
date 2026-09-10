# Component system

A demo project is assembled from components: a frontend, a backend, and the
dependencies and integrations they need.

## Components are rows, not classes

`src/features/components/config/components.json` defines every installable
component — where it clones from, what it needs, what it provides. Adding support for
something is normally an edit there. The registries and what reads them are in
[`src/features/components/README.md`](../../src/features/components/README.md).

## Three kinds, and one of them is not a component

| `type` | |
|---|---|
| `frontend` | the storefront — EDS, or headless |
| `backend` | Commerce — ACCS or PaaS |
| `dependency` | something a frontend or backend needs, like the mesh |

A **stack** (`stacks.json`) is a frontend + backend combination that is known to
work, plus the addons available to it. A **demo package** (`demo-packages.json`) is
what the user actually picks on the Welcome screen — a brand, with a stack and
content behind it.

So a user chooses a package, which implies a stack, which implies components. Working
backwards from a component to explain what the user did is the wrong direction.

## Dependencies are declared, and the order matters

A component declares what it `depends` on. Installation follows those declarations,
because a mesh deployed before its backend exists has nothing to point at.

There is no general graph — the relationships are one level deep by design, and the
proposal to generalise them is backlog PL-23 rather than architecture.

## Required versus optional

An optional component that fails to install does not fail the project. A required one
does. That distinction is what lets a demo come up without an integration the user
did not ask for, and it is why `optional` is a field rather than an inference.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Registries load through
`ConfigurationLoader`, each has a schema beside it validated by
`tests/templates/config-contracts.test.ts`, and a config leaf is never mocked in a
test — inject the data instead.

## Related

- [component-version-management.md](component-version-management.md) — how a component updates
- [service-resolution-pattern.md](service-resolution-pattern.md) — what `providesServices` still drives
