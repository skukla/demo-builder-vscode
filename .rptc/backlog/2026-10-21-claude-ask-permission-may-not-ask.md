---
id: AI-77
kind: fix
area: ai
needs: []
value: med
status: backlog
---

# The "ask" permission setting may not make Claude Code ask

Filed 2026-10-20, found while researching EDS-57. Unverified on a real launch.

`demoBuilder.ai.permissions: ask` adds no flag to the `claude` command
(`src/features/ai/engine/chatLaunch.ts:24`, `ask: ''`). Anthropic's permission-modes page
("Which mode a session starts in", https://code.claude.com/docs/en/permission-modes) says
that from v2.1.228 a session with no flag and no `defaultMode` setting starts in **auto**,
not the ask-every-time mode. This machine runs 2.1.305. If the page is right, an SC who
chose "ask" gets auto-approved edits.

## To verify first

Launch `claude` with no flag in a scratch folder with no settings and read the mode it
shows. If it is auto, the fix is `ask: ' --permission-mode default'`, with its test.
