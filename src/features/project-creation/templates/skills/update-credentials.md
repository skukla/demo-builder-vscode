---
name: update-credentials
description: Updates Commerce, ACCS, API Mesh, or store-view credentials in a Demo Builder project by editing component `.env` files. Use when rotating API keys, switching backends, fixing authentication failures, or onboarding to a different Commerce instance.
---

# Update Credentials

Use this skill to update Commerce or service credentials for a Demo Builder project.

## Credential locations

All credentials live in component `.env` files:

- **Commerce URL**: `ADOBE_COMMERCE_URL` in the backend component `.env`
- **Store view**: `ADOBE_COMMERCE_STORE_VIEW_CODE` in the backend component `.env`
- **API Mesh endpoint**: `MESH_ENDPOINT` in the mesh component `.env`
- **ACCS endpoint**: `ACCS_ENDPOINT` in the backend component `.env`

## Steps

1. Use `get_component_config` to view the current credential values.
2. Use `update_project_config` to update the credential.
3. Restart the demo server so the new values take effect.

## Example

```
> update_project_config component="adobe-commerce-paas" key="ADOBE_COMMERCE_URL" value="https://new-instance.com"
> Restart the demo server
```

## Notes

- Never commit credentials to version control.
- Use `get_project` to see which components are installed and their paths.
