# Configure

Configure is the dashboard screen an SC uses to change a project's settings after it is
created. It is used far more often than Edit, which changes what a project is built from
(the demo package, stack and backend, the Adobe project, the repository and site,
integrations and the datapack). The split between the two is recorded in
`.rptc/backlog/2026-10-12-block-libraries-on-configure.md` (EDS-39) and
`.rptc/research/edit-configure-architecture/research.md`.

Code: the screen is `src/features/dashboard/ui/configure/`, the extension side is
`src/features/dashboard/commands/configure.ts`, and the save both Configure and the agent
use is `src/features/dashboard/services/projectSettingsChange.ts`.

## The tabs

Left to right, as `buildConfigureSections` (`configureSections.ts`) emits them. A tab that
would be empty is not shown.

| Tab | Shown when | What it holds |
|---|---|---|
| Project | always | The project name |
| Adobe Commerce Cloud Service, or Adobe Commerce | the project's backend | How Demo Builder reaches Commerce: the GraphQL endpoint, and on PaaS the URL, Admin URL, username and password |
| Business Structure | the backend has store codes | The website, store and store view codes, chosen from the instance's structure |
| Catalog Service, Adobe Assets, Adobe Commerce Optimizer, Experience Platform, Additional Settings | a selected component declares fields in that group | That service's settings (`SERVICE_GROUP_DEFINITIONS`, `serviceGroupTransforms.ts`) |
| Block Libraries | Edge Delivery projects with a library to show | Which block libraries the storefront has |
| Authoring | Edge Delivery projects | DA.live classic or Experience Workspace |

Integrations are not here. Their settings live on each integration's tile on the
Integrations screen (AB-21), and so do the mesh's deploy and remove, and the Adobe
destination the integrations deploy to.

## What Save does

1. **Only what the SC changed is sent.** The screen compares its values with what it
   loaded and sends the difference (`diffConfigs`). A Configure window opened before a
   change made elsewhere therefore cannot put the old value back. Reopening Configure
   remounts the screen, so it always starts from the project as it is now (`initKey.ts`).
2. **A rename runs first**, when the name changed. It moves the project folder and the
   secrets stored under the old path. It is refused while the demo is running.
3. **The change is staged** (`stageSettingsChange`). It is laid over the settings as they
   are on disk at that moment (the same read the screen loaded with). Integration settings
   are kept as stored. Declared secrets move to the keychain, and a value only leaves the
   project file once the keychain is proven to hold it. The mesh is compared with the
   deployed mesh, and the storefront with what it last published; either is marked out of
   date when the change reaches it.
4. **Block libraries and the authoring choice** are recorded, when they changed.
5. **The project is saved and its `.env` files are rewritten.**
6. **One follow-up is offered**, chosen from what the change reached:

| The change reached | Prompt | What the button does |
|---|---|---|
| The mesh and the storefront (Edge Delivery) | Apply changes to mesh and storefront? | Redeploys the mesh, then republishes |
| The storefront, or block libraries are pending | Republish storefront to apply changes | Adds and removes block libraries, then republishes |
| The mesh, demo stopped | Redeploy mesh to apply changes | Redeploys the mesh |
| The mesh, demo running | Redeploy mesh and restart demo | Redeploys the mesh, then restarts the demo |
| Neither, demo running | Restart the demo to apply changes | Restarts the demo |
| Nothing that needs a follow-up | Configuration saved successfully | — |

Every prompt has Later. Later on a mesh or storefront prompt is recorded on the project,
so the dashboard shows the update as declined. Each prompt is offered once per change:
`_internal.configChanged` re-arms all of them on every save that changes something.

Republish asks for the DA.live sign-in the CDN publish needs. When the change reaches
GitHub but the live storefront still serves the previous configuration, the result says
so instead of reporting success.

An authoring change runs on its own after the save (the DA.live editor path, and for
Experience Workspace the Quick Edit setup), behind its own progress message.

## The agent's door

`configure_project` changes the same settings through the same staging. Its differences:
it refuses secrets (the SC types those into Configure), it checks the mesh against the
stored settings rather than the deployed mesh, and it answers with what it marked out of
date and what to call next (`deploy_mesh`, then `republish`). It writes store codes under
the names the backend reads: `ACCS_*_CODE` on SaaS, `ADOBE_COMMERCE_*_CODE` on PaaS and
ACO.
