---
name: update-credentials
description: Updates Commerce, ACCS, API Mesh, or store-view settings in a Demo Builder project. Use when rotating API keys, switching backends, fixing authentication failures, or onboarding to a different Commerce instance.
---

# Update Credentials

Use this skill to update Commerce or service settings for a Demo Builder project.

## Two kinds of value, and only one of them you can read

**Ordinary settings** live in the project's settings, under the component they
belong to; the components' `.env` files are generated from them. You can read and
write them with the tools below:

- **Commerce URL**: `ADOBE_COMMERCE_URL`, in the backend's settings (the backend has
  no folder of its own; the value is written into the frontend's and the mesh's `.env`)
- **Store view**: `ADOBE_COMMERCE_STORE_VIEW_CODE`, likewise
- **API Mesh endpoint**: `MESH_ENDPOINT`, a frontend setting, in the frontend's `.env`
- **ACCS endpoint**: `ACCS_GRAPHQL_ENDPOINT`, in the backend's settings

**Passwords and client secrets do not.** They are kept in the OS keychain, so
`get_component_config` shows them masked and a manifest read does not hold them —
that is deliberate, not a fault. These are:

- `ADOBE_COMMERCE_ADMIN_PASSWORD`
- `ACCS_OAUTH_CLIENT_SECRET`

**Never write a secret with any config tool.** `configure_project` refuses them by design, and raw file writes would land them in plaintext,
which would put the credential back in plaintext and undo the protection. Ask the
user to set it in **Configure → Connection**, where the field shows "Saved" when
one is already held.

For ACCS specifically, check whether a secret is needed at all: Demo Builder
fetches a shared credential automatically for sample-data imports, and the OAuth
fields are only an override.

## Steps

1. Use `get_component_config` to view the current values. A secret shows masked.
2. Use `configure_project` for an ordinary setting; for a secret, hand it to
   the user with the Configure route above.
3. Restart the demo server so the new values take effect.

## Example

```
> configure_project env={"adobe-commerce-paas": {"ADOBE_COMMERCE_URL": "https://new-instance.com"}}
> Restart the demo server
```

## Notes

- Never commit credentials to version control.
- Use `get_project` to see which components are installed and their paths.
