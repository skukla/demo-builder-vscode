# Custom Block Libraries

## Overview

Custom block libraries let Solutions Consultants bring their own blocks to any Demo Builder storefront. A custom block library is a standalone GitHub repository — it does not depend on an existing storefront or DA.live content source.

## Repository Structure

A custom block library must follow this structure:

```
your-block-library/
├── blocks/                          # Required
│   ├── hero-custom/
│   │   ├── hero-custom.js
│   │   └── hero-custom.css
│   ├── product-carousel/
│   │   ├── product-carousel.js
│   │   └── product-carousel.css
│   └── newsletter-signup/
│       ├── newsletter-signup.js
│       └── newsletter-signup.css
├── component-definition.json        # Required for DA.live library visibility
├── component-models.json            # Optional — field definitions for editing
└── component-filters.json           # Optional — section allowlists
```

### Required: `blocks/` Directory

Each subdirectory under `blocks/` is one block. The directory name is the **block ID**.

- Block IDs must be lowercase and hyphen-separated (e.g., `hero-custom`, `product-carousel`)
- Any files inside are copied: `.js`, `.css`, `.json`, images, etc.
- Discovery is automatic — no manifest needed
- Blocks already in the destination repo are never overwritten (first library wins)

### Required: `component-definition.json`

Without this file, blocks are installed into the GitHub repo but **do not appear in the DA.live block library**. This is the most common setup mistake.

The file must include a `plugins.da.unsafeHTML` field for each block. This HTML is used to auto-generate the block's documentation page in DA.live, which is what makes the block visible in the authoring UI.

```json
{
  "groups": [
    {
      "id": "custom-blocks",
      "title": "Custom Blocks",
      "components": [
        {
          "id": "hero-custom",
          "title": "Hero Custom",
          "plugins": {
            "da": {
              "unsafeHTML": "<div class=\"hero-custom\"><div><h2>Hero Title</h2><p>Hero description goes here.</p></div><div><picture><img src=\"/media_placeholder.jpeg\" alt=\"Hero image\"></picture></div></div>"
            }
          }
        },
        {
          "id": "product-carousel",
          "title": "Product Carousel",
          "plugins": {
            "da": {
              "unsafeHTML": "<div class=\"product-carousel\"><div><p>Product 1</p></div><div><p>Product 2</p></div><div><p>Product 3</p></div></div>"
            }
          }
        }
      ]
    }
  ]
}
```

**Key rules for `unsafeHTML`:**
- The HTML represents one example instance of the block
- The outermost `<div>` must have the block's class name (matching the block ID)
- Each row of the block table is a child `<div>` of the outer `<div>`
- Images use `<picture><img>` tags
- DA.live wraps this in a section `<div>` inside `<main>` when generating the doc page

### Optional: `component-models.json`

Defines editable fields for each block in the DA.live editing UI:

```json
[
  {
    "id": "hero-custom",
    "fields": [
      { "component": "text", "name": "title", "label": "Title" },
      { "component": "richtext", "name": "description", "label": "Description" }
    ]
  }
]
```

- Model `id` must match the block directory name
- Sub-component models use `{blockId}-{subcomponent}` pattern (e.g., `tabs-item`)
- Models are merged into the destination repo's existing `component-models.json`

### Optional: `component-filters.json`

Controls which blocks can appear in page sections:

```json
[
  {
    "id": "section",
    "components": ["hero-custom", "product-carousel", "newsletter-signup"]
  }
]
```

- The `section` entry lists blocks allowed in page sections
- Entries are merged into the destination repo's existing `component-filters.json`

## Configuring in VS Code

Add the repository URL to `demoBuilder.blockLibraries.custom` in VS Code settings:

```json
{
  "demoBuilder.blockLibraries.custom": [
    "https://github.com/your-org/your-block-library"
  ]
}
```

- The `main` branch is always used
- Display name is derived from the repo name (e.g., `custom-blocks` becomes `Custom Blocks`)
- Duplicate detection uses the `owner/repo` pair
- Custom libraries appear as checkboxes in the Architecture Modal under "Custom Libraries"

## How Installation Works

During project creation, the Demo Builder:

1. **Discovers blocks** — Scans `blocks/` for subdirectories with files
2. **Deduplicates** — Skips blocks that already exist in the destination repo or were installed by an earlier library
3. **Copies block files** — All files from each block directory are committed to the destination repo
4. **Merges metadata** — `component-definition.json`, `component-models.json`, and `component-filters.json` are merged into the destination repo's existing files
5. **Generates doc pages** — For each block with `plugins.da.unsafeHTML`, creates a documentation page at `.da/library/blocks/{blockId}.html` in DA.live
6. **Builds library index** — Creates the block library spreadsheet that DA.live uses to render the authoring UI

Only blocks with documentation pages appear in the DA.live library. **If your `component-definition.json` lacks `plugins.da.unsafeHTML`, your blocks will be in the repo but invisible in the authoring UI.**

## Troubleshooting

### Blocks installed but not visible in DA.live library

**Cause**: Missing `component-definition.json` or missing `plugins.da.unsafeHTML` field.

**Fix**: Add `component-definition.json` with `unsafeHTML` for each block. See the example above.

**How to verify**: Check the build logs for:
```
[Block Collection] Installed N blocks from M libraries
[DA.live] Block library created: X/Y blocks with docs
```

If X is less than Y, some blocks lack documentation pages. The missing blocks are those without `unsafeHTML` and without a content source.

### Blocks not installed at all

**Cause**: The repo has no `blocks/` directory, or block directories are empty.

**How to verify**: Check the build logs for:
```
[Block Collection] <Library Name>: skipped N duplicate blocks
```

If your library isn't mentioned, it may not have been selected, or its `blocks/` directory wasn't found.

### Block metadata not merged

**Cause**: The `component-definition.json` in the custom library has an invalid format.

**Expected format**: Must have a top-level `groups` array, where each group has a `components` array. Each component must have at least `id` and `title`.

## Reference: Built-in vs Custom Libraries

| Capability | Built-in Libraries | Custom Libraries |
|-----------|-------------------|------------------|
| Block file installation | Yes | Yes |
| Metadata merging | Yes | Yes |
| `unsafeHTML` doc pages | Yes (if present) | Yes (if present) |
| Content source doc pages | Yes (configured in config) | No (no content source) |
| CDN fallback doc pages | Yes | No |
| Update detection | Yes (commit SHA tracking) | Yes (commit SHA tracking) |

The key difference: built-in libraries can have a `contentSource` field pointing to a DA.live site with pre-authored documentation pages. Custom libraries cannot — they must be **self-contained** by including `plugins.da.unsafeHTML` in their `component-definition.json`.

## Example: Isle5 Block Library

The [Isle5 block library](https://github.com/stephen-garner-adobe/isle5) is a good reference for a standalone library. It includes `plugins.da.unsafeHTML` for 27 of its 29 blocks, making it fully self-contained.
