# Service resolution

**The resolver engine this document used to describe was deleted** —
`serviceResolver.ts`, removed in `b5c1256cb` as over-engineered.
`resolveServices`, `providedServices` and `missingServices` do not exist. Nothing
computes a missing-service set. The full description of the removed engine is in git
history; carrying it forward would be documentation of code.

## What the declarations still do

Components declare `providesServices` and `requiredServices` in `components.json`,
and three things read them:

| Reader | Effect |
|---|---|
| `ui/steps/reviewStepHelpers.tsx` | a backend that PROVIDES a service shows it as "(built-in)" rather than listing it as required |
| `components/ui/hooks/useComponentConfig.ts` | drives Configure's field list |
| `project-creation/helpers/envFileGenerator.ts` | drives `.env` generation |

The `component_requirements` MCP tool exposes the same declarations to agents.

## Why the engine went

It computed which services a stack was missing, and nothing needed the answer. The
declarations are useful as *labels* — this backend brings Catalog Service with it —
and the arithmetic on top of them was solving a problem the product does not have.

If you are about to add a resolver, check first which caller needs the result. That
is the question the deletion answered.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Obsolete code is
deleted, not stubbed — this document exists because the deletion was done properly
and the declarations that survived it needed a home.

## Related

- [eds-backend-configuration.md](eds-backend-configuration.md) — how a backend's
  endpoint reaches the mesh
- [component-system.md](component-system.md) — the component model
