# Data Installer credentials from the shared discovery service (Option 1)

**Decided:** 2026-08-16.
**Supersedes** the "shared per-org I/O project" recommendation in
`.rptc/research/data-installer-credential-home/research.md`, which was written before the
owner established that an SC's I/O project and the Commerce instances can live in
DIFFERENT Adobe orgs.
**Sibling:** `.rptc/backlog/per-sc-io-project.md` (Option 2). These are not alternatives to
each other in the usual sense — see "Why the credential stays behind".

## The problem

A demo project that selects no App Builder components never gets an Adobe I/O project, so it
has nowhere to hold the OAuth S2S pair a datapack write needs. It can browse the catalog and
cannot import. Measured live 2026-08-16 on `bodea-template-test`.

## Why the credential stays behind when everything else moves

Option 2 moves discovery, prerender, mesh and integration packages into a per-SC Adobe I/O
project. The credential is the one item on that list that **cannot** move, and the reason is
not preference:

**A credential's reach follows the technical account's product entitlement in the org where
the COMMERCE INSTANCES live** — not the org where the SC works. Measured within
`285361` (Adobe Demo System): one credential provisioned against instance A read instance B,
with a nonsense-instance control at 400 and a bad-secret control at 401. Same org only.

SCs hold their I/O projects in the Solution Led Commerce SC org while the instances sit in
Adobe Demo System. **Settled 2026-08-16 (step 05):** a credential there cannot even be
subscribed to `ACCS-REST-API` — the service is present but carries no product profile in
that org, and the subscribe is refused inside an HTTP 200. Since the subscription IS the
entitlement, such a credential never gains `commerce.accs` and could reach nothing.

This was written as "plausibly reaches nothing… untested". It is now measured, and it fails
one step earlier than predicted: not a reach problem, an entitlement one.

So: put the credential where the instances are, and hand it out.

## Shape

One `demo-builder-s2s` pair, living in the shared discovery service's I/O project in the org
that holds the Commerce instances. The extension asks for it, authenticated by the guard
chain that already protects `register-publish-key` and `discover-stores`.

**This is not a step backwards from "brokering was rejected".** Brokering was rejected in
this research on the grounds that it cannot take the secret off the client. That was true and
irrelevant: taking the secret off the client was never the goal, and cannot be achieved
anyway because `data-installer-api-b2b` requires the pair in its own request body and is not
ours to change. The goal is that a project with no I/O project gets a working credential.

**Consolidating REDUCES exposure.** Today every project that can provision mints its own
pair, and each already reaches every Commerce instance in the org. One pair instead of N is
fewer copies of the same power, not more power.

## Steps

| Step | Repo | Blocks release? | State |
|---|---|---|---|
| `step-01` — `get-commerce-credentials` action behind the existing guard chain | `accs-discovery-service` | Yes | **shipped** — `cbeb51b`, deployed to Stage, live check 11/11 |
| `step-02` — `resolveCommerceCredentials` gains a broker fallback | this repo | Yes | **done** — `b076a751` + `70ac8a1e` (Diagnostics) |
| `step-03` — reconcile the provisioning UI with the new path | this repo | Yes | **done** — `6b446d99` |
| `step-04` — docs + the security note this endpoint deserves | this repo | No | **done** — ADR-014 |
| `step-05` — **after ship**: probe cross-org reach | probe | No | **answered** — the per-SC credential cannot be entitled at all |

## Verified live — the credential path, 2026-08-16

A dry run on `bodea-template-test` (ACCS, `eds-accs` stack), against the branch
build stamped `92c26e6c`, with the log level at Debug:

```
shared credential: obtained from the discovery service
shared credential: obtained from the discovery service
get-websites-and-stores → 200 (credentials usable)
process-datapack (validate) → 200
```

**The broker supplied the pair, and that pair authenticated against the
instance.** The first line is the load-bearing one: without it a passing dry run
would have proved nothing, since a declared pair produces an identical result.
The channel had to be at Debug to see it — an earlier info-level dump showed no
`[Data Installer]` lines at all and could not answer the question either way.

