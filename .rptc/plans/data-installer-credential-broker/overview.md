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
project. The credential is the one item on that list that may not be able to move, and the
reason is not preference:

**A credential's reach follows the technical account's product entitlement in the org where
the COMMERCE INSTANCES live** — not the org where the SC works. Measured within
`285361` (Adobe Demo System): one credential provisioned against instance A read instance B,
with a nonsense-instance control at 400 and a bad-secret control at 401. Same org only.

SCs may hold I/O projects in the Solution Led Commerce SC org while the instances sit in
Adobe Demo System. A credential minted per-SC in the wrong org therefore plausibly reaches
nothing. **This is untested and is the plan's one open question** — see step 05.

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

| Step | Repo | Blocks release? |
|---|---|---|
| `step-01` — `get-commerce-credentials` action behind the existing guard chain | `accs-discovery-service` | Yes |
| `step-02` — `resolveCommerceCredentials` gains a broker fallback | this repo | Yes |
| `step-03` — reconcile the provisioning UI with the new path | this repo | Yes |
| `step-04` — docs + the security note this endpoint deserves | this repo | No |
| `step-05` — **after ship**: probe cross-org reach | probe | No |

Step 01 deploys before step 02 can be exercised live. Steps 02 and 03 are this repo's and
share a seam. Step 05 is deliberately last: it decides whether Option 2 can absorb the
credential later, and it is cheaper to answer once the pieces exist.

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
