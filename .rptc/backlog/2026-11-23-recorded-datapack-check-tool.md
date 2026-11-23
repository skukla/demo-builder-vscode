---
id: AI-83
kind: feature
area: ai
needs: []
value: low
status: backlog
---

# An agent can check a settings file's datapack before creating from it

Filed 2026-11-23, from AI-79's triage of the coverage scan (owner chose to build it the same day).

The screen runs `check-recorded-datapack` on a settings file before creating a project from it: is
the datapack it records still there, and can this SC get it? An agent sees that verdict only inside
`create_project_from_file`, as its `datapackNote` before `confirm:true`
(`.claude/skills/ai-coverage-scan/triage.json`, `check-recorded-datapack`). Lower value than AI-82,
since that verdict already arrives before anything is created; the gain is checking a file without
starting a creation.

Done when an agent can ask for the verdict on its own, through the same `checkRecordedPack` the
screen and `create_project_from_file` use, and the triage entry is removed.
