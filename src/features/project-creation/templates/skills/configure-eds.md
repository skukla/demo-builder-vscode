# Configure EDS

Use this skill to update EDS storefront configuration.

## Where config lives

EDS storefront configuration is stored in the `config.json` file at the repo root.
This file drives storefront behaviour: theme, fonts, Commerce endpoints, feature flags.

Common keys:

| Key | Purpose |
|---|---|
| `commerce-endpoint` | Commerce GraphQL endpoint URL |
| `store-view-code` | Commerce store view code |
| `enable-*` | Feature flags for drop-in components |

## Steps

1. Edit `{storefrontLocalPath}/config.json`.
2. Save the file — the PostToolUse hook commits and pushes automatically.
3. Helix picks up the push within seconds (preview URL updates).
4. For live publish, call `sync_content` on the config page.

## Notes

- The `config.json` file is authored in DA.live and synced to GitHub by Helix.
- Editing directly in the local clone is the fastest path; changes go live after push.
- Do not edit `config.xlsx` (the source) when working programmatically — edit `config.json`.
