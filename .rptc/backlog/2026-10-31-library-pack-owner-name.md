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

## Recommendation

Record the saver's own name and email from their Adobe sign-in **when the pack is saved**.
Demo Builder already holds the signed-in profile, so nobody types anything, and the name is only
seen by people the saver chose to share with.

Where to put it is the open question, and it is the library's choice, not ours (we never change
the Data Installer service's code):

1. **A field in the library** (`owner_name` or similar on `create-datapack` /
   `update-datapack-metadata`). Cleanest: every reader gets it, including the service's own UI.
   Needs the library team. Its `create-datapack` today takes `owner`, `description`, images,
   `shared` and `datapack_type` only (read in the local `dsc-data-installer-api` clone,
   `actions/database/createDatapack.js`, at `3ced647`). Whether the LIBRARY deployment uses the
   same handler, and whether its `owner` is the permission key (so it cannot be reused for a name),
   is unverified.
2. **Inside the pack**, as a small record Demo Builder writes and reads. Ours alone, but only
   Demo Builder would show it.

Either way, packs saved before the change keep showing no owner. Check first whether the library
team already plans an owner name.
