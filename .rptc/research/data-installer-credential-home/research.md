# Where should Data Installer Commerce credentials live?

**Date:** 2026-08-16
**Question:** A project that declares a datapack needs an OAuth S2S pair, which exists only
inside an Adobe I/O project workspace. A package selecting no App Builder components never
gets one. Which shape fixes that?
**Backlog item:** `.rptc/complete/2026-08-16-data-installer-requires-adobe-io-project.md`

> **Redaction.** This repo is PUBLIC and `.rptc/` is tracked. Commerce tenant ids appear as
> `<instance-A>` / `<instance-B>`, and the Data Installer endpoint is not quoted. No
> credential value was written to disk or printed during this work.

## The two shapes — CORRECTED 2026-08-16 by the owner, twice

**Read this section before the rest of the file.** The first framing below was wrong in a way
that changed the answer, and sections written under it are marked where they still stand.

### Shape 1 — shared I/O project per org, as a credential holder

One Adobe I/O project per org doing exactly what `DemoMeshf4E4` already does for
`demo-builder-test`: hold the OAuth S2S pair so the extension can use it. The shared actions
stay where they are. Small, and confined to the credential problem.

### Shape 2 — the Demo Builder utility becomes a mandatory integration

Using Demo Builder **mandates** that each Demo Builder project carries a corresponding
integration in its footprint, connected to an Adobe I/O project. Then:

- **All four shared actions move out of the standalone discovery service** —
  `discover-stores`, `prepublish-pdp`, `register-publish-key`, `render-pdp` — and into that
  required integration, treated as a mandatory utility that must exist.
- Per current integration behaviour, **every additional integration (mesh or otherwise)
  associates with that same Adobe I/O project**.
- **Multiple Demo Builder projects may reference the same** App Builder project / mesh, so
  the count of deployments is not the count of demos.
- **And the PDP approach pivots**: away from the shared `prepublish-pdp` action, toward the
  **Adobe-standard `commerce-prerender`** approach.

The credential problem dissolves as a side effect of shape 2 rather than being its point —
every project has an I/O project by construction.

### What the earlier framing got wrong

Two errors, both mine, both costly:

1. **Shape 2 was read as "give each project an I/O project to hold a credential."** It is
   not. It is dissolving a separately-deployed shared service into the extension's own
   integration machinery. Evaluating it on credential-storage grounds missed the point
   entirely.
2. **A "smallest diff" answer was offered** — make the datapack choice trigger the existing
   create-project chain — which is neither shape and does not address the decision.

The old A/B/C table is superseded. What survives from it: **B is dead** (see the
`data-installer-api-b2b` finding below — brokering cannot take the secret off the client),
and the reach measurement below is load-bearing for both surviving shapes.

### The pivot reopens something previously closed

A prior note records `commerce-prerender` as **NOT a fit**, on the grounds that it is
one-deployment-per-storefront and conflicts with extension-managed Config Service writes —
and ADR-005 rejected per-storefront deployment for multi-tenancy. **That rejection was
conditional on the shared-service architecture.** Shape 2 changes that architecture, so the
premise that killed prerender has to be re-tested rather than inherited. Whether
per-*integration* deployment (shareable across demo projects) is the same thing ADR-005
rejected is exactly the open question, not a settled one.

## Shape 2 feasibility — four questions, researched 2026-08-16

### Q1. Can the deploy spine carry a REQUIRED utility integration? Partly.

D1 shipped (catalog + kind-dispatch runner + two-path subscriber); **D2–D6 pending**, and D2
(selection UX) is recorded as "still a placeholder — needs real design".

The catalog holds exactly **one** entry today: `app-builder-shell`, kind `integration`, from
`skukla/app-builder-shell`. And the schema has **no** notion of a required or always-included
deployable — the component properties are `compatibleBackends`, `compatibleFrontends`,
`description`, `envSchema`, `id`, `kind`, `name`, `nativeForPackages`, `onlyForPackages`,
`providesEnvVars`, `requiredApis`, `source`. Nothing expresses "must exist".

So shape 2 needs a new concept in the schema plus the gating that enforces it. Deploying is
solved; *mandating* is not.

### Q2. What is the upgrade path for a deployed integration? Mesh has one; integrations do not.

Staleness detection lives in `src/features/mesh/services/stalenessDetector.ts` and is
mesh-shaped — `sourceHash`, `envVars` baseline, `userDeclinedUpdate`. `AppBuilderComponentState`
carries `sourceHash` and `lastDeployed` for every kind, so the data is there, but the detector
and the redeploy prompt are the mesh's.

**This is shape 2's cost centre.** Today one deployment serves everyone and a fix ships once.
Afterwards every deployed copy needs updating, and the machinery that would notice is
currently mesh-only.

### Q3. Can multiple demo projects share one App Builder project? Partly, and with a trap.

`appBuilderComponents` is a `Record<string, AppBuilderComponentState>` **on the Project**, so
deployment state is per demo project. Two demo projects can both bind to the same
`adobe.projectId` and each record its own state — which is what "multiple projects reference
the same App Builder project" means concretely.

**The trap:** nothing keys a deployment by the shared I/O project (searched; no
`sameAdobeProject` / `sharedWorkspace` / `byAdobeProject` concept exists). So two demo projects
sharing a workspace would each believe they own the deployment, and deploying from the second
overwrites the first's actions in that namespace with no dedup and no warning.

### Q4. Does shape 2 revive `commerce-prerender`? Less than it looks — and this has oscillated.

