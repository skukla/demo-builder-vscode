---
id: DI-10
kind: feature
area: data-installer
needs: []
value: low
status: backlog
---

# A colleague's shared pack should say who made it

Filed 2026-10-31, from the owner's live test of the datapack panel.

## The gap

The datapack library stores a pack's `owner` as the saving account's internal Adobe id
(`<hex>@adobe.com`), never a name. Measured with `get_datapack` on a library pack the same day.
The panel now says "You" for the SC's own pack and leaves the Owner row out for a colleague's
(`d770c17e0`), because there is nothing readable to show. So an SC browsing shared packs cannot
tell whose a pack is.

## The constraint the owner set

The colleague must not be asked for anything. Their name has to come for free.

## Decided (owner, 2026-10-31)

**Kept with our packs. We ask the Data Installer team for nothing.** Demo Builder records the
saver's name, and optionally their email, from their own Adobe sign-in, inside the pack it saves:
a small record of its own that Demo Builder writes and reads. Nobody types anything.

**It is the saver's choice**, through a setting. Recommended default: on, since only people the
saver chose to share with can see the pack at all. With it off, the pack carries no name.

What follows from keeping it in the pack:

- Only Demo Builder shows it. The Data Installer's own screens will not.
- Packs saved before the change show no owner, as today, until they are saved again.
- A colleague's pack then shows "Owner: <name>" in the panel, where today the row is left out
  (`d770c17e0`).
- Reversible by construction: turning the setting off, then saving again, writes a version with
  no name.

Rejected: a name field in the library itself. Its `create-datapack` takes no such field today
(read in the local `dsc-data-installer-api` clone at `3ced647`), and the owner does not want to
ask that team for one.

## Shipped so far

- 2026-10-31  docs(backlog): DI-10 keeps the saver's name in our own packs, as their setting (`f10750fed`)
- 2026-10-31  docs(backlog): DI-10, a colleague's shared pack should say who made it (`8336bc228`)
- 2026-11-23  Loop 2026-11-23, design (not built). Where the record can live: a library pack is only create-datapack metadata (name, version, display_name, description, shared) plus one add-data-item per data type (services/datapackTransfer.ts writePackToStore, the one writer every save goes through); update-datapack-metadata takes display_name, shared and team only. Options: (A) a sibling pack '<name>-owner', as the settings layer is stored (datapackCatalog.ts withoutLayerCards): no server change, but delete, trim and copy-to-installer must carry or drop it, and the panel needs a second read; (B) an owner-name field on our store's metadata: simplest to read, needs a store change; (C) a data item of its own: rejected, installs refuse unknown kinds (runPack.ts unsupportedKinds) and the panel and get_datapack would list it. Zips are easy either way: datapack.json accepts an optional field without a format bump (datapackZip.ts readManifest ignores unknown fields), but a name read from a zip is untrusted and must not show as the verified saver. Identity: nothing in the extension host reads the SC's name today; the IMS profile call (daLiveAuthService.ts:225, ims/profile/v1) returns it, or the access token's claims may (imsTokenClaims.ts decodes them; name/email not verified). Setting: copy demoBuilder.ai.requireAgentConsent (package.json:479, no scope = user) as demoBuilder.dataInstaller.recordSaverName, default true. Owner decision: A or B? Recommended B if our store can take the field (one read, nothing to keep in step), else A.
