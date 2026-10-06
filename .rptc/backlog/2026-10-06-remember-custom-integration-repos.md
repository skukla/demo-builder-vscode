---
id: AB-68
kind: feature
area: app-builder
needs: []
value: med
status: active
---

# Remember custom integration repos across projects

Filed 2026-10-06, during the settings-section audit for the release candidate.

**What exists.** The Add Integration modal's "custom" stage (`CustomStage.tsx`) takes a
public GitHub repo URL and adds it as an integration to THAT project. It works.

**What never existed.** `demoBuilder.appBuilderComponents.custom` was declared in
`package.json` (as `deployables.custom` in `71a5ccf8e`, renamed in `65c40b04a`) promising
that listed repos would appear in the integration catalog for every new project. No code
ever read it, and the modal never wrote it; its only other reference was the agent
settings allowlist. A SC who filled it in got nothing and was told nothing. The setting
was deleted on 2026-10-06 rather than left accepted-but-ignored.

**The feature.** Mirror `demoBuilder.blockLibraries.custom`: repos added through the
modal are remembered in a user setting and offered as catalog entries on the next
project's Integrations area (and the dashboard's Add Integration). Re-add the setting in
the same change that adds its reader and writer, with a regenerate/existing-project story.

## Shipped so far

- 2026-10-06  chore(settings): remove demoBuilder.appBuilderComponents.custom, which nothing read (`cb0f5812d`)
