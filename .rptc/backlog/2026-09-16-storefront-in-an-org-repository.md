---
id: EDS-17
kind: feature
area: eds
needs: []
value: high
status: backlog
---

# A storefront can live in an organization's repository, not only the SC's own

Demo Builder creates a storefront repository in the SC's personal GitHub namespace, and
everything downstream assumes that: the Helix site configuration is keyed on the GitHub
owner and repository, AEM Code Sync is installed by whoever owns the repository, and the
DA.live org follows the GitHub namespace.

The team's tooling policy now says personal-namespace repositories are temporary source
material only, and that collaborative work belongs in an organization-owned repository —
enterprise backup, recovery and policy controls do not reach a personal namespace. SCs
reported (2026-09-16) that they cannot create repositories in the enterprise organization
at all, and that the tool they use to generate a storefront cannot target one.

The answer they were given is a manual bootstrap: an organization owner creates the
destination repository and grants access; the SC generates the storefront, re-points the
remote, and pushes; an admin installs or approves AEM Code Sync for that repository. Three
of those four steps are things this extension already does, and the one it does not do —
asking an owner for a repository — is exactly where an SC needs telling what to ask for.

## Why this is ours

- **The site configuration is keyed on owner/repo.** Moving a storefront to another
  repository without re-registering it leaves preview and publish pointing at the old key,
  which fails as a silent "0 paths succeeded" bulk publish rather than an error. The
  extension owns that registration.
- **Code Sync mints the admin role for whoever installs it.** Reinstalling under an
  organization changes who holds the role, which is the failure already tracked as
  [[EDS-16]] wearing a different hat.
- **The DA.live org follows the GitHub namespace**, so the content location moves with the
  repository and the block library and Assets bindings have to follow.

## What it would do

1. Adopt an EXISTING repository rather than create one — creation rights are the thing SCs
   lack. Empty repository in, storefront pushed to it.
2. Re-register the site configuration under the new owner and repository, and re-point the
   project's manifest, the DA.live site and the publish key.
3. Check Code Sync for the new repository, and when it is missing, say exactly what to ask
   an organization admin for.
4. Leave the personal repository alone: it stays as the source material the policy allows,
   and nothing is deleted.

## Also worth fixing while in here

No SSO-authorization error is handled anywhere in the codebase (checked 2026-09-16). Against
an organization that enforces SAML, an unauthorized token answers 403, which the extension
reports as an ordinary permission failure. The fix is one translated message naming the
authorization step — the same shape as the site-access explanation in [[EDS-16]].

## Open

- Whether an SC can be granted repository-creation rights in a team organization, which
  would make step 1 "create or adopt" instead of "adopt".
- Whether AEM Code Sync can be approved once for an organization rather than per repository.
