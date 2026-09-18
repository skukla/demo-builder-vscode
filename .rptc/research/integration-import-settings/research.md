# Importing a colleague's integration: what it needs, and who provides it

Researched 2026-09-18 at the owner's request: "Importing integrations from a colleague is
definitely something I'd like to support. Worth doing research to see what settings would
need to be provided versus included in the repo." It came out of AB-21 (integration settings
on the tile), whose step 4 (an add that needs values) waits on this.

Two inputs: a survey of the extension's import path (HEAD `ff030c263` plus AB-21's working
tree), and a survey of real App Builder repos — the owner's own, and Adobe's public starter
kits and samples — against Adobe's docs.

## The answer

**Most of what a colleague's app needs, Demo Builder can already supply or work out. What a
person must type is usually a handful of third-party values, and the modern Adobe pattern
moves even those into the Commerce Admin.** The extension's import path is the weak part: it
cannot tell what kind of app a repo is, rejects the kind Adobe now recommends unless it is an
exact copy of a catalog entry, and deploys any value it was not given as an empty string
without a word.

## Where each value comes from

Every value an App Builder app reads falls into one of five kinds. The examples are from the
repos surveyed.

| Kind | What it is | Examples | Who supplies it |
|---|---|---|---|
| **Platform** | The workspace's own credentials and namespace | `AIO_RUNTIME_*`, `AIO_COMMERCE_AUTH_IMS_*`, `IMS_OAUTH_S2S_*` | Demo Builder already does |
| **The demo's own Commerce** | Things the project already knows | Commerce URL, GraphQL endpoint, store codes, ACO tenant id | Demo Builder can, but does not yet |
| **Another app in the demo** | A value one app provides to another | `ERP_BASE_URL`, `MESH_ENDPOINT` | Demo Builder does, for catalog entries only (`providedBy`) |
| **A person** | Third-party keys, outside system addresses, admin credentials | a Slack webhook, an AWS key, an external database address | Must be asked for: this is a Setting |
| **The repo** | Constants and defaults | `LOG_LEVEL`, cache sizes, feature defaults | Nobody: they belong in the repo |

### What the modern Adobe pattern changes

Apps built on App Management (both Adobe starter kits, Adobe's reference app, and our ERP
integration) take almost nothing at deploy: `LOG_LEVEL` and the six workspace credentials.

- **The Commerce URL is not configured at all.** "After an app is associated with a Commerce
  instance via App Management, the SDK stores the Commerce base URL and deployment type"
  (`@adobe/aio-commerce-lib-app` usage docs).
- **Per-merchant settings, including keys and webhook URLs, go in `businessConfig`.** The
  merchant edits them in the Commerce Admin after install. A `password` field is a masked
  input, stored encrypted. Adobe's reference app keeps its alert webhook URL there. The
  generated API also has a `PATCH /config`, so Demo Builder could fill them in (request shape
  not read yet).

So for a modern app, most of the person-supplied values are not Demo Builder's to ask for.

### Older and one-off apps

These put everything in `.env` and pass it to actions as `inputs: $VAR`: Commerce URLs and
admin credentials, third-party keys, database addresses. This is where an import needs the
most help.

## How a repo says what it needs

| Signal | Machine-readable | Reliable |
|---|---|---|
| `$VAR` references in `inputs:` in `app.config.yaml`, `ext.config.yaml`, `actions.config.yaml` | Yes, by scanning the YAML | **Yes**: it is what `aio app deploy` substitutes |
| `env.dist` / `.env.example` | Partly: names and sample values, no types | No. Our own ERP integration's `env.dist` omits two of its inputs; one colleague repo lists variables no YAML reads |
| `businessConfig` in `app.commerce.config.*` | Yes: typed, validated, served by the app at `GET /app-config` | Yes, but it covers settings set after install |
| `install.yaml` | Yes: the Console APIs the app needs | Yes, for APIs only |
| Anything marking a value secret, required or derivable | No Adobe convention exists | — |

## What happens today when a colleague's repo is imported

