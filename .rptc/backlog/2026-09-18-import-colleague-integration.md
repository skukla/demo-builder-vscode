---
id: AB-22
kind: feature
area: app-builder
needs: [AB-21]
value: med
status: backlog
---

# Import a colleague's integration, and ask only for what it really needs

Filed 2026-09-18 from the owner: "Importing integrations from a colleague is definitely
something I'd like to support." Research: `.rptc/research/integration-import-settings/research.md`.

Takes over AB-21's step 4 (owner, same day): adding an integration that needs values before
it can deploy. Until this ships, such an add is refused in plain words, and a build check
(`tests/features/components/config/appBuilderCatalogSettings.test.ts`) fails if a catalog
entry ever declares a setting without a default.

## What is wrong with importing today

From the research, with file:line there:

- A value the app reads but was not given deploys as an empty string, silently.
- Nothing reads what the repo needs. Settings come only from a catalog entry, and an import
  gets one only as an exact owner/repo copy of it.
- An App Management repo (Adobe's recommended kind) is refused unless it is such a copy,
  forks of Adobe's starter kit included. The App Management lifecycle is never detected.
- The branch is always `main`; private repos clone only through the user's own git setup;
  the Node version and the Adobe APIs the app needs are never read from the repo.
- During project creation, an import that needs values deploys with blanks.

## What it would do

1. After cloning, read the repo: layout (`app.config.yaml`), App Management
   (`app.commerce.config.*`), Node version (`engines` / `.nvmrc`), Console APIs
   (`install.yaml`), and the default branch from GitHub.
2. Find its deploy-time settings from the `$VAR` references in every `inputs:`; use
   `env.dist` / `.env.example` for labels and sample defaults only.
3. Classify each: platform (supplied), the demo's own Commerce values (filled in from the
   project), provided by another component (connected), or a person's (a Setting, secret
   when its name says so, correctable).
4. Store the discovered settings on the integration's record, so Settings, redeploy and the
   agent tools treat an import like a catalog entry.
5. **Adding one that still needs values** (AB-21's step 4): it lands on the grid undeployed,
   its Settings open, and Save deploys it. The same in project creation.
6. Merchant settings (`businessConfig`) stay in the Commerce Admin; the card says the app has
   them and where. Filling them through the app's `PATCH /config` is a later step.
7. The Add Integration window checks the repo first: reachable, and has an `app.config.yaml`.

## Not established

- The request body of the generated `PATCH /config`.
- How reliably a name rule spots secrets; the person must be able to correct it.
- Whether colleagues' integrations depend on each other's values.

## Shipped so far

- 2026-09-18  docs(backlog): AB-22 — import a colleague's integration, with its research (`0c4abe22a`)