**Still not proven: a WRITE with the brokered pair.** A dry run resolves and
authenticates; `process-datapack (validate)` deliberately writes nothing. The
credential-reach research measured a read too. One real import, somewhere it is
safe to write, closes that.

**The cache skipped in step 02 now exists, because this run measured the reason.**
The broker ran TWICE in that dry run, ~8s apart — two resolutions, two GETs for
one user action. Step 02 left the cache out on the grounds that the benefit was
unmeasured; it is measured now, so it landed.

The two objections that justified skipping it were addressed rather than waived:

- **Staleness** — bounded by a 30-minute TTL over `core/cache`, not session-long.
  The shared pair can be rotated in the service, and a copy that outlived the
  window would keep failing with nothing to say why. Refusals are never cached, so
  a 403 fixed by an allowlist change is retryable immediately.
- **A test-only export** — `clearSharedCredentialCache()` is called by
  `AuthenticationService.logout()`. The cached pair was fetched under ONE user's
  authorization; whoever signs in next must not inherit it. A negative control
  confirms the test fails when that call is removed.

**Its real cost, found immediately:** a module-level cache outlives a test. Three
existing suites started failing because one test's successful fetch handed the
next a cached pair. Each now clears it in `beforeEach`, and the reason is written
where the next person will hit it.

Step 01 deploys before step 02 can be exercised live. Steps 02 and 03 are this repo's and
share a seam. Step 05 was deliberately last: it decided whether Option 2 can absorb the
credential later. It cannot — see the step file.

## Constraints

- **The secret never reaches a log, a URL or an error message.** The existing provisioner
  already holds this line (`accsCredentialProvisioner` logs step names only); the new
  endpoint and the new client path must too.
- **The guard chain is load-bearing and must fail closed.** This endpoint dispenses a
  credential that can WRITE CATALOG DATA to every Commerce instance in its org. `discover-stores`
  already fails closed when the allowlist is absent; match it exactly, and treat any
  relaxation as a security change rather than a convenience.
- **Store the pair as action default params**, not in the per-site key store: it is one
  credential rather than one per site. Runtime encrypts params at rest, `aio rt action get`
  shows a hash, and `aio runtime action update --param` rotates without a redeploy. Our
  actions set `require-adobe-auth: false` + `final: true`, so `final` genuinely blocks
  invoke-time override. **Adobe warns that ALL params must be passed in one update call or
  the omitted ones disappear** — verify that before relying on rotation.
- **A locally-configured pair still wins.** A hand-pasted or Console-provisioned pair in
  `componentConfigs` stays authoritative; the broker is the fallback for projects that have
  none. This keeps existing projects on exactly the path they are on today.
- **Do not send `MONGO_URI` or any service-owned secret** in a request body. Standing rule.
- This repo is PUBLIC. No endpoint, tenant id, or credential in tracked files.

## Interaction with what shipped in `11dea998`

Two fixes landed before this plan and must stay coherent with it:

- `confirmSampleDataRemoval` resolves credentials BEFORE prompting. Once the broker exists,
  that resolution starts succeeding for projects that previously had nothing — which is the
  point. No change needed; verify the prompt appears where it now can deliver.
- The "Set up credentials automatically" button is gated on an actual Adobe workspace binding
  via `canProvisionAccsCredentials`. That gate stays correct — the button runs **Console
  provisioning**, which still needs a workspace. Its role narrows: it becomes the path for
  users who want their own credential rather than the shared one. Step 03 decides whether it
  stays visible at all.

## Kickoff prompt

> Read `.rptc/plans/data-installer-credential-broker/overview.md` and its step files. Build
> Option 1: a `get-commerce-credentials` action in `accs-discovery-service` behind the same
> IMS + email-domain guard chain as `discover-stores` (fail-closed), serving one
> `demo-builder-s2s` pair from action default params; then a broker fallback in this repo's
> `resolveCommerceCredentials` for projects with no local pair. A locally-configured pair
> still wins. The secret never reaches a log, URL or error. Do not redo the fixes in
> `11dea998`. Leave step 05 (cross-org probe) until after ship — it decides whether
> `.rptc/backlog/per-sc-io-project.md` can absorb the credential later.
