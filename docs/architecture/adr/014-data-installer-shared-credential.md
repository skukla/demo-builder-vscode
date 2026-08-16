# ADR-014: The ACCS datapack credential is served from the shared discovery service

**Status**: Implemented 2026-08-16 (`feature/data-installer-credential-broker`) — the `get-commerce-credentials` action in `accs-discovery-service`; `commerceCredentialBroker.ts` is the client seam; `resolveCommerceCredentials` is where precedence lives
**Date**: 2026-08-16
**Decision Maker**: Project Owner
**Implementer**: Implemented on `feature/data-installer-credential-broker` (steps 01-03, TDD)

Related: [ADR-011 App Builder deployables](011-app-builder-deployables.md) (the per-project I/O project model this decision deliberately does not depend on). The plan is `.rptc/plans/data-installer-credential-broker/overview.md`; the sibling backlog item is `.rptc/backlog/per-sc-io-project.md`.

**This ADR reverses a recommendation.** `.rptc/research/data-installer-credential-home/research.md` argued that brokering "gets worse, not better" and recommended a shared per-org Adobe I/O project instead. That research is still worth reading and its measurements still hold; what changed is a fact it did not have. The reversal is recorded here because the research file will otherwise keep arguing the other way to the next reader.

---

## Context

A datapack import, export or reset authenticates to the Commerce instance. For
ACCS that means an OAuth Server-to-Server pair, and such a pair can only be
**created inside an Adobe I/O project workspace**.

A demo project that selects no App Builder components never gets a workspace. It
could browse the datapack catalog and never import — measured live 2026-08-16 on
a real project. The UI's honest response was "add an OAuth client id and secret",
pointing at a place that did not exist for that project.

Three shapes were considered (research, 2026-08-16): a mandated per-project I/O
project, a broker in the shared service, and a shared per-org I/O project. The
research recommended the third and rejected the second.

**What the research did not have**: the owner subsequently established that an
SC's Adobe I/O project and the Commerce instances they demo against can live in
**different IMS orgs** — SCs may hold projects in a Solution Led Commerce SC org
while the instances sit in Adobe Demo System (`285361`). A per-org credential
minted where the SC works would then reach nothing.

That matters because of the measurement below.

## The measured fact this rests on

**A credential's reach follows the technical account's product entitlement in the
org where the COMMERCE INSTANCES live — not the org where the SC works.**

Measured within `285361`, one credential, `get-websites-and-stores` (a read that
cannot start work by accident). Re-measured 2026-08-16 during implementation,
identical across two runs:

| Leg | Result |
|---|---|
| The credential against an instance it was **never provisioned against** | **200**, that instance's own websites |
| Control — a nonsense 22-char instance id | **400** `Pre-flight check failed for all configured site types (accs, local)` |
| Control — the real client id with a bad secret | **401** `invalid_client` |

Both controls failing is what makes the 200 load-bearing. Without the
instance control, 200 could mean the endpoint answers 200 to anything; without
the bad-secret control, it could mean the endpoint does not authenticate
per-instance at all. The mechanism is consistent with the scopes an
`ACCS-REST-API` subscription grants (`commerce.accs`,
`additional_info.projectedProductContext`) — `projectedProductContext` is the IMS
claim carrying product entitlements — but the mechanism is not the measurement.

**Limits of the claim, stated so they are not lost:**

- Two instances, **same org**. Cross-org reach is **untested** — see below.
- This measured a **read**. A write conclusion needs a write.

## The per-SC alternative is closed — measured 2026-08-16

The open question was whether a credential minted where SCs work could reach the
instances. It cannot, and it fails one step earlier than expected: **such a
credential cannot be created in a usable state at all.**

In the Solution Led Commerce SC org, `ACCS-REST-API` is present in the service
catalog but `enabled: false` with **zero** product profiles, and subscribing with
`licenseConfigs: null` returns HTTP 200 carrying
`"Service ACCS-REST-API requires selection of a product"`. A control confirms the
empty product list is specific to ACCS: twelve other services in the same org do
offer products. S2S credential creation itself succeeds, so this is an entitlement
boundary rather than a permissions one.

Since the subscription IS the entitlement — it is what moves a credential's scopes
from `AdobeID,openid` to `commerce.accs` — a credential there can never reach any
ACCS instance.

