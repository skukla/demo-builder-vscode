---
id: AB-84
kind: feature
area: app-builder
needs: [AB-85]
value: med
status: backlog
---

# The integration catalog row lives outside the extension

Filed 2026-11-04 from the PL-91 audit (`.rptc/research/libraries-outside-the-extension/research.md`,
§6a and §9). Owner's decision: move the row out now, as data. Not for beta.153.

## What this is

Today an integration's CODE is already outside the extension: one GitHub repository per
component, cloned into `components/<id>/`, updated from its releases. Only the catalog ROW is
inside, in `src/features/components/config/app-builder-components.json`. So a new integration
that needs no new extension code still needs an extension release.

This item moves the row out. The extension fetches a list of rows from a team source, validates
each against `app-builder-components.schema.json` before anything is cloned or deployed, merges
them with the bundled rows the way custom block libraries are merged with
`block-libraries.json`, and keeps a cached copy for offline.

## What it does not do

It does not move behaviour. A row can describe deploy, undeploy, `envSchema` settings,
`requiredApis`, `screen`, `wipe`, `boundTo`, `listedAs`, `fillsSystem` and `setupSteps` that
name fixes the extension already ships. An integration that needs its own screens, tools or
lifecycle steps (the ERP, a PIM with its own dashboard) is [[PL-92]]'s problem, not this one.

## Three things to build

1. Fetch and cache: resolve the team source the way patches are resolved
   (`externalPatchFetcher.resolvePatchRef`: latest normal release, else `main`).
2. Runtime validation of a fetched row against the schema. None exists today; the bundled rows
   are trusted because they ship with the code.
3. The catalog gates on the generic paths that treat every bound system as an ERP: [[AB-85]].

## Open design points

- Where the team source lives. The audit leaned toward a GitHub repository for rows (they
  carry repo URLs and env NAMES, never values). The team demo list went to the datapack store
  ([[EDS-13d]]); whether rows should follow it is a question for the plan.
- A row fetched later may describe a NEWER integration than a project has cloned. Cache the row
  on the project at add time, as the project already caches its demo-package row.
- A fetched row naming a `wipe` or `setupSteps` handler this extension version does not have:
  the add must refuse before deploying.
