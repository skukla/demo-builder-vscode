---
id: AI-1p
kind: feature
area: ai
needs: []
value: high
status: backlog
---

# Nothing checks that the AI bundle we ship is internally consistent

Two defects shipped in the generated bundle and survived a full green suite,
because every test asserted the bundle against its own fixtures rather than
against reality.

## The two that got through

- **[[AI-1m]]** — six storefront skills read from the storefront checkout, a
  directory that has never contained them. `copyAdobeSkillBundle` ENOENT-skips
  by design, so every project ever created shipped without them. The fixture
  named the same wrong path and the `readdir` mock answered whatever it was
  handed.
- **[[AI-1o]]** — the App Builder skill set installed on projects with no App
  Builder app.

Neither is a logic bug. Both are the bundle being incoherent with the project,
which no test was ever asked to look at.

## The invariants worth asserting

Flat, cheap, runnable every commit:

1. **Skill set matches the project shape.** A storefront project gets Storefront
   skills; an integration project gets App Builder skills. See [[AI-1o]].
2. **Every bundle source path resolves in the installed package.** Read the real
   `.demo-builder-mcp/` tree, not a fixture. This alone catches AI-1m.
3. **Every skill that drives an MCP tool ships with that MCP.**
   `SKILL_MCP_TOOL_DEPENDENCIES` already declares the mapping; nothing checks the
   pairing end to end.
4. **Every user-facing name traces to a source.** Each label in
   `SERVER_LABELS` / `BUNDLE_LABELS` carries the doc URL or package field it was
   read from. On 2026-08-26 four of six labels were wrong — "Adobe App Builder"
   for a server Adobe calls "Adobe Commerce App Builder MCP", "Adobe AEM" for a
   skill set Adobe calls Storefront skills — and correcting them took two rounds
   of research because nothing recorded where any name came from.

## Not the battery

The prompt battery answers "does the agent USE this?" — behavioural, live, run
at release. This answers "is what we shipped coherent?" — static, run every
commit. Filing them together gets neither: one needs a live agent and minutes,
the other needs a second and no network.

## Open

- **Where does it live?** A suite under `tests/templates/` beside the other
  ratchets is the obvious home, but invariant 2 wants a real installed package,
  which a unit test does not have. Possibly a scan script run against a real
  project, as `mcp-live-probe` is to the server tests.

Filed 2026-08-26.
