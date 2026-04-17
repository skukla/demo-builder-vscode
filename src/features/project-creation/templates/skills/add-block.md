# Add Block

Use this skill to add an existing block to a DA.live page.

## Steps

1. Open the DA.live page in the authoring UI.
2. Place the cursor where you want the block.
3. Click the "+" button and select the block from the picker.
4. Fill in the block's configuration rows.
5. Save the page — DA.live commits the change to the repo.
6. Helix previews the page automatically.
7. For live publish, call `sync_content` on the page path.

## Common blocks

- **hero** — Full-width hero banner with image and heading
- **hero-cta** — Multi-slide hero with CTA buttons and optional config rows
- **carousel** — Image + text slide container
- **cards** — Responsive grid of image + body cards
- **newsletter** — Email signup form with config rows
- **top-banner** — Sitewide promotional banner
- **columns** — Side-by-side column layout

## Notes

- Use `get_component_definition` to read the block's expected structure before authoring.
- Use `list_blocks` to see all available blocks in this storefront.
