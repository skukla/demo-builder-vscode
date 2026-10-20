---
id: AI-76
kind: fix
area: ai
needs: []
value: high
status: active
---

# An agent's write stops when the open project moved under it

Filed 2026-10-20 by the owner, after an add aimed at the wrong project. Follows AI-15.

## What happened

An agent following the person's open project called `add_integration` for Justrite. The
open project had become `patch-canary-b2b` in the meantime, so the add ran against that
project instead. It stopped only because that project had no Adobe project to deploy into.
(The running build predated AI-15, but AI-15 would not have stopped it either.)

## The gap AI-15 left

AI-15 tells an agent that is still following the person's project when that project
moved, as one extra line on the answer (`projectChangeNotice.ts`). The line arrives on the
answer to the call that already ran against the new project. For a read, that is a wrong
answer the agent can discard. For a write, the change has landed. The plan's "Known limit"
section does not name this.

## The change

- A tool that changes something (it does not declare `readOnlyHint: true`, the same
  fail-closed rule the dry run uses) does not run when the open project moved since the
  agent's last call. The answer is an error naming both projects: call again to act on
  the new one, or `set_current_project` to go back.
- Calling again is the agent's confirmation: the refusal records the new project as seen.
- `set_current_project` and `create_project` are exempt. They choose the project rather
  than act on it, and the first is the way out of the refusal.
- Reads keep AI-15's notice.

## Stated limit

The first call on a new connection has no earlier project to compare with, so nothing
stops it. An agent that has not looked at the project yet is not protected by this.
