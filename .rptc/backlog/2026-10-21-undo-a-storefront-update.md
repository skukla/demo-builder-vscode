---
id: EDS-59
kind: feature
area: eds
needs: []
value: med
status: backlog
---

# A storefront update can be undone from the builder

Filed 2026-10-20 while building EDS-57; owner: "Yes" to filing it on its own.

Template, Adobe boilerplate and block library updates each push one commit to the SC's
storefront repository, which updates the live site. None has an Undo in the builder:
taking one back means `git revert` by hand, which no SC does. That breaks the first
property in CLAUDE.md ("whatever can be done can be undone"), and it predates EDS-57;
EDS-57 only adds one more way to make such a commit (finishing a clash fixed with AI).

## What it needs to answer

- What is undone: the update's commit (a revert commit, pushed), and the record it moved
  (`lastSyncedCommit`, `boilerplateBase.commit`, `installedBlockLibraries`), put back.
- How far back: the last update only, or any.
- What happens when later commits touched the same files (a revert that clashes).
