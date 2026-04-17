# Create Block

Use this skill to create a new EDS block from scratch.

## Block anatomy

```
blocks/my-block/
├── my-block.js    # Decorator function — receives and manipulates the block element
└── my-block.css  # Styles scoped to .block.my-block
```

## JavaScript pattern

```js
// blocks/my-block/my-block.js
export default function decorate(block) {
  // block is the <div class="block my-block"> DOM element
  // Each row in DA.live becomes a <div> child
  // Each cell becomes a nested <div>
  const rows = [...block.children];
  rows.forEach((row) => {
    // transform the row's markup here
  });
}
```

## Steps

1. Create `blocks/my-block/my-block.js` with the decorator pattern above.
2. Create `blocks/my-block/my-block.css` with `.block.my-block { }` selector.
3. Register the block in `component-definition.json` — see add-custom-block.md.
4. Call `sync_storefront` to push to GitHub (or let the PostToolUse hook handle it).

## Testing in DA.live

After the push, open a DA.live page and insert the block via the picker.
Each DA.live row maps to a `<div>` in the block's DOM — design your table structure first.
