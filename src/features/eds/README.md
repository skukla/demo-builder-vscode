# Edge Delivery Services

Creates and maintains EDS storefronts: a GitHub repo for code, DA.live for content,
and a Configuration Service registration joining them.

## Three systems, and content is not in the repo

An EDS storefront is not one thing:

| | Holds | Reached via |
|---|---|---|
| **GitHub repo** | code — blocks, scripts, styles | GitHub API |
| **DA.live** | content — the pages authors edit | DA.live API |
| **Config Service** | the binding between them | AEM Config Service |

Nothing works until all three agree, which is why setup is a pipeline with recovery
rather than a sequence of calls.

## Setup can fail halfway, so it records where it got to

`StorefrontSetupPartialState` tracks whether the repo was created and whether content
was copied. On cancel or failure the cleanup path reads it and removes exactly what
was made — a repo created but never bound is invisible to the user and impossible for
them to find later.

## The traps that have cost real time

These are documented properly in
[eds-publish-and-config](../../../.claude/skills/eds-publish-and-config/SKILL.md) —
read it before touching publish or config. In short:

- **The Config Service lookup key is the GitHub owner/repo**, not the DA.live name.
  Getting it backwards fails a bulk publish silently.
- **`aem.repositoryId` goes in the SITE config**, not the org config. Org-scoped, the
  block library appears and AEM Assets does not.
- **A DA.live canvas URL takes the extensionless document name.** `index`, not
  `index.html` — da.live appends the extension itself, and the doubled one 404s in a
  way that leaves the page rendering.
- **`aem.live` rejects percent-encoded paths** with a bare 404 before the storefront
  renders, so `encodeURIComponent` is unusable for PDP URLs
  ([ADR-007](../../../docs/architecture/adr/007-pdp-sku-url-encoding.md)).

## Dropins are vendored, not installed

Commerce dropins load through an import map to committed files under
`scripts/__dropins__/`, vendored by the storefront's postinstall. They share internal
chunks, so mixing generations blank-pages the site — which is why additive vendoring
was retired. See
[eds-dropin-vendoring](../../../.claude/skills/eds-dropin-vendoring/SKILL.md).

## Related

- [eds-content-separation.md](../../../docs/architecture/eds-content-separation.md)
- [eds-byom-pdp-routing.md](../../../docs/architecture/eds-byom-pdp-routing.md)