From the extension survey (file:line in the survey notes; the headline behaviours):

- **Anything unset deploys as an empty string, silently.** The aio CLI replaces `$VAR` with
  `process.env[VAR] || ''` and does not warn (`aio-lib-runtime` `utils.js` `replaceIfEnvKey`).
  An app with an unset key deploys "successfully" and fails at its first call.
- **Nothing reads the repo's declared inputs.** Settings come only from a catalog entry, and
  an import gets one only when its owner/repo exactly matches a catalog entry's.
- **The kind Adobe recommends is rejected.** Layout is taken from the catalog entry, default
  "standalone", and checked against the repo after cloning, so an App Management
  (extension-layout) repo that is not an exact copy of a catalog entry — including a fork of
  Adobe's starter kit — is refused. The App Management lifecycle is never detected from the
  repo either.
- **The branch is always `main`.** A repo whose default branch is anything else fails to clone.
- **Private repos** clone only if the user's own git credential helper allows it; the modal
  says "public" but nothing checks.
- **Node version** is never read from `engines`, `.nvmrc` or `.node-version`.
- **Required Console APIs** are never read from `install.yaml`; the user hand-picks them.
- **Install scripts** do not run (`npm install --ignore-scripts`), and `npm run build` runs
  without the deploy's env.
- **A committed `.env` is deleted** for extension-layout apps before deploy.
- **During project creation**, an import with required values deploys with blanks, and a
  failed import deploy fails the whole creation.

Fixed while researching (AB-21): the Settings modal and the agent's settings tools looked an
integration up in the catalog only, so a seeded import under its own id had no Settings. They
now rebuild its entry from its record, the way redeploy does.

## Recommended design

Import becomes: **read the repo, classify what it needs, fill in what Demo Builder knows, and
ask only for the rest — on the integration's tile.**

1. **Read the repo after cloning**, before deploying:
   - layout from `app.config.yaml` (the check becomes detection);
   - App Management from the presence of `app.commerce.config.*`;
   - Node version from `engines` / `.nvmrc`;
   - Console APIs from `install.yaml`;
   - the default branch from GitHub instead of assuming `main`.
2. **Discover deploy-time settings** by scanning `$VAR` in every `inputs:`. Use `env.dist` /
   `.env.example` only to add labels and sample defaults, never as the list.
3. **Classify each one** against a table Demo Builder owns:
   - platform names → supplied;
   - the demo's Commerce values (a small map of known names: `COMMERCE_BASE_URL`,
     `ADOBE_COMMERCE_URL`, `MESH_ENDPOINT`, `TENANT_ID`…) → filled in from the project;
   - a name another component in the project provides → connected;
   - everything else → a **Setting**, secret when the name says so (`SECRET`, `PASSWORD`,
     `KEY`, `TOKEN`), shown to the person with what was found.
4. **Store the discovered settings on the integration's record**, so Settings, redeploy and the
   agent tools work for an import exactly as for a catalog entry.
5. **Adding one that still needs values**: it is added as not deployed, its Settings open, and
   Save deploys it. This is AB-21's step 4, and the reason it waited.
6. **`businessConfig` stays in the Commerce Admin.** Show that the app has merchant settings
   and link to where they are set. Filling them in through `PATCH /config` is a later step.
7. **The modal checks the repo before adding**: reachable, public or reachable with the
   user's GitHub sign-in, has an `app.config.yaml`.

**For colleagues who write integrations**: nothing new to learn. Declare inputs the normal
App Builder way (`inputs: $VAR`); put merchant choices in `businessConfig`. An `env.dist`
helps with labels but is not required.

## Not established

- The request body of the generated `PATCH /config`.
- Whether `aio app deploy` fills the `AIO_COMMERCE_AUTH_IMS_*` values itself (the docs show
  only the `sync-ims-credentials` command; Demo Builder supplies them regardless).
- How reliably a name-based rule marks secrets; a person should be able to correct it.
- Whether any colleague's integration depends on another of theirs (Adobe gives no guidance on
  app-to-app values; both examples here are this project's own conventions).
