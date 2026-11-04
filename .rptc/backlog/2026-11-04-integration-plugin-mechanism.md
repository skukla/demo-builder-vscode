---
id: PL-92
kind: question
area: platform
needs: []
value: med
status: open
---

# What plug-in contract lets an SC's own integration bring its extension behaviour?

Filed 2026-11-04 from the PL-91 audit. Owner's direction (§9 of
`.rptc/research/libraries-outside-the-extension/research.md`): explore it. Planning only; not for
beta.153.

## The question

The ERP integration is an App Builder application in its own GitHub repository, plus 67 files
and 11,223 lines of extension code (dashboard handlers and dialogs, 18 MCP tools, fill and reset
steps, setup fixes, wizard copy). An SC who writes their own integration, a PIM for example,
can publish the application the same way. They cannot bring the extension-side part: it is
wired in by imports (`dashboardHandlers.ts`, `actionDescriptors.ts`, `fixRegistry.ts`), not by
anything a repository can declare.

What contract would let the extension-side functionality travel with the integration?

## What the audit already measured (do not redo)

Three shapes, sized in §6 of the research:

| Shape | Covers | Size | Precedent here |
|---|---|---|---|
| (a) Manifest-only: the row declares, generic code acts | Settings, deploy, undeploy, screen, reset route, setup checks from the existing fix registry | A release ([[AB-84]]) | `envSchema`, `screen`, `wipe`, `setupSteps` exist today |
| (b) A webview bundle from the integration repo | Screens only; nothing host-side | A programme, incomplete alone | None. CSP allows only scripts the extension serves |
| (c) A VS Code extension per integration | Host code legitimately | A programme | None. `extensionDependencies` 0; `getExtension` used 3 times, on our own manifest |

The audit recommended not building (b) or (c) because the only customer today is the ERP,
which we own. The owner overruled that: the point is the SC who is not us.

## What the exploration must answer

1. How much of the ERP's 11,223 lines is reachable by growing (a): more declarative flags
   (a tile spec, tool declarations that map to generic handlers, lifecycle steps by name)
   versus what genuinely needs code (ownership rules, downtime, order trace).
2. For the code part, which host is safe. Loading code from a repository into our extension
   host runs an SC's code with our Adobe sign-in and our cloud guard chain around it
   (property 5, confirmed cloud writes). (c) is the sanctioned way VS Code runs contributed
   code; what the contributed extension would need from us is a registration API for MCP tool
   rows, dashboard tiles and lifecycle hooks.
3. How the five never-compromise properties are kept in a second repository our `tests/sop/`
   cannot see: reversal, the ADR-013 write seam, `AI_CONTEXT_VERSION`, public-repo hygiene,
   confirmed cloud writes.
4. Whether the ERP itself would move onto the contract (the proof that it is real) or stay
   bundled as the reference implementation.

## Closes when

A design is written with a recommendation the owner accepts, and the work is filed as an
epic with features. Prior research to read first: `app-builder-integration-model`,
`erp-integration`, `multi-erp-integration-shape`, `component-specific-wizard-steps`,
`integration-release-updates`.
