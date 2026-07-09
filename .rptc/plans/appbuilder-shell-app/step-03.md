# Step 3 — Runtime API access MCP tools (the real feature)

## Goal

The user's AI session can discover and add Adobe API access on the demo workspace
credential — closing the gap a blank shell exposes ("I want Firefly later, the catalog
entry couldn't know that").

## Tools (in-extension MCP server, handler-backed descriptors)

1. **`list_console_apis`** (read): returns the org's subscribable services via
   `getServicesForOrg` (auth service / entity services surface), each with service code +
   display name, flagged `subscribed: true` when already on the workspace credential.
   No hardcoded service codes — entitlements are org-specific.
2. **`add_console_apis`** (action): input `{ apis: string[] }` (service codes). Guard order
   mirrors the deploy tools: org-context (`withOrgContext` +
   `detectProjectOrgMismatch`) + Developer/System-Admin role gate. Delegates to
   `apiSubscriber` (`src/features/app-builder/services/apiSubscriber.ts`) — the ONE
   subscription implementation; no fork.

## Persistence (decision: recommended YES)

`reconcileRequiredApis` subscribes the union of catalog `requiredApis` + baseline. An
AI-added API is outside that union — the next component add/remove would re-reconcile
and could strip it. Persist ad-hoc additions in the project manifest (e.g.
`additionalConsoleApis: string[]`) and include them in the union inside `apiSubscriber`.
Check first how the subscribe call treats already-present services (additive vs
replace-list — `subscribeOAuthServerToServerIntegrationToServices` semantics decide how
careful the union must be; the appbuilder-api-subscription lore says the platform list is
replace-shaped, which makes the union MANDATORY).

## Registration

- New descriptor rows (like `ACTION_DESCRIPTORS` / read descriptors in
  `src/features/ai/server/`), so logging, org guards, and headless handler context come
  free. Zod input schema on `add_console_apis`.
- Tool docs must say when to use them (the shell's AGENTS.md references them by name).

## TDD

- Descriptor tests (pattern: `actionDescriptors.test.ts`): schema validation, handler
  dispatch, role-gate refusal, org-mismatch refusal.
- `apiSubscriber` union test: catalog APIs + baseline + `additionalConsoleApis` dedup.
- Persistence round-trip: add via tool → manifest carries it → reconcile keeps it.

## Out of scope

- Product-profile-requiring services (licenseConfigs) beyond a clear error message — the
  first version handles plain OAuth S2S subscribable services; profile-bound ones report
  "needs Developer Console" with the deep link.
