# Step 04 — Replace the `suffix` inference with the schema that settles it

**From the 2026-08-10 research follow-up. Comment-only. Not release-blocking.**

## What is actually wrong

`configurationService.ts:186-198` is not wrong about the mechanism — it already cites
`https://www.aem.live/developer/byom` and correctly describes `suffix` as the field that
makes the admin service append before fetching from the overlay.

What it lacks is authority. Its last clause reasons from a single A/B:

> The canonical demo at aemshop.net returns 200 in the same scenario. The only known
> registration-shape difference between the two was the suffix.

That is inference from one comparison, and it reads as a guess a future maintainer might
"clean up". It is also the reason this sat on the research doc as an open question for a
release cycle.

## The authority

`https://www.aem.live/docs/admin.html#schema/ContentConfig` defines `content.overlay` as a
*Markup Content Source*:

| field | required |
|---|---|
| `type` | yes — value `"markup"` |
| `url` | yes — uri |
| `suffix` | **no — optional string** |

Its own example: `"overlay": { "type": "markup", "url": "…", "suffix": "string" }`.

So `suffix` is a first-class optional field on the overlay object. Our shape is correct by
specification. It is optional in general and necessary for us because our PDP paths are
extensionless while the overlay serves `.html`.

Finding it takes a note: that page is Redoc, and the spec is embedded in ~3 MB of
server-rendered HTML. There is no `admin.yaml` — `/docs/admin.yaml`, `/docs/admin.json`
and `admin.hlx.page/openapi.yaml` all 404. Strip tags from `admin.html` and read it.

## Change

Rewrite the comment to lead with the schema and keep the empirical note as corroboration,
not as the basis. Drop "the only known registration-shape difference" — the spec has
replaced the need for that reasoning. Keep the research-doc pointer and add the schema URL.

Also record the constraint found on the same page, which we did not know and which nothing
in the codebase mentions:

> the overlay config is tied to the base content and not to the site config — it is not
> possible to have multiple sites with different overlays on the same base content.

Safe today (each storefront has its own DA.live content source) and load-bearing the
moment anything shares one. Put it where a person changing content sources would see it,
not only in this comment — `docs/architecture/eds-byom-pdp-routing.md` is the likelier
home, with the comment cross-referencing it.

## Tests

None. This is a comment and a doc line; `configurationService.test.ts:167` already pins
that the emitted body carries `suffix: ".html"`, which is the behaviour worth protecting.

Do **not** add a test that asserts the comment's wording.

## Done when

- The comment cites the schema URL and no longer rests on the single A/B.
- The one-overlay-per-base-content constraint is written down somewhere a person changing
  content sources will find it.
- `gate` green (expected to be a no-op — no code changes).
