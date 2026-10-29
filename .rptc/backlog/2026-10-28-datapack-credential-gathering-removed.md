---
id: DI-6
kind: chore
area: data-installer
needs: []
value: med
status: active
---

# The Commerce secrets gathered for the Data Installer service are no longer needed

Filed 2026-10-28, from DI-5's security work (owner: "do both of these"). Widened the same
day to the shared credential and its service action, after the shared-service audit.

## Why

Until 2026-10-27 the extension sent each project's Commerce secrets (an ACCS client id and
secret, or a PaaS admin username and password) to the Data Installer service with every install,
dry run, export and credential check. The service stopped accepting them on purpose, in its
security fix (DEMOSYS-1698); its maintainers confirmed on 2026-10-28 that the change was
intended, and the service now signs in to Commerce with a credential of its own.

On 2026-10-28 the extension stopped sending them (DI-5, commit "the Data Installer service is
sent no Commerce secrets"). What gathered them was then left with nothing to feed: Demo Builder's
own engine signs with the project's access through `commerceClientForProject`, and never needed
them.

The shared credential was also a hole of its own. The discovery service's
`get-commerce-credentials` action handed any caller with an allowed email domain one
credential that could write catalog data to every store in the org (ADR-014, now Superseded).

## Removed 2026-10-28

| Piece | Why it existed |
|---|---|
| `get-commerce-credentials` in the discovery service (its own repo), with its inputs | Served the shared pair |
| The credential broker (`commerceCredentialBroker.ts`) and `commerceCredentials.ts`: resolution, the cache, the sign-out clear | Supplied the pair when the project declared none |
| The credential-service probe, its `check-credential-service` handler (three handler maps) and its Diagnostics section | Told the SC whether the shared pair would be served |
| `BrokeredCredentialFields` and `useCredentialService` (Connection step and Configure) | Rendered the OAuth fields as an optional override |
| The ACCS provisioning offer: `provision-accs-credentials`, its provisioner, eligibility check and workspace-config download, and the import modal's "Set up credentials automatically" | Minted a pair in the project's workspace |
| The write gate's credential requirement, `ImportRequest.credentials`, `ExportRequest.credentials` | The service needed a pair. The gate now needs only a Commerce backend (`commerceBackend.ts`), and an export picks its scope from that backend |
| The sample-data install's credential step, and the reset's credential check (now `beginSampleDataRemovalCheck`, which asks only whether there is a backend) | The same |

Kept: the PaaS admin pair, which store discovery signs in with (`importScopeDiscovery.ts`), and
the entity services' workspace-credential reads, which Console teardown uses.

No install that worked before is refused now. An ACCS project with no saved pair was refused
by the gate when the broker failed; it now opens.

## What remains

**The two ACCS OAuth fields.** `ACCS_OAUTH_CLIENT_ID` and `ACCS_OAUTH_CLIENT_SECRET` are still
declared in `components.json`, rendered as plain fields in the Connection step and Configure, read
by `resolveAccsOAuthPair`, and described in the generated `update-credentials` skill. Nothing reads
their values any more. Their descriptions still say a shared credential is fetched, which is no
longer true.

They were not removed in the same change because existing projects hold values in them:

- the client secret may sit in SecretStorage (the component-secret routing moved it there) or,
  where that move was never verified, in `componentConfigs`;
- removing the field must clean both places up for every existing project, on the activation
  sweep, rather than leave a secret nothing will ever read or delete;
- the secret key must stay in `SECRET_ENV_KEYS` until that clean-up has run, so an export never
  writes a leftover value in plain text;
- the `update-credentials` skill text is part of the AI bundle, so changing it bumps
  `AI_CONTEXT_VERSION`.

## Before finishing

- **The App Builder deploy and EDS reset must keep working**: run their suites, and a live reset
  of a project with sample data.
- **Afreen's answer on product profiles** (is it a matter of adding the service's technical account
  to the store's profile?) decides whether the service can install into an SC's store again. It
  still needs no secrets from us either way.

## Shipped so far

- 2026-10-28  fix(data-installer): stop gathering Commerce secrets; remove the shared-credential broker (`ff7c67be1`)
- 2026-10-28  fix(data-installer): stop gathering Commerce secrets; remove the shared-credential broker (`dedcf8c7d`)
