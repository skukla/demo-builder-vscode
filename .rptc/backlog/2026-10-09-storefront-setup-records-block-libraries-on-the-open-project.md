---
id: EDS-37
kind: fix
area: eds
needs: []
value: med
status: backlog
---

# Storefront setup recorded its block libraries on the wrong project

Filed 2026-10-09.

When the wizard's storefront setup installed the selected block libraries, it saved
the record of what it installed (`installedBlockLibraries`) onto
`getCurrentProject()`. In the wizard that is whatever project was open BEFORE the
wizard, not the project being created, which does not exist yet at that point.

Two consequences, both measured on 2026-10-08 from logs and project files:

1. **The new project had no record.** Its next startup update check
   (`findUninstalledBlockLibraries`) offered "<Library>: install" for every selected
   library, and applying it answered "<Library> is already in <project>." Seen for
   `justrite-copy` and `my-commerce-demo`.
2. **The open project's record was replaced.** The write was `=`, not an append, so
   Justrite ended up carrying a "Demo Team Block Collection" record it never
   selected, with both records stamped with my-commerce-demo's setup time. Repaired
   by hand on 2026-10-09 with the owner's OK.

The same handler serves the agent's `create_project` (and so
`create_project_from_file` and `copy_project`), so agent-created EDS projects had the
same bug. Edit had it too: setup wrote to whichever project was open, and then the
edit rebuilt the edited project without any record at all.

## The fix

Storefront setup no longer saves any project. It hands the records back on its
result, the same way it already hands back the broken-links list, and project
creation saves them onto the project it creates or edits (by path). An edit that
installed nothing keeps the records the project already had.

Projects made before the fix have no record. Their next update check offers each
selected library once; applying it records it. No migration needed.

## Shipped so far
