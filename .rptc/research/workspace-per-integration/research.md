# A workspace per App Builder app, inside the demo's one Adobe I/O project

Researched 2026-09-18 at the owner's request: "using a workspace per project integration on a
single Adobe I/O project makes a lot of sense, especially given the abilities it provides around
a separated web-src experience per integration." It differs from ADR-011, which puts every
App Builder component in one project AND one workspace.

Three inputs: the live spikes already on record (AB-2, 2026-08-27; AB-17, 2026-09-17), a
read of Adobe's public docs (sources quoted below), and a survey of every place the extension
assumes one workspace (HEAD `ff030c263` on `feature/erp-integration`).

## The answer

**Adopt it: each integration and each system gets its own workspace in the project; the mesh
stays in the project's main workspace.** Nothing found rules it out, and it removes four
limits the current model works around. But **two things must be settled before any code is
written**, and one existing design choice has to change:

| | |
|---|---|
| Must settle first | **Deleting a workspace.** Removal is only reversible if the extension can delete what it created. It worked once (2026-08-27) and failed once (2026-09-17, read-only project). Adobe's docs say it should not work at all when the workspace has a Runtime namespace. |
| Must settle first | **The Commerce product profile on each new credential.** Every integration workspace needs its own credential subscribed to Commerce REST, which needs a product profile (PL-61). The subscriber refuses today when the org offers more than one. |
| Must change | **How the integration and its ERP authenticate to each other.** An app's own Adobe token is refused by an app in another workspace. The integration calls the ERP the way it would call a real one: with a login the ERP issues it (owner-approved 2026-09-18). The ERP's changes reach the integration through I/O Events (proven). |

## What it buys

Each row is a limit of the shared workspace, and the source that shows it.

