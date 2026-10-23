---
id: EDS-63
kind: fix
area: ai
needs: []
value: med
status: active
---

# The agent's `republish` does what the dashboard's Republish does

Filed 2026-10-23, from the JustRite reset walk.

## What was wrong

Three names, two jobs:

| Surface | Name | What it ran |
|---|---|---|
| Dashboard button | **Republish** | `republishStorefrontContent`: settings, code (`previewCode('/*')`), every DA.live page, category pages |
| Agent tool | `republish` | `republishStorefrontConfig` only: config.json to GitHub and the CDN |
| Agent tool | `sync_content` | `republishStorefrontContent`: the button's job |

Found when JustRite's reset left its site on old code and the fix was "Republish".
The agent tool by that name would have republished the settings file and nothing
else, while reporting success. The button's job was reachable by an agent only under
another name.

The settings-only publish has no button of its own: it runs inside other flows (mesh
deploy, a settings save, the authoring-experience switch, site repair), each of which
already publishes config.json itself. An agent never needed it as a tool.

## Decision (owner, 2026-10-23: "take it on now")

One agent tool, `republish`, running exactly what the button runs, with the
button's result. `sync_content` is removed (no soft deprecation): its job is now
`republish`'s. The generated agent instructions that named `sync_content` name
`republish`, with an AI bundle version bump so existing projects are refreshed.

## Shipped so far

- 2026-10-23  Built, not committed: republish runs republishStorefrontContent (the button's publish); sync_content removed; four generated skills renamed, AI_CONTEXT_VERSION 44; docs, catalog and pins updated; full suite green
