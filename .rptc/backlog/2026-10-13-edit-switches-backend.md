---
id: PL-78
kind: feature
area: platform
needs: [PL-75]
value: med
status: backlog
---

# Edit switches a project's Commerce backend

Filed 2026-10-13 by the owner, who wants it built before the release, after rating a
backend switch rare earlier the same day. One of four switches PL-75 left locked in Edit
because no operation exists for them (see
`.rptc/plans/edit-applies-only-what-changed/overview.md`).

## How it would work

1. Regenerate the project's connection settings (`.env`, `config.json`) for the new backend.
2. Point the storefront at the new Commerce instance.
3. Uninstall the integrations from the old Commerce and install them on the new one,
   undoing what they set on the old one first (the ERP integration's removal already
   does this kind of cleanup).
4. Remove the datapack from the old instance and import it into the new one.
5. One confirmation before any of it, naming what leaves the old instance.

The undo is switching back.

## Known so far

- Today Edit's rebuild regenerates `.env` and `config.json` and re-imports the datapack,
  and appears to leave the old instance's data (inferred in
  `.rptc/research/edit-configure-architecture/research.md`, not measured).
- Changing the backend resets the Commerce settings and block libraries in Edit
  (`ui/steps/editLocks.ts`), so the Commerce area has to be filled in again.
- The largest of the four after the stack switch (an estimate).
- Plugs into PL-75's apply path, so it waits on that.
