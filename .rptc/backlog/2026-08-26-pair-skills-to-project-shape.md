---
id: AI-1o
kind: fix
area: ai
needs: []
value: high
status: shipped
---

# Every project gets the App Builder skills, including projects with no App Builder app

One gate decides both MCP servers and skill sets, so a storefront-only project
receives the skill set written for back-office App Builder integrations.

## Verified

`bodea` on disk, 2026-08-26. `componentInstances` is `['eds-storefront']`.
No mesh. `appBuilderComponents` is empty. Its `.claude/skills/` holds all seven
`appbuilder-*` skills, and — until [[AI-1m]] shipped the same day — zero
storefront skills.

The `architect` skill it received opens:

> You are an **Expert Adobe Commerce Solutions Architect** specializing in
> modern out-of-process extensibility using **Adobe Developer App Builder** and
> the **Adobe Commerce Integration Starter Kit**.

That is a false statement about the project it is installed in.

## Cause

`projectNeedsAppBuilderTooling` returns true when a project has an EDS
storefront. That is CORRECT for the MCP server — storefronts do use Commerce
extensibility — and wrong for the skills, and nothing separates the two.
`skillsWriter` calls the integration-starter-kit copy behind that same
predicate.

## What Adobe does

One MCP plus its matching skill set per project template, chosen at install:

> installs the `@dropins/mcp` server and a set of storefront-specific agent
> skills, alongside the standard `commerce-extensibility` MCP server and App
> Builder skills
> — developer.adobe.com/commerce/extensibility/developer-agent/dropins-mcp-server

Storefront project gets Storefront skills. Integration project gets App Builder
skills. Never both by default.

## Open

- **Does a storefront project with a mesh want App Builder skills?** A mesh is
  App Builder-adjacent, so probably yes — which means the rule is per-skill-set,
  not per-project.
- **Reconciling existing projects.** Removing a delivered skill needs ADR-013
  positive proof of ownership. The removal matrix already handles it; confirm it
  covers whole bundle directories, not just top-level files.
- Do NOT resolve this by deleting the App Builder skills outright. [[AB-1d]]
  makes them correct for integration projects.

Filed 2026-08-26.

## Shipped so far

- 2026-08-27  SHIPPED. Split projectNeedsAppBuilderTooling into two predicates: the union still gates the MCP server (a storefront really does call search-commerce-docs), and the new projectBuildsAppBuilderApps — mesh or attached component — gates the skill set. Existing storefronts reconcile on the sweep: removeAdobeSkillBundle walks the RECORDED HASHES rather than the directory, so removal only touches files we can prove we wrote; a user-edited skill is kept and reported. AI_CONTEXT_VERSION 25 to 26. Three tests added, two of which fail against the old gate (verified by reverting).
