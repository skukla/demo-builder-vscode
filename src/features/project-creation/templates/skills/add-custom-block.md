# Add Custom Block

Use this skill to create a new custom block in the EDS storefront.

## Block structure

Every EDS block lives in `blocks/{block-name}/` with two files:

```
blocks/my-block/
├── my-block.js    # Block JavaScript logic
└── my-block.css  # Block styles
```

## Steps

1. Create the block directory: `blocks/my-block/`
2. Create `my-block.js` — export a `default` function that receives the block element:
   ```js
   export default function decorate(block) {
     // manipulate block.innerHTML or append children
   }
   ```
3. Create `my-block.css` for styles scoped to `.block.my-block`.
4. Register the block in `component-definition.json` (in the repo root) so DA.live shows it in the block picker.
5. Call `sync_storefront` to commit and push the new block to GitHub.

## Registering in component-definition.json

Add an entry under `"groups"`:

```json
{
  "title": "My Block",
  "id": "my-block",
  "plugins": {
    "da": {
      "src": "/blocks/my-block/my-block.js",
      "css": "/blocks/my-block/my-block.css",
      "name": "My Block",
      "description": "Description of what this block does",
      "model": "my-block"
    }
  }
}
```

## Notes

- Block names must be kebab-case.
- Use `get_block_source` to read an existing block as reference.
- Helix auto-picks up pushes to the GitHub repo — preview updates within seconds.