**It has been decided both ways already.** `docs/research/2026-05-18-production-readiness-roadmap.md`
concluded per-project prerender deployment WAS the path — "Demo Builder deploys it per project
and writes the URL into `byomOverlayUrl`. Per-project deployment is the realistic path — no
Adobe-shared service to point at." That was later reversed in favour of the shared action.

The reversal rested on four reasons. Shape 2 touches **one**:

| Reason prerender was rejected | Does shape 2 change it? |
|---|---|
| **N demos = N deployments** (binds to one ORG/SITE, one STORE_URL, one namespace, one admin token) | **Partly.** The deployment-count objection dissolves if per-project deployment is the model anyway. Whether prerender can serve multiple SITES from one deployment is UNVERIFIED — see the gap below. |
| **Conflicts with extension-managed Config Service writes** — prerender registers `content.overlay` itself; `ConfigurationService.registerSite` rewrites the FULL content block with no merge semantics, so each side clobbers the other | **No.** Independent of where things are deployed. Still a real engineering conflict, and fixable only by adding merge semantics or ceding overlay registration. |
| **Continuous catalog churn per prospect** → continuous redeploys + blob growth | **No.** Churn is a property of the SC workflow, not the architecture. |
| **Prerender's value-add is SEO / social / crawler metadata (Tier 3), which demos do not need** — humans on Zoom calls, recorded in ADR-005 | **No.** The sharpest of the four, and completely untouched by shape 2. |

**But the reversal weighed FIT and not OWNERSHIP COST, and that is the new argument.** The
bespoke shared service now carries `discover-stores`, `prepublish-pdp`, `register-publish-key`,
`render-pdp`, an AES-256-GCM per-site key store, a drift checker, and the residue of a 401
saga that took days. Adopting the Adobe-standard path means deleting most of that and letting
someone else maintain it. Nothing in the earlier decision priced that, because at the time the
custom surface was small.

**Gap I could not close:** `aem-commerce-prerender` is not checked out locally, so its config
model is unread. Whether one deployment can serve multiple sites — the crux of reason 1 — is
UNVERIFIED, and I will not infer it from the memory's summary. Clone it and read its config
before this decision is made.

### The current model already assumes per-org deployments

`demoBuilder.accsDiscovery.services` is **org-keyed** — an array of
`{orgName, orgId, serviceUrl}` — carrying a single row today because there has been one org
in play. `demoBuilder.byom.overlayUrl` is a single un-keyed URL by contrast, and ships a
stage Runtime endpoint as a default in this public repo. Shape 2 would retire both.

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

## Org topology, from the owner 2026-08-16 — this settles the "per org" question

SCs today work in **one of two** Adobe orgs: **Adobe Demo System** (`285361`) and a
**Commerce Solution Led SC** org. More orgs are expected later. All SCs are expected to have
App Builder / Developer Console access wherever they work.

Three consequences, and the first two kill designs that looked reasonable an hour ago:

1. **"One shared workspace, full stop" is dead.** There is already more than one org, so the
   credential home has to be resolved PER ORG and created on first need. Shape C was written
   as "per org" on the strength of the reach measurement; the topology now makes that
   mandatory rather than merely tidy.
2. **Reusing the ACCS Discovery Service's own I/O project is dead.** That project
   (`<discovery-io-project>`, workspace `Stage`) exists only in `285361`. An SC in the Commerce
   Solution Led org has no such project, so anything that reaches for it by id or name works
   for one org and silently fails for the other. It would also couple the extension's
   credential lifecycle to a deployed service's project, which is worth avoiding on its own.
3. **The permission objection weakens, but does not vanish.** "Expected to have Dev Console
   access" is a reasonable planning assumption and a bad runtime one. Keep the graceful
   `AUTH_FORBIDDEN` path: if creation is refused, say so and let the user pick an existing
   project, exactly as `create-adobe-project` already does.

**Measured on this machine, and stated with its limit:** both local projects bind to org
`285361`, and org `285361` already contains TWO I/O projects — `<discovery-io-project>` (the discovery
service) and `DemoMeshf4E4`, the latter created **per demo project** for the mesh. So the
extension already creates per-project I/O projects in some flows; what is missing is only the
case where nothing else triggers one. `bodea-template-test` is bound to `285361` with no I/O
project at all, which is the reported failure, visible on disk.

**Do not confuse the Adobe IMS org with the Helix/GitHub org.** The backlog item's line
"SCs use their own GitHub namespaces, so orgs are per-SC" is about the GitHub owner, which is
a different system. Nothing measured says SCs have separate *Adobe* orgs; the owner says they
have two and may have more. Reasoning about credential reach from the GitHub org would be a
category error.

### What the design therefore has to do

Find-or-create, per org, idempotent: resolve the caller's current Adobe org, look for the
shared Demo Builder I/O project in it, create the project and workspace when absent, then
provision `demo-builder-s2s` there. Every piece already exists — `getProjects({orgId})`,
`getWorkspaces`, `createProject`, `createWorkspace`, and `ensureOrgContext` for the
switching case.

**The one genuinely new question is IDENTITY: how does the extension recognise "the Demo
Builder project" in an org it has never seen?** Matching on title is fragile — a rename or a
human-created lookalike both break it, in opposite directions (missed, or wrongly adopted).
Decide this before building; it is the part with no existing precedent in the codebase.

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

The org topology confirms it independently: with two orgs today and more expected, per-org
resolution is required rather than optional — and it is the only shape that keeps working
when an SC's org is one the extension has never seen.

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
