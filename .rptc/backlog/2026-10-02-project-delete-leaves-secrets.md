---
id: PL-64
kind: fix
area: platform
needs: []
value: med
status: active
---

# Deleting a project leaves its secrets in SecretStorage

Found 2026-10-01 while making the Commerce REST credential survive a window reload
(AB-53): nothing anywhere deleted a key from SecretStorage when a project was deleted.
The folder went; every secret the project had stored stayed in the keychain. Under the
"whatever can be done can be undone" rule that is a finding. Owner: "file and address the
gap now".

## What a project keeps there, and what is now deleted with it

| Kept by | Key scheme | Deleted on project delete |
|---|---|---|
| Commerce connection secrets (`ACCS_OAUTH_CLIENT_SECRET`, `ADOBE_COMMERCE_ADMIN_PASSWORD`) | `commerceSecretKey(path, component, var)` | yes, `forgetProjectCommerceSecrets` |
| Integration secret settings, and a system's screen key (`ERP_SCREEN_KEY`) | `secretKey(path, component, var)` | yes, `forgetAppBuilderComponentSecrets` |
| The Commerce REST credential kept across reloads | `demoBuilder.commerceRest.credential.<workspace>` | yes, `forgetCredential`, per workspace the project used |
| Helix publish keys | one map keyed by org/site | no: they belong to a SITE, and the storefront teardown forgets them when the site goes |
| GitHub sign-in | one global key | no: it belongs to the user |

`forgetProjectSecrets` (`projects-dashboard/services/projectSecretCleanup.ts`) runs all
three, after the folder is gone (a delete that failed keeps the project and its secrets),
never throws, and logs a kind that would not delete by name only. It is called from both
delete paths: `deleteProjectFiles` (the projects grid, the dashboard, and the agents'
`delete_project`) and the older `demoBuilder.deleteProject` command.

## Still open

- **Two delete paths do one job.** `DeleteProjectCommand` keeps its own copy of the
  stop / delete-with-retry / forget-recent steps that `deleteProjectFiles` also has. Both
  now forget secrets, but a third step added to one will be missed by the other. The card
  menu goes through `projectDeletionService`, not the command, though
  `docs/troubleshooting/cleanup.md` says the reverse.
- **Rename strands integration secrets.** `reKeyProjectSecrets` moves the Commerce secrets
  to the new path on rename, but nothing moves the `secretKey(path, …)` ones, so a renamed
  project loses its integration secret settings and screen key to the old path.
- **Removing one integration** leaves that integration's secret settings behind too.

## Shipped so far
