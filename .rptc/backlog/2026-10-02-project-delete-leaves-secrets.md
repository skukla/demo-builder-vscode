---
id: PL-64
kind: fix
area: platform
needs: []
value: med
status: built
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
never throws, and logs a kind that would not delete by name only. It runs from
`deleteProjectFiles`, which the projects grid, the dashboard and the agents'
`delete_project` all go through.

## The rest of the lifecycle (finished 2026-10-02)

- **One delete path.** The old `demoBuilder.deleteProject` command kept its own copy of
  the stop / delete-with-retry / forget-recent steps. Nothing called it (not in
  `package.json`, no `executeCommand` anywhere), so it was deleted with its six test
  files, its ledger rows and its mutation baseline row. `docs/troubleshooting/cleanup.md`
  no longer names it.
- **Rename moves the secrets, from every door.** Every key scheme above starts with the
  project's path. Only the Commerce secrets were moved on rename, and only from Configure;
  the projects list, the dashboard and the agents' `rename_project` stranded them, and
  nothing moved the integration secret settings or the screen key from anywhere.
  `moveProjectSecrets` now runs inside `renameProjectCore`, which all four go through,
  after the save (a rename that rolls back moves nothing). Both re-keys share one
  copy-verify-delete step, `moveSecret`, so a failed move leaves the value at the old key.
  The REST credential is keyed by workspace, so it does not move.
- **Removing one integration** now deletes its secret settings as well as its screen key
  (the runner's `forgetSecrets` dep; the screen-key-only `forgetScreenKey` was removed).
  When the removal deletes the integration's Adobe workspace, the REST credential kept
  for that workspace goes too (`releaseWorkspaces` → `forgetWorkspaceCredential`); a
  workspace Adobe refused to delete keeps it.

## Shipped so far
- 2026-10-01  fix(projects): deleting a project deletes its secrets from SecretStorage (`252484b7b`)
- 2026-10-02  fix(projects): a project's secrets follow it through rename and integration removal (`109da5799`)
