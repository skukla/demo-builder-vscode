# Where should Data Installer Commerce credentials live?

**Date:** 2026-08-16
**Question:** A project that declares a datapack needs an OAuth S2S pair, which exists only
inside an Adobe I/O project workspace. A package selecting no App Builder components never
gets one. Which shape fixes that?
**Backlog item:** `.rptc/backlog/2026-08-16-data-installer-requires-adobe-io-project.md`

> **Redaction.** This repo is PUBLIC and `.rptc/` is tracked. Commerce tenant ids appear as
> `<instance-A>` / `<instance-B>`, and the Data Installer endpoint is not quoted. No
> credential value was written to disk or printed during this work.

## The three shapes considered

| | Shape |
|---|---|
| **A** | **Mandated per-project I/O project** — every project auto-creates its own Adobe I/O project + workspace as an always-included integration. |
| **B** | **Shared utility in `accs-discovery-service`** — fold credential brokering into the service that already carries `register-publish-key` and an encrypted per-site store. |
| **C** | **Shared per-org I/O project** — one auto-created "Demo Builder" project + workspace per Adobe org, holding one credential. |

C was not in the original framing. It is what the existing code already assumes.

## The load-bearing unknown — RESOLVED 2026-08-16

Everything downstream depended on one question the backlog item and
`docs/systems/data-installer.md` both recorded as unsettleable from outside: **does one
OAuth S2S credential reach MULTIPLE Commerce instances, or only the one it was provisioned
against?**

It could not be settled before because there was one instance to test with. A second
instance made it a single call.

### Measurement

`get-websites-and-stores` — the read the dry run already uses, chosen because it cannot
start work by accident. One credential, already provisioned and known good against
`<instance-A>`. Three legs:

| Leg | Instance | Credential | Result |
|---|---|---|---|
| Positive control | `<instance-A>` (its own) | good | **200**, websites `[base, citisignal]` |
| **The test** | `<instance-B>` (same org, never provisioned against) | good | **200**, websites `[base]` |
| Negative control — instance | 22-char nonsense id | good | **400** — `Pre-flight check failed for all configured site types (accs, local)` |
| Negative control — credential | `<instance-B>` | **bad secret** | **401** — `invalid_client` |

Run twice, identical both times.

**The credential reaches an instance it was never provisioned against.**

Three things make that reading safe rather than convenient:

- **The store structures differ** — `[base, citisignal]` against `[base]`. The service
  returned each instance's own websites, so leg 2 genuinely queried `<instance-B>` rather
  than echoing a cached or generic answer. Identical structures would have left that
  ambiguous.
- **The instance control failed.** The endpoint really does refuse instances it cannot
  reach, with the exact pre-flight error the docs record. Without this leg, "200" could
  have meant the endpoint answers 200 to anything.
- **The credential control failed.** This is the leg that closes the alternative
  explanation. Without it, someone could argue `get-websites-and-stores` does not
  authenticate against the instance at all and returns 200 for any known id. A bad secret
  against the SAME instance that succeeded returns `401 invalid_client`, so the credential
  is load-bearing for leg 2's 200. Added during re-validation; the first run did not have
  it and was weaker for it.

### Mechanism, and the limit of the claim

This matches the scopes an `ACCS-REST-API` subscription grants: `commerce.accs`,
`additional_info.projectedProductContext`, `additional_info.roles`.
`projectedProductContext` is the IMS claim carrying product entitlements, so reach is a
property of the technical account's entitlement in the IMS **org** rather than of any one
instance.

**What is measured:** two instances, same org, one credential, reach confirmed.
**What is NOT measured:** cross-org reach. Expected to fail, untested. Do not cite this
writeup for it.

## Finding: shape B cannot remove the secret from the client

`dataInstallerWriteClient.ts:448` sends `client_id` / `client_secret` in the request body,
and `:463-464` sends them as `x-client-id` / `x-client-secret` headers on the other call
shape. The consumer is `data-installer-api-b2b`, which `docs/systems/data-installer.md`
records as **not something this repo can change**.

So a credential broker inside `accs-discovery-service` (ours —
`skukla/accs-discovery-service`) can only hand the pair back to the extension, which then
forwards it. That adds a hop and a stored long-lived secret while the secret still reaches
the client. It buys nothing on the axis it was proposed for.

Shape B pays off only as a full **proxy** of the Data Installer write surface — import,
validate, delete, export, with status polling staying uncredentialed. That means mirroring
a service we do not own and that demonstrably moves: `scripts/dataInstallerDrift.js` exists
because it does. That is a standing maintenance cost, not a one-time build.

