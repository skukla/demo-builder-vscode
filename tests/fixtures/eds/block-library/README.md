# Block library captures

Real responses from Adobe's public B2B boilerplate site, saved byte for byte. Do not
"simplify" them: their quirks are what the tests pin.

All fetched on 2026-11-23.

| File | Fetched from |
|---|---|
| `b2b-blocks.json` | https://main--boilerplate-b2b--adobe-commerce.aem.page/docs/library/blocks.json |
| `b2b-templates.json` | https://main--boilerplate-b2b--adobe-commerce.aem.page/docs/library/templates.json |
| `b2b-checkout.plain.html` | https://main--boilerplate-b2b--adobe-commerce.aem.page/checkout.plain.html |
| `b2b-cart.plain.html` | https://main--boilerplate-b2b--adobe-commerce.aem.page/cart.plain.html |

What each one shows:

- `b2b-blocks.json` is a multi-sheet: a `data` sheet of `{name, path}` rows and an `options`
  sheet. Every `path` points at the NON-B2B site (`content.da.live/adobe-commerce/boilerplate/...`),
  Adobe's copying mistake. Only the last path segment (the block id) is used.
- `b2b-templates.json` is a single sheet of `{key, value}` rows.
- `b2b-checkout.plain.html`: the `commerce-checkout` block is an empty table.
- `b2b-cart.plain.html`: the `commerce-cart` block carries its settings rows.

`cards-variants.plain.html` is hand-written, not captured: two sections, the `cards` block twice
and its `horizontal` variant once, with a script in a cell (holding `</div>` in its text) to
prove scripts are dropped before blocks are cut out.

Used by `tests/features/eds/services/blockLibrary/`.
