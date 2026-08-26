---
id: AI-1m
kind: fix
area: ai
parent: AI-1
needs: []
value: high
status: backlog
layer: C
---
# The storefront skills we mean to install have never installed, silently

## Index hook

> **Re-scoped 2026-08-26.** This item once carried a second claim — that the agent
> never reaches `dropins` and must be told the server exists. **That was
> disproven the same day.** Asked something only `dropins` can answer ("which
> slots does the product-list block expose?"), the agent called
> `mcp__dropins__list_slots` on its FIRST call, by name, twice out of two. The
> seven runs showing zero `dropins` use were the wrong prompt: `cross-no-products`
> is answerable from the catalog and the rendered page, so not reaching for
> `dropins` was correct, not a miss.
>
> A "Your MCP Servers" section shipped in `AI_CONTEXT_VERSION` 24 on that
> disproven theory. It STAYS — telling an agent what servers it has is reasonable
> on its own merits — but it is not evidence-backed and must not be cited as a fix.
>
> What remains below is the half that IS verified: **the six storefront skills
> have never installed.**


*The item in one paragraph.*

**An EDS project gets the App Builder skill set and none of the six STOREFRONT
skills, and the code that was meant to install them fails silently by design.**
Adobe ships an AEM Boilerplate Commerce skill set — project manager, researcher,
block developer, drop-in developer, content modeler, tester — for exactly the work
a demo producer does on a storefront
([docs](https://experienceleague.adobe.com/developer/commerce/storefront/ai/boilerplate-skills/)).
We already DECLARE it: the EDS storefront component carries
`aiSkillBundle: { path: "aem-boilerplate-commerce/skills", prefix: "aem" }`. It
has never produced a single file. Two reasons, either fatal: the path resolves to
`<storefront>/node_modules/aem-boilerplate-commerce/skills` and **the storefront
IS `@adobe/aem-boilerplate-commerce`** — we look for the package inside itself —
and the boilerplate repo ships no `skills/` directory at all, because Adobe
installs them with `aio commerce extensibility tools-setup`. `copyAdobeSkillBundle`
ENOENT-skips silently on purpose, so it has looked installed since the day it was
written. Raised by the owner 2026-08-26. Filed 2026-08-26 as `EDS-10`, renumbered to `AI-1m` the same day. It is not an EDS
item: skills are what prompts are orchestrated ACROSS, so which skills an agent
carries is surface work whatever product it touches. The owner made that call —
"it's going to affect how we orchestrate prompts across all of these skills".
Commit `cd5cc668f` still carries the old trailer.

## What a project actually has

Verified in `bodea`, an EDS + ACCS project:

| skills present | source |
|---|---|
| `appbuilder-architect`, `appbuilder-developer`, `appbuilder-devops-engineer`, `appbuilder-product-manager`, `appbuilder-technical-writer`, `appbuilder-tester`, `appbuilder-tutor` | integration starter kit |
| our own 13 (`create-eds-project`, `refine-visual-match`, …) | `skillsWriter` |
| **zero `aem-` prefixed** | the declared bundle, which never ran |

The near-miss worth naming: there IS a `tester` — `appbuilder-tester`, which is
about App Builder actions. The boilerplate `tester` verifies a storefront in a
browser and checks Core Web Vitals. Different job, similar name, and the presence
of one makes the absence of the other invisible.

## Why it never ran

    aiSkillBundle.path = "aem-boilerplate-commerce/skills"
    resolved against    = instance.path  (the storefront checkout)
    so it looks in      = <storefront>/node_modules/aem-boilerplate-commerce/skills

`<storefront>/package.json` says `"name": "@adobe/aem-boilerplate-commerce"`. The
storefront is the boilerplate; it does not depend on itself. And `find` over the
whole checkout returns no `skills/` directory, so even a corrected path would
find nothing — the skills are not IN the repo.

`copyAdobeSkillBundle` treats ENOENT as "this component doesn't have the Adobe
package" and returns. That is reasonable for a genuinely optional bundle and it
is why nobody noticed: the mechanism, the declaration and the silence all look
correct.

## How Adobe installs them

    aio commerce extensibility tools-setup --starter-kit aem-boilerplate-commerce \
      --agent "Claude Code" --package-manager npm

That installs `@adobe-commerce/commerce-extensibility-tools` as a dev dependency
and writes the skills into `.claude/skills/`, plus an `AGENTS.md` and an MCP
config for `commerce-extensibility:search-commerce-docs`.

**We already run part of this**: `commerce-extensibility` is one of the four MCP
servers in a project's `.mcp.json`. So the tooling is installed and its skills
are not — which suggests we invoke the installer for the MCP server and take a
different route for skills.

## Open

- **Copy, or invoke the installer?** The `aiSkillBundle` mechanism copies from a
  package; Adobe's own path is a CLI that writes into `.claude/skills/`. Running
  their installer keeps us current as the set changes; copying keeps us in
  control of what lands. Check what the installer does to an existing
  `AGENTS.md` before choosing — ours is generated and hash-guarded (ADR-013).
- **Does it collide with our skills?** Adobe's set includes a `tester` and a
  `researcher`; we ship `refine-visual-match` and `scrape-reference-site`, which
  overlap in intent. Decide precedence before installing, not after.
- **Which projects?** Storefront skills belong to EDS projects. The gate already
  exists (`aiToolingGate`), but this is a different axis from the App Builder one.

## Why `high`

Every EDS demo is storefront work, and the agent doing it is missing the six
skills Adobe wrote for that job while carrying seven for a job it is not doing.
This is also the first known case of a silent-skip hiding a whole feature — worth
checking whether any other `aiSkillBundle` declaration has the same shape.

Filed 2026-08-26.

## Shipped so far

- 2026-08-26  Filed as EDS-10 and renumbered to AI-1m (cd5cc668f) — it is AI-surface work, not EDS: which skills an agent carries determines what prompts can be orchestrated across.
- 2026-08-26  SIZED honestly. dropins is still used ZERO times across five runs on three rigs, so the gap is real — but on a clean rig it costs 4 shell calls, not the 43 I first reported. Build the guidance; do not quote the old number.
- 2026-08-26  RE-SCOPED. The 'agent never reaches dropins' half is DISPROVEN — given a question only dropins can answer it calls mcp__dropins__list_slots on the first call, 2/2. The seven zeros were the wrong prompt. The AGENTS.md server section stays but is not evidence-backed. The verified half remains: the six storefront skills never install.
