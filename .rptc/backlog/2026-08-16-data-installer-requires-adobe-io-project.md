# Data Installer access requires an Adobe I/O project — new projects can't get one

**Filed:** 2026-08-16
**Origin:** Bodea storefront session, testing sample-data removal on a reset. Handed off
because the decision is Data Installer territory; the Bodea session made no code changes for it.
**Landed here** on `feature/data-installer` 2026-08-16, which is where the two smaller
defects were then fixed — see "Two smaller defects" below, both now SHIPPED.

> **"Workspace" here means an ADOBE I/O workspace**, not a VS Code workspace folder. Not
> related to `2026-05-30-decouple-project-from-workspace.md`, which is about the VS Code kind.
> Same word, different system.

## Symptom

A new project cannot use the Data Installer without manual Developer Console work.

Measured live 2026-08-16 on `skukla/bodea-template-test`: reset offered to remove the
imported sample data, ran the full ~3-minute storefront reset, then ended with

```
[EdsReset] Sample data was not removed: This project has no usable Commerce credentials.
```

`ACCS_OAUTH_CLIENT_ID` and `ACCS_OAUTH_CLIENT_SECRET` were both blank, and
`project.adobe` carried only `{organization, organizationName}` — no `projectId`, no
`workspace`.

## Why it happens

The chain, each link verified in code:

1. The Data Installer needs an OAuth S2S pair in `componentConfigs`
   (`commerceCredentials.ts` `resolveAccs` -> `needs-accs-credentials`).
2. An OAuth Server-to-Server credential exists only inside an Adobe I/O project +
   workspace. `provisionAccsCredentials` takes `{orgId, projectId, workspaceId}`.
3. A package selecting no App Builder components never gets an I/O project binding, so
   `provision-accs-credentials` (`importHandlers.ts:294`) refuses: *"This project has no
   Adobe project binding, so there is no workspace to provision in."*

**"The user can paste a pair in" is NOT an escape from the requirement.** It only moves
who creates the I/O project from the extension to a human in the Console. The Bodea
session initially argued the opposite and was corrected by the owner: if a credential is
required, an Adobe I/O project is required.

Equally, do not reason from a machine where it already works. An existing project with a
working pair proves only that someone did the Console work earlier — it says nothing about
what a new project can reach.

## Goal / Scope — THE REMAINING WORK

Decide how a project that declares a datapack gets an Adobe I/O workspace to provision
credentials into, and make that automatic. Two shapes, both of which remove the manual
Console step:

| Shape | Cost | Notes |
|---|---|---|
| **Per-project I/O project**, auto-created as a required integration in the integrations dashboard | An I/O project per demo; org clutter | Clean lifecycle — deleting the demo deletes its project. Wins outright IF the workspace is also wanted for deploying per-project actions. |
| **One shared "Demo Builder" I/O project + workspace per org**, auto-created on first need | Shared lifecycle; revoking the credential affects everything | Much smaller change. `provisionAccsCredentials` already takes explicit ids and creates a credential its own docstring calls shared — only the HANDLER hard-wires them to `project.adobe`. Handler change, not service change. |

**The question that decides it:** is the Adobe I/O workspace wanted only as somewhere to
put a credential, or also as somewhere to deploy per-project actions? As of filing, the
owner was weighing a pivot away from the shared PDP pre-render + store discovery services
toward per-project Adobe I/O projects. If that pivot happens on its own merits,
per-project wins regardless and the credential rides along.

**This decision is untouched.** Neither fix below depends on it, which is why they went
first.

## Two smaller defects, independent of the above — BOTH SHIPPED 2026-08-16 (`11dea998`)

Both were fixed on `feature/data-installer`, test-first, nine tests confirmed RED before
the change. They do not close this item: a project with no Adobe binding still cannot use
the Data Installer at all. What they close is the extension asking for things it cannot
deliver on the way there.

1. **Reset asked, waited ~3 minutes, then refused. FIXED.** `confirmSampleDataRemoval`
   (`edsResetUI.ts`) gated only on `project.datapack`; credentials were not resolved until
   execution. It now resolves them BEFORE the prompt, so a project that cannot deliver is
   never asked. The original "no network call in front of a modal" objection was mine and
   did not apply: `resolveCommerceCredentials` is a pure local read of `componentConfigs`.
   A project with no datapack still performs no lookup at all.

2. **"Set up credentials automatically" was offered into a dead end. FIXED.** The offer is
   driven by the `needsAccsCredentials` flag on a credential refusal, which asked only
   "are credentials missing?" while `provision-accs-credentials` separately demanded
   `organization` + `projectId` + `workspace`. Two predicates that disagreed.

   Fixed at the flag rather than in the modal, which is what the symptom pointed at: the
   same refusal is raised by the EXPORT spine too, so a modal-side gate would have fixed
   one of the two surfaces. Both now call one shared predicate,
   `canProvisionAccsCredentials` (`services/accsProvisionEligibility.ts`), which the
   provisioning guard itself also uses — so the button and the guard behind it cannot
   drift apart again. Without a workspace the user gets the plain "credentials are
   missing" message and nothing to press.

## Constraints

- **Do not assume a credential reaches multiple Commerce instances.**
  `docs/systems/data-installer.md` records that pre-flight "fails IDENTICALLY for a real
  instance and a nonsense string", so it cannot be settled from outside — it needs the
  service owner or an instance already known to work. An architecture decision was nearly
  rested on "it's probably org-scoped"; that is not established.
  Not blocking today: the owner's projects all target one sandbox instance, so a single
  credential is demonstrably sufficient for them. It becomes real at the second instance.
- Provisioning creates real Adobe org resources. Doing it silently from a reset dialog
  widens what a familiar button does — the same reasoning that made sample-data removal a
  separate opt-in prompt rather than part of the reset modal.
- The subscribe endpoint is a PUT that REPLACES the service list. Subscribe the UNION,
  never just the new code (the App Builder full-union rule).

## Kickoff prompt

> Read `.rptc/backlog/2026-08-16-data-installer-requires-adobe-io-project.md`. Decide
> between per-project and shared-org Adobe I/O workspace for Data Installer credential
> provisioning — the deciding question is whether the workspace is also needed for
> deploying per-project actions. Then implement the chosen shape. The two smaller defects
> the item also listed are already shipped (`11dea998`); do not redo them. Do not assume
> credentials are org-scoped across instances — that is explicitly unresolved.
