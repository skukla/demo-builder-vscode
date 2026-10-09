---
id: EDS-34
kind: fix
area: eds
needs: []
value: med
status: built
---

# Publish and cache purge give up on an expired session that preview recovers from

Filed 2026-10-09 from PL-69's "Finding for the owner" (pairs 1 to 3 of the clone
read; PL-69 lives on `refactor/eds-8-god-files`).

Helix answers `403 [admin] not authorized` both for a missing role and for a token
it no longer accepts. Preview and code preview raise `DaLiveAuthError` through
`throwCredentialRefused` (`helixAdminErrors.ts`), so a reset or storefront setup
asks the SC to sign in to DA.live again and carries on. Publish, bulk publish and
cache purge threw a plain "Access denied. You do not have permission to ..." Error
instead, which nothing recognises: the same expired session that preview recovers
from ended the run one step later and told the SC they lacked a role. Nothing
recorded a reason for the difference; the doc on `throwCredentialRefused` exempts
only the DELETE /live 403.

**Owner's decision (2026-10-09, "agreed"):** make publish, bulk publish and purge
match preview. DELETE /live stays exempt (its 403 is the "while source exists"
rule, not a credential).

## What changes for the SC

- Reset and storefront setup: a refused session at the cache-purge or publish step
  now prompts for a DA.live sign-in and resumes, the way the preview step already
  did. Both run inside `withDaLiveAuthRetry`.
- Dashboard republish and the agent tools that publish through `HelixService`
  (`publish_page`, `write_page` with publish, `sync_content`) are NOT inside
  `withDaLiveAuthRetry`, for preview either, so they get the new wording but no
  prompt. Not wrapped here, by instruction: the preview path for the same
  operation is not wrapped. The `republish` agent tool only previews code and is
  unchanged.

## Not in scope, for the owner

The vscode-free client (`helixApiClient.ts`, used by `sync_storefront`'s home-page
publish and the MCP block-library publish) still says "Token does not have permission for this site"
on a 403 for preview and publish alike. It has no way to prompt, so it was left.

## Shipped so far