| Today, in one shared workspace | With a workspace per app |
|---|---|
| **One static site per namespace.** A deploy replaces every file on it (Adobe CDN guide: "Deployments are atomic: every deployment replaces all existing files"), so only one app can have `web-src`. The ERP serves its screen from a web action with no Adobe sign-in, behind a key Demo Builder generates (`systemScreen.ts:1-15` says so). | **Every app gets its own `web-src`,** at `https://<namespace>.adobeio-static.net/`, signed in with the SC's own Adobe login like any App Builder app. The screen key, its SecretStorage entry and its deploy env var can be deleted. |
| **One App Management app per workspace** (AB-2 spike: the install record has a fixed key; the `commerce/extensibility/1` registration is per workspace). A second Commerce-facing integration cannot be added. | Each integration is its own App Management app. AB-2 proved a second kit app in a second workspace gave a second, independent install service. |
| **One database per workspace** (Adobe: "a strict one-to-one relationship between an AIO project workspace and a workspace database"). A second ERP would share collections with the first. | Each ERP has its own database. AB-16 (several ERPs) loses its renaming work. |
| **Two projects on one workspace overwrite each other** (AB-15's first case). | Goes away, as long as each app's workspace is created by and recorded on one project. |
| **Removal** has to find and delete only this app's packages in a shared namespace (`verifyRuntimeTeardown`). | Deleting the workspace takes the code, the database and the registrations with it. Depends on the first blocker. |

## Platform facts

Quoted from Adobe's public docs unless marked as our own live result.

| Question | What is known | Source |
|---|---|---|
| How many workspaces | No limit: "you are able to add as many workspaces as you need." | Developer Console FAQ |
| Naming | Name: letters and digits, 3–45 characters, unique in the project. Title: letters, digits, spaces. Component ids like `erp-integration` must be converted. | `aio-cli-plugin-console` source (no docs page states it); the title rule matched live in AB-17 |
| New workspace setup | Credential, API subscriptions (no-profile services), Runtime namespace and database all came up with no manual step. The first deploy needs `--no-log-forwarding-update`. | Live, AB-17 steps 3–4; AB-2 |
| APIs | "APIs are added to individual workspaces, not to the project as a whole." | Console services guide |
| Calls between workspaces | **Refused.** `401 [ERR1200] Technical account mismatch` both ways, before the action runs. A signed-in person's token is not tied to a workspace. | Live, AB-17 step 5 |
| Events between workspaces | **Work.** A registration in one workspace received an event from a provider in another. Any credential in the org can publish to any of its custom providers, so the sender is not proven by the provider alone. | Live, AB-17 events check |
| Mesh | "Each workspace within a project can only have one mesh." | API Mesh docs |
| App Management | Apps are associated by project and workspace. Several apps on one Commerce instance, each from its own workspace, is implied by Adobe and shown live. | Experience League App Management; live, AB-2 |
| Same integration twice on one Commerce | Webhook, event and provider names all derive from `metadata.id`, which can be set per build. Not tried live. | Local, AB-17 steps 1–2 |
| Deleting a workspace | **Docs and our results disagree.** Docs: "you cannot … delete a workspace containing a Runtime namespace." Live: `deleteWorkspace` returned 200 on 2026-08-27 for a workspace that had one, and it left the listing. Whether its namespace was really removed was not checked. Then on 2026-09-17: `400 "Read-only project cannot be deleted"`. | Console projects-template page; live, AB-2 and AB-17 step 7 |
| What makes a project read-only | "If you have not been granted access to all services within the project or workspace." | Developer Console FAQ |

### Adobe's own advice points one step further

Adobe's App Builder guide lists "reusing namespaces" as a mistake and says: "Create a separate
Console project for each app." That is a project per app, not a workspace per app. Adobe
describes workspaces as per-developer or per-environment folders.

**Recommendation: stay with workspaces.** Both give the separation Adobe is after: a namespace,
a static site, a database and a credential per app. Only workspaces keep one project per demo,
so the demo keeps one Console link, one deletion, and one place for the mesh. Separate
projects would also multiply the read-only risk in AB-18, which is per project. Nothing
Adobe publishes says a workspace per app is unsupported; it is simply not the use it
describes.

## What changes between the integration and its ERP

Every call between the two apps, and what happens when they are in different workspaces.

| Call | Today | Across workspaces |
|---|---|---|
| ERP → integration: changes made in the ERP (`demo-erp/lib/events.js` posts to the ingestion webhook with the ERP's own token; plan decision 20) | direct call, own token | **Refused.** Move to I/O Events: the ERP publishes to its own provider and the integration's workspace subscribes. Proven live. |
| Integration → ERP: order sync, imports, stock (`commerce-erp-integration/src/lib/erp.js` `erpAuthHeaders`) | direct call, own token (decision 12) | **Refused.** Stays a direct call, with the login the ERP issued (below). |
| Integration → ERP: cart pricing, and later availability (AB-19) and credit (AB-20) | direct call inside a Commerce webhook, capped at 3s | **Refused.** Stays a direct call, with the login the ERP issued. It cannot be an event: Commerce waits for the answer. |
| Demo Builder → ERP: health, wipe, detach, screen | the SC's own token | Unchanged. A person's token is not tied to a workspace. |
| The ERP's screen → its own actions | a web action and a key | Becomes an ordinary `web-src` page with the SC's sign-in. |

### The accepted pattern: two hops, each with its own login (owner-approved 2026-09-18)

A Commerce webhook that needs an ERP's answer makes two hops, and they are authenticated
separately:

1. **Commerce → the integration's action.** Commerce waits for the answer. The integration's
   webhooks are declared `requireAdobeAuth: true` (`app.commerce.config.ts`). At install,
   App Management hands Commerce the integration workspace's own OAuth client id and secret
   (`developer_console_oauth`, built by `resolveDeveloperConsoleOAuthCredentials` in
   `@adobe/aio-commerce-lib-app`, read 2026-09-18). Commerce mints an Adobe token from it for
   each call, and the action's `require-adobe-auth` accepts it because it comes from the
   action's own workspace. (Adobe also documents a webhook signature check
   ([signature verification](https://developer.adobe.com/commerce/extensibility/webhooks/signature-verification/));
   the integration does not use it.) Unchanged by a workspace per app: the credential
   Commerce holds is the integration's own.
2. **The integration's action → the ERP.** Adobe expects the ERP to be outside Adobe, such as
   a real SAP. So the integration calls it with a login the ERP issued: an API key or an OAuth
   client, stored as a setting on the action. (No Adobe page was found that says this in so
   many words. It is how the starter kit's calls to outside systems are set up.)

**Why this came up only now.** Our ERP is not outside Adobe: it is a stand-in, run as a second
App Builder app. The integration has been reaching it with its own Adobe token, which works
only because both apps share one workspace. No real ERP offers that, so the shortcut is
dropped rather than worked around.

**What Demo Builder does:**
- When the pair is added, create the ERP's login for the integration, as an ERP admin issues
  an API user.
- Keep it in SecretStorage only. Pass it to both apps in the deploy's process env: the ERP
  accepts it, the integration sends it. Never in the manifest, `.env`, logs or a webview.
  This repository is public.
- The ERP's API actions that the integration calls check that login instead of
  `require-adobe-auth`. Its admin actions (health, wipe, detach) keep Adobe sign-in, since
  Demo Builder calls them with the SC's own token.
- Removing the pair deletes the login.

This covers every live call the same way: pricing now, availability (AB-19) and credit (AB-20)
later. The ERP's changes still reach the integration through I/O Events (decision 20's
intent, now across workspaces), because that direction is not waited on.

An earlier draft of this research had the ERP check the caller's Adobe token against a list
of trusted client ids. It was dropped: it is a mechanism only a stand-in ERP would need.

## What has to change in the extension

From the survey. Every App Builder component reads its workspace from one field,
`project.adobe.workspace`. Nothing records a workspace per component. The good news is that
most of the lower layers already take explicit ids.

**Already works per workspace, no change:** S2S and API-key credential names are suffixed
with the workspace id; `ensureOAuthCredentialId`, `getS2SDeployCredentials`,
`createWorkspaceS2SCredentialFor`, `ensureWorkspaceRuntimeNamespace` and the config download
take explicit ids; `withOrgContext` targets one call at a time; project teardown already walks
every workspace; API picks are already stored per integration; `ERP_BASE_URL` carries the
ERP's own namespace inside the URL.

**Needs changing:**

| Area | Where | Change |
|---|---|---|
| State | `src/types/base.ts` `AppBuilderComponentState`; `manifest.schema.json` | Add the component's workspace (`id`, `name`, `title`). `project.adobe.workspace` stays as the main one (mesh, ACCS data credential). Existing projects: a missing field means "the main workspace", so they keep working unchanged. |
| Target | `appBuilderComponentRunner.ts` `targetFor` | Read the component's workspace, fall back to the main one. Every deploy, redeploy, undeploy and verify call goes through it. |
| Add | runner add path; `executorAppBuilderPhase.ts` | Create the workspace (name derived from the component id), record it, provision Runtime, then deploy. The creation path and the dashboard add path must do the same thing. |
| Remove | `appBuilderComponentTeardown.ts` | After undeploy and clean-up, delete the workspace, first removing its event registrations as project teardown does. Refuse when the project is read-only, and say why (AB-18). |
| API subscription | `apiSubscriber.ts`, `componentApiPicks.ts`, `consoleApiHandlers.ts` | Subscribe per workspace: that component's `requiredApis`, the baseline and its own picks. Mesh APIs only on the main workspace. |
| App Management | `resolveAppManagementEnv`; `appManagementInstaller.ts` `buildAppData`; uninstaller | Use the integration's own workspace and credential. Required: App Management records which workspace the app lives in. |
| Commerce profile | `apiServiceResolution.ts` `toServiceSubscriptionInfo` | Choose the tenant's own profile instead of refusing when the org offers several (PL-61). |
| ERP screen | `systemScreen.ts`, `app-builder-components.json` `screen`, `demo-erp` | Delete the key and the web-action screen; the ERP ships `web-src`. |
| ERP login | `systemScreen.ts` pattern (SecretStorage, deploy env); `demo-erp` API actions; `commerce-erp-integration/src/lib/erp.js` `erpAuthHeaders` | Demo Builder creates the ERP's login for the integration when the pair is added and deletes it on removal. The ERP's API actions check it; the integration sends it instead of its Adobe token. |
| ERP → integration events | `demo-erp/lib/events.js`; `commerce-erp-integration` | Publish to the ERP's own I/O Events provider; the integration's workspace subscribes. |
| Deploy destination | `destinationHandlers.ts`, `appBuilderComponentMigration.ts`, `set_project_destination` | Today it moves every component to one new workspace. Decide what "change destination" means when each app has its own. |
| Links and display | `openUrlHandlers.ts` (Dev Console link), `agentsMdSections.ts` (AGENTS.md lists one workspace), `settingsSerializer.ts` | One link and one entry per component. |
| Package renaming | `deployAppIsolated.ts`, `owPackageName.ts` | Keep it for now. It costs nothing, and it still guards anything that lands in the main workspace. |

**Every surface this touches.** Creation and regeneration both go through the runner, so they
agree once the runner does. The agent surface: `add_app_builder_component`,
`remove_app_builder_component` and `set_project_destination` change behaviour, and the MCP
tool docs must say so. The webview: the Add Integration flow's destination stages assume one
shared workspace (`flowStages.ts`, `AddIntegrationFlowAdapter.tsx`).

## Not just the ERP: every integration, and the workspace flows that already exist

(Owner, 2026-09-18.) The ERP pair is where this came up, but the decision is about every App
Builder component that is not a mesh. The design and the build must cover:

- **Every kind of integration.** Catalog integrations (App Management and plain apps), the
  systems bound to them, custom-URL integrations, and AI-shell integrations. Each gets its own
  workspace the same way. Nothing in the runner should know it is handling the ERP.
- **Workspace creation that exists today.** Project creation already picks or creates the
  Adobe I/O project and its workspace, and provisions Runtime on it
  (`adobeConsoleProjectOps.ts` `createProject`, `createDefaultStageWorkspace`,
  `createWorkspace`, `ensureWorkspaceRuntimeNamespace`; `executorAppBuilderPhase.ts`
  `ensureWorkspaceRuntimeReady`). That workspace becomes the project's **main** one (mesh,
  Commerce data credential). Each integration's workspace is created by the same operations,
  at add time, on both the creation path and the dashboard add path.
- **Updating.** Integration update, App Management upgrade and reinstall
  (`integrationSourceUpdate.ts`, `appManagementUpgrade.ts`, `appManagementReinstall.ts`),
  redeploy, API subscription changes (Manage APIs, `add_console_apis`), and "change deploy
  destination" (`destinationHandlers.ts`, `appBuilderComponentMigration.ts`) all assume
  the one project workspace today. Each must use the component's own.
- **Teardown.** Removing an integration deletes its workspace (`adobeConsoleProjectOps.ts`
  `deleteWorkspace` already exists). Project deletion already walks every workspace
  (`consoleProjectTeardown.ts`), so it should keep working, but it must be checked with more
  than one. Project reset (`projectResetService.ts`) targets `project.adobe` only; decide
  whether reset leaves integration workspaces alone or resets them too.
- **Existing projects.** A project made before this has every integration in its main
  workspace. The code must keep working for it (a component with no recorded workspace
  means "the main one"). Whether to move such integrations into workspaces of their own, and
  how, is a decision for the plan; the destination-move code is the likely starting point.

## Documents this makes out of date

| Document | What it says now | Update |
|---|---|---|
| ADR-011 | One App Builder project **and one workspace** per demo; "distinct managed-project names make multiple independent apps in one workspace safe". | A new ADR that keeps "one project per demo" and changes the workspace rule, citing this research. ADR-011 gets a pointer to it. Write it once the two blockers are settled, not before. |
| ERP plan, decision 7 | Both apps in the same workspace; the ERP is package-isolated and opens its screen without a sign-in. | Superseded: separate workspaces; the ERP ships `web-src`. |
| ERP plan, decision 12 | No shared secret, because both apps share one workspace and its credential. | Superseded: the ERP issues the integration a login, as a real ERP does (the two-hop section above). |
| ERP plan, decision 20 | The ERP posts to the integration's webhook with its own token. | Superseded: through I/O Events. |
| AB-17 | Open question. | Answered by this research, apart from the two blockers and the live checks below. |
| AB-15 | Refuse two projects on one workspace, and two workspaces on one Commerce. | The first case goes away. The second can become a fix, with a per-copy `metadata.id`. |
| AB-16 | ERPs renamed inside one workspace. | Each ERP gets its own workspace; the renaming work goes. |
| AB-2 | Per-SC Adobe I/O project, one kit app per project. | Its finding (workspace per app) now applies inside each demo's project too; link to this research. |
| `systemScreen.ts` header; `docs/systems/erp-integration.md` | The screen key and why it exists. | Rewritten when the screen moves. |

## Checks before building

In order. Each is a cloud operation and needs the owner's approval first.

1. **Delete a workspace in a project that is not read-only.** Create one, deploy the ERP,
   undeploy, delete. Then check that its Runtime namespace is really gone (list namespaces,
   and ask its old address). This settles whether the docs or our 2026-08-27 result are
   right. Waits on the org admin's fix for AB-18, or an org where the owner is System
   Administrator.
2. **The ERP's login across workspaces.** Deploy the ERP to a scratch workspace with its
   login check. Call a pricing action with the login: expect 200. Without it, and with a
   wrong one: expect 401. Call an admin action (health) with the SC's own token: expect 200.
   The check itself is ordinary code and gets unit tests first; the live part is only the
   deploy.
3. **Commerce REST on a new workspace's credential,** with the tenant's own profile. Check
   the SC can do it as a Developer, and that the project does not turn read-only for them.
4. **The ERP's `web-src` in its own workspace** opens with the SC's sign-in and reaches its
   actions.
5. **The integration's App Management install** from a workspace that is not the project's
   main one, with its `appData` naming that workspace.

## Not established

- Whether `deleteWorkspace` also deletes the Runtime namespace, or only the workspace record.
- Whether a Developer can ever delete a workspace in a project that uses a profile they are not
  a developer on (AB-18 says the whole project is read-only for them, so probably not).
- Whether the Admin menu id must differ between two copies of one integration on one Commerce.
- Whether the "overwrites the first app" warning in Adobe's guide covers actions as well as the
  static site.
