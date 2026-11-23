---
id: PL-91
kind: question
area: platform
needs: []
value: med
status: spiked
---

# Should the other libraries live outside the extension, the way datapacks now do?

Filed 2026-11-04 from an owner idea, logged while the window-header work ran.

## The observation

The extension has four things that are libraries in all but name, and only one of
them lives outside the extension:

| Library | Where it lives today | Can an SC add to it? |
|---|---|---|
| Datapacks | Outside: the datapack store (database), see [[DI-5]] | Yes, and share it with the team |
| Integrations catalog | Inside: `src/features/components/config/components.json` plus per-integration code | No. A new integration is an extension release |
| Demo packages | Inside: `src/features/components/config/demo-packages.json` | No |
| Full demo library | Not built. Planned as [[EDS-13d]] | Open |

The question: could the other three work like datapacks, as content that lives
outside the extension, versioned on its own, that SCs contribute to?

## Why it is not just "move the JSON"

A datapack is only data, so a database row is enough. An integration is data plus
behaviour. The ERP integration ([[AB-9]]) brings its own dashboard tiles, settings
screens, MCP tools, reset steps and wizard copy. Moving its catalog row out of the
extension moves none of that. So there are two very different sizes of answer:

1. **Contributions are limited to what a catalog row can describe.** An App
   Builder app with a manifest, a settings schema, deploy and undeploy. The
   extension stays the only place behaviour lives. Cheap, and probably enough for
   demo packages, which are already pure configuration.
2. **The extension grows a plug-in mechanism.** A contributed integration can also
   bring screens, tools and lifecycle hooks. Expensive, and a new surface to keep
   the five never-compromise properties on (reversal, user edits, existing
   projects, public repo, confirmed cloud writes).

The audit's job is to find where that line sits for each of the three libraries,
not to pick one answer for all of them.

## What the audit should produce

- For each library: what the extension reads from it, and which of those reads
  are data and which are behaviour. The ERP integration is the stress case.
- What the datapack store already gives us that the others could reuse (the
  database, sharing, "Yours" / "Community" / team tagging, versioning).
- A recommendation per library: stays inside, moves as data, or needs the
  plug-in mechanism. With the plug-in mechanism sized, if any library needs it.
- How the planned demo library ([[EDS-13d]]) fits, so it is built on the answer
  rather than becoming a fifth inside-the-extension list.

## Closes when

The audit is written and the owner has chosen a direction per library. The work
that follows is filed as its own epic and features; this item is the reason they
exist.

## Shipped so far

- 2026-11-04  docs(backlog): the libraries audit and its decisions, filed as plan items (`c5e47a99e`)