**So the credential stays in the shared service permanently, by physics rather
than by preference.** `.rptc/backlog/per-sc-io-project.md` may still move store
discovery, prerender, mesh and integration packages to a per-SC project; the
credential is the one item that cannot follow.

**Still untested, and this section is not evidence for it:** whether an
ACCS-*subscribed* credential in one org can read an instance in another. The
experiment stopped before that could be asked. A different org pair might answer
differently; nothing here says otherwise.

## Decision

**Serve one shared `demo-builder-s2s` pair from the discovery service's I/O
project, in the org that holds the Commerce instances, over a
`get-commerce-credentials` action behind the same fail-closed IMS + email-domain
guard chain as `discover-stores` and `register-publish-key`.**

The extension asks for it only when a project declares no pair of its own. **A
locally-configured pair always wins**, so existing projects are unaffected and
anyone who wants their own credential gets it by supplying one.

**The brokered pair is persisted nowhere** — not `componentConfigs`, not
SecretStorage. It is shared rather than per-project, so a stored copy would
multiply one org-wide credential across N project files; and it is re-fetchable
in a single GET, so a stored copy buys only offline use while going stale on
rotation with nothing to clear it.

The action's inputs are deliberately **not** the `IMS_CLIENT_ID` /
`IMS_CLIENT_SECRET` that `discover-stores` uses. Those are consumed inside the
runtime and never leave it; this pair is dispensed. Distinct names let either be
narrowed or rotated without breaking the other, even while they hold the same
values.

## Consequences

**The blast radius, stated plainly.** This endpoint hands out a credential that
can write catalog data to **every ACCS instance in its org**, to any caller whose
IMS token validates and whose email domain is allowlisted.

**Consolidating REDUCES exposure, which is counter-intuitive and load-bearing.**
Before this, every project that *could* provision minted its own pair — and each
of those already reached every instance in the org, by the same mechanism. One
pair instead of N is fewer copies of identical power, not more power. The
security question this raises is real; it is not a question this decision
introduced.

**There is nothing to narrow on.** The publish-key precedent
(`register-publish-key`, same repo, same guard chain, same store) does not
transfer on security: a publish key is site-scoped and revocable per site, and
site scope is precisely why org scope was rejected there. The ACCS pair has no
equivalent narrowing below the org. A future reader will propose tightening the
guard; the honest answer is that the guard is IMS token plus email domain and
there is no finer axis available, so that effort is better spent elsewhere.

**Rotation** is `.env` plus redeploy, the path `ENCRYPTION_KEY` already takes —
not `aio runtime action update --param`, where an update call omitting a param
drops it.

**An unconfigured or refusing service is reported, not silent.** The broker rides
on `demoBuilder.accsDiscovery.services` rather than a setting of its own, so a
user who never set up store discovery would otherwise get no credential and no
hint one exists. Diagnostics distinguishes the four states, which need three
different people to fix.

**This forecloses nothing.** If cross-org reach turns out to work (step 05), the
credential stops being special and can move into a per-SC I/O project with
everything else; the broker becomes dead weight rather than an obstacle.

## Alternatives Considered

**Mandated per-project Adobe I/O project.** Rejected. One credential per demo,
each already reaching every instance in the org: N credentials, N revocation
surfaces, no isolation gained. Two concrete gaps besides — project deletion never
touches the Console project, and `create-adobe-project` returns `AUTH_FORBIDDEN`
for a user without developer permissions, so a *mandated* step would hard-fail
for an SC who is not a developer in their org.

**Shared per-org I/O project** (the research's recommendation). Rejected once the
SC-org / instance-org split was established: a credential minted in the SC's own
org plausibly reaches no instance at all, and that is the case the whole feature
exists to serve.

**A broker that takes the secret off the client.** Not possible, and it was never
the goal. `data-installer-api-b2b` requires the pair in its own request body
(`dataInstallerWriteClient.ts` sends `client_id`/`client_secret`), and that
service is not ours to change. The research rejected brokering partly on this
ground; the objection is correct and irrelevant. The goal is that a project with
no workspace gets a working credential.

**A full proxy of the Data Installer write surface**, which *would* keep the
secret server-side. Rejected as a standing maintenance cost: it means mirroring a
service we do not own and that demonstrably moves. `scripts/dataInstallerDrift.js`
exists because of that movement — and it had been silently inert for weeks when
this was being decided, which is the strongest available argument against
"we can track that service's changes".
