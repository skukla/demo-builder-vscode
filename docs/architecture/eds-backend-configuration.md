# EDS backend configuration

How choosing a Commerce backend reaches the storefront's generated files.

## One generation path, not a special case

Both `.env` and `site.json` are produced by `@/core/config`'s `configFileGenerator`
from the component registry — the same route every other component takes. EDS used to
have bespoke `.env` logic and does not any more; a document describing that is
describing removed code.

## The endpoint is derived, not selected

A backend supplies its own catalog endpoint — `PAAS_CATALOG_SERVICE_ENDPOINT` or
`ACCS_CATALOG_SERVICE_ENDPOINT`. The mesh should not know which kind it got, so it
reads a single `ADOBE_CATALOG_SERVICE_ENDPOINT`, computed at generation time from
whichever the backend provided.

That variable is **`derivedFrom` the others and deliberately not rendered as a
field** (`serviceGroupTransforms.ts`). Showing it would invite someone to set it by
hand, and a hand-set value silently disagrees with the backend that is actually
configured.

If you are adding a backend, supply its own endpoint key and let the derivation do
the rest. Do not add a branch that writes the derived variable directly.

## What the declarations drive

> The resolver engine that once computed a missing-service set was deleted
> (`serviceResolver.ts`, `b5c1256cb`). `resolveServices`, `providedServices` and
> `missingServices` do not exist. See
> [service-resolution-pattern.md](service-resolution-pattern.md).

`providesServices` and `requiredServices` still live in `components.json`, and two
things read them: the Review screen, which shows a provided service as "(built-in)"
rather than as a requirement, and `.env` generation.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Behaviour lives in the
registry rather than in code — adding support for a backend is usually a row plus its
env keys, and the schema beside each registry is validated by
`tests/templates/config-contracts.test.ts`.

## Related

- [eds-content-separation.md](eds-content-separation.md) — the two-repo model
