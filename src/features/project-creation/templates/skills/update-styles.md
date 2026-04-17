# Update Styles

Use this skill to update block or page styles in the EDS storefront.

## Where styles live

| Scope | File |
|---|---|
| Global page styles | `styles/styles.css` |
| Global fonts | `styles/fonts.css` |
| Block-specific | `blocks/{block-name}/{block-name}.css` |

## CSS patterns

Block styles use a scoped selector:
```css
/* blocks/hero/hero.css */
.block.hero {
  /* block wrapper styles */
}

.block.hero > div {
  /* row styles */
}
```

Global design tokens come from `styles/styles.css` via CSS custom properties:
```css
:root {
  --color-brand: #ff0000;
  --font-heading: 'Brand Font', sans-serif;
}
```

## Steps

1. Edit the target CSS file in the local storefront clone.
2. The PostToolUse hook commits and pushes automatically.
3. Helix updates the preview URL within seconds.
4. For live publish, call `sync_content` on the affected pages.

## Notes

- Prefer CSS custom properties for colors and spacing — they cascade from `:root`.
- Block CSS is automatically loaded when the block appears on a page.
- Use `get_block_source` to read the current block CSS before editing.
