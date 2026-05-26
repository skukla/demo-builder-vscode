---
name: add-component
description: Adds or enables a component in a Demo Builder project by writing component `.env` values via the MCP tools. Use when adding a new component instance, toggling an optional component on or off, or wiring credentials for a fresh component installation.
---

# Add Component

Use this skill to add or enable a component in your Demo Builder project.

## Steps

1. Use the `get_project` MCP tool to view the current project configuration.
2. Use `get_component_config` to read the current `.env` values for the target component.
3. Use `update_project_config` to set or update component environment variables.
4. Restart the demo server to apply the changes.

## Example

```
> get_project
> update_project_config component="headless" key="ADOBE_COMMERCE_URL" value="https://my-store.com"
> Restart the demo: run `npm run dev` in the component directory
```

## Notes

- Component `.env` files live at `{componentPath}/.env` (or `.env.local` for Next.js).
- Do not edit `.demo-builder.json` directly — it is managed by the extension.
- After config changes, restart the demo for them to take effect.
