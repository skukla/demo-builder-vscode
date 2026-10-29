# Two ERPs in one project (AB-23, "Done when")

AB-23 is done when an SC can add two App Management integrations to one project,
including two of the SAME kind. Since every add now gets its own workspace, the Runtime
collision that made this impossible is gone. What remains is that the extension works
everything out from CATALOG ids: a component's id doubles as its catalog id, and the
ERP pairing (`boundTo`, `providedBy`) names catalog ids. A second pair would read the
first pair's ERP address, join the first pair's workspace, and lose its screen and its
record wipe.

The survey that located every such site (2026-09-21) is summarised per slice below.

## Model

- A component instance may record `catalogId`: the catalog entry it was made from. It
  is set when the add mints a fresh id for a catalog entry (the second pair). Absent,
  the id IS the catalog id — every existing project, and the first pair — so nothing
  migrates.
- One resolver, `catalogEntryFor(project, id, catalog)`, answers "which entry is this":
  the catalog entry by id; else the entry named by `catalogId`, re-keyed to the
  instance id; else today's fallback (`entryFromState`).
- A pair is linked by INSTANCE, through the records the add already writes
  (`systems` on the integration, `usedBy` on the system). Catalog `boundTo` /
  `providedBy` say which KIND pairs with which; the records say which instance.

## Slices

1. **Identity.** `catalogId` on `AppBuilderComponentState` (type, manifest schema, the
   JSON registry is unaffected). `catalogEntryFor`, used at every
   `catalog.find(id) ?? entryFromState` site in the runner and relocation, and the
   `getAppBuilderComponentEntry(id)` sites that decide behaviour.
2. **Pairing by instance.** The partner of an instance is read from its records:
   deploy inputs (owners rule), secret inputs, provided values (`ERP_BASE_URL` from the
   linked system, not the flat map), `findMissingProvider`, workspace partner and title,
   component settings, the paired system's name.
3. **Adding a second pair.** When the catalog id is taken, the add mints ids for both
   halves (`erp-integration-2`, `demo-erp-2`, display names "… 2"), records
   `catalogId`, and links the pair explicitly. The webview flow and the add payload
   carry the instance id. `alreadyAddedRefusal` keys on the instance id.
4. **Surfaces.** Cards (template, system type), rename rule, settings export, wizard
   rows, per-workspace API lists — consistent for a templated instance.
5. **Outside check.** Read the ERP app's own App Management manifest for ids that must
   be unique per Commerce store. Read-only.

Live proof (adding a second ERP to Bodea) is the owner's, with the other live checks.

## Outside check — result (2026-09-22, read from Bodea's clone, not run)

The ERP integration app (`skukla/commerce-erp-integration`, `app.commerce.config.ts`)
declares fixed identities to Commerce, identical for every copy:

| What | Value |
|---|---|
| App Management app id (`metadata.id`) | `commerce-erp-integration` |
| Admin menu id | `erp_integration` |
| Webhook `hook_name`s | `erp_contract_price`, `erp_discount_ceiling` (batches `erp_totals_collector*`) |
| Event provider keys | `commerce`, `erp` |

So a second ERP integration installed into the SAME Commerce store will very likely
collide with the first — refused as already installed, or replacing its webhooks. This
is inferred from the manifest, not measured. It is not new: AB-15 recorded the same
collision on 2026-09-17 from its own code-only spike ("the second install finds them
'already subscribed' and skips them … either uninstall deletes both"). This repo now supports two pairs end to
end up to the install; the install itself needs either a live test that shows Commerce
tolerates it, or the ERP app to take these ids from a deploy-time setting (a change in
that repo, not this one).

**Fixed 2026-09-22 (AB-15).** The ERP app now takes its id from a deploy-time value: a copy
is deployed with `DEMO_BUILDER_COPY_NUMBER` and becomes `erp-integration-<n>` (menu id
`erp_integration_<n>`, menu label the ERP's name); the first copy keeps
`commerce-erp-integration`. Not `commerce-erp-integration-<n>`: the library counts a webhook as
an app's when its name starts with the app's id, so that id would have let the first copy's
upgrade or removal delete the second's webhooks (read in lib-app's `isWebhookOwnedByApp`).
Checked with the library's pre-app-build hook; not yet installed live.

## Known limit

Project creation cannot make copies, so a settings export leaves a second copy out
(`settingsSerializer`); a project made from the file gets the first pair.