> **The drift checker was dead, and validating this research is what found it. FIXED.**
> Two independent breaks, neither of which had a test:
>
> 1. `docs/systems/data-installer.md:247` told you to run `npm run data-installer:drift`.
>    **No such script existed** — every other reference in the repo names the checker by its
>    path. An earlier draft of this research repeated the command from the doc instead of
>    reading `package.json`, which is exactly how a false identifier propagates.
> 2. `readBaseUrl` read the SHIPPED DEFAULT of `demoBuilder.dataInstaller.apiBaseUrl` —
>    permanently `''` since the feature was pulled before beta.129 (a stage Runtime endpoint
>    in a public repo). So the checker fetched relative URLs and all six endpoints died with
>    "Failed to parse URL". Loudly, at exit 1, which is its design — but for the wrong
>    reason, and it could never pass. `readBaseUrl` had **no test**, which is how an
>    unrelated security fix could break it in silence.
>
> Fixed: the npm script exists, and the endpoint now comes from
> `DATA_INSTALLER_API_BASE_URL`, which refuses to be empty (4 tests, RED first). Verified
> live — `6 endpoints match their fixtures`; unset, it exits 2 naming the remedy.
>
> Worth stating plainly, because it bears on shape B: **the only tool we own that can say
> the Data Installer contract still holds had been silently inert.** An argument that rests
> on "we can track that service's changes" should account for how long this went unnoticed.

## Finding: the publish-key precedent transfers on mechanics, not on security

`register-publish-key` is the obvious template — same repo, same IMS guard chain, same
encrypted store. It does not transfer:

| | Publish key | ACCS OAuth pair |
|---|---|---|
| Narrowing available | site-scoped | none below the org |
| Capability | publish only | **write catalog data** |
| Revocation | per site, already wired | per credential, org-wide effect |

Site scope is precisely why org scope was rejected for publish keys. The ACCS pair has no
equivalent narrowing to reach for.

## Finding: two concrete gaps in shape A

- **Deletion does not clean up.**
  `src/features/projects-dashboard/services/projectDeletionService.ts` never touches the
  Console project (verified: no `consoleProject`/`adobe` reference; control — 39 `delete`
  references, so the file is the right one and the search worked). The backlog item
  credited per-project with "deleting the demo deletes its project"; that would have to be
  built.
- **Not every user can create one.** `create-adobe-project` re-checks
  `testDeveloperPermissions` and returns an `AUTH_FORBIDDEN`-coded error when it fails, and
  the UI drops to "select an existing project"
  (`src/features/authentication/handlers/projectHandlers.ts`). A **mandated**
  always-included integration would hard-fail for an SC who is not a developer in their
  org. This is the sharpest objection to "mandated", and it is about people, not code.

## What the resolution does to each shape

- **A (per-project) is the wrong shape for the credential.** One credential per demo, each
  already reaching every instance in the org: N credentials, N revocation surfaces, N
  pieces of org clutter, no isolation gained. The surviving argument for per-project is
  deploying per-project actions — a different question, decided on its own merits.
- **B gets worse, not better.** Org-reaching means a broker would hold one long-lived
  secret able to write catalog data to every ACCS instance in the org, and it still cannot
  take the secret off the client.
- **C is the shape the evidence points at**, and the code already assumes it:
  `provisionAccsCredentials` creates a credential named `demo-builder-s2s` whose own
  docstring calls it shared, and takes `{orgId, projectId, workspaceId}` explicitly. Only
  the handler hard-wires those to `project.adobe`.

## Recommendation

**Shape C — one shared "Demo Builder" I/O project + workspace per Adobe org, auto-created
on first need.** It matches what the credential actually is, it is the smallest change, and
it forecloses nothing: if per-project I/O projects later win on the App Builder deployment
question, the credential rides along and this becomes dead weight rather than an obstacle.

Still open, and NOT decided by this research: whether per-project I/O projects are wanted
for deploying per-project actions. That is a separate decision.

## Separable security finding

**A demo project's credential can write catalog data to every ACCS instance in its org, not
only its own.** True today, on shipped code, independent of which shape wins. It raises the
stakes on where that secret is stored and how it is revoked — and it is an argument for
fewer copies of it, which is a second, independent vote for C over A.

## Pointers

- `src/features/data-installer/services/accsCredentialProvisioner.ts` — the provisioning
  loop; docstring records the union-subscribe and direct-S2S rules
- `src/features/data-installer/services/dataInstallerWriteClient.ts:448,463` — where the
  pair leaves the extension
- `src/features/data-installer/handlers/importHandlers.ts` — `provision-accs-credentials`
  and its Adobe-binding guard
- `src/features/data-installer/services/accsProvisionEligibility.ts` — the shared
  can-we-provision predicate (added `11dea998`)
- `src/features/authentication/handlers/projectHandlers.ts`,
  `workspaceHandlers.ts` — in-app I/O project and workspace creation
- `docs/systems/data-installer.md` — pre-flight semantics, site-type derivation, the
  documented direct-probe call shapes
