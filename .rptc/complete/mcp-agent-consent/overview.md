# Native consent for destructive MCP operations (legs 1 + 2 of the three-leg design)

**COMPLETE 2026-08-24** — all six steps executed on `feature/mcp-agent-consent`.

Source: `../2026-08-23-mcp-destructive-ops-native-consent.md` (shipped with this plan).
Leg 3 (visibility) shipped 2026-08-23 (`agentOperationNotifier.ts`). This plan
lands the consent dialog and the traversability fixes, designed together as the
item requires. Branch: `feature/mcp-agent-consent`.

## Design decisions (the item's open trade-offs, settled)

1. **Which tools get the dialog: any call carrying `confirm: true`.** Not the
   name-shape allowlist (that classifies VISIBILITY; using it for consent
   dialogs every cheap mutation — rename, save-prompt — recreating the
   friction the traversability half forbids), and not a hand list (the item's
   own warning). `confirm: true` is the surface's OWN curated definition of
   destructive — the descriptor registrar plus ~15 direct tools already gate
   on it — and it is exactly the honor-system parameter the item says nothing
   verifies. New destructive tools that follow the convention are covered for
   free; a call WITHOUT confirm gets the handler's existing prose refusal and
   no dialog.
2. **Batch/fatigue:** one dialog per confirm-carrying CALL. Pipeline tools
   (`reset_eds_project`) confirm once; their internal steps are not tool calls.
3. **Headless escape hatch:** `demoBuilder.ai.requireAgentConsent` (boolean,
   default **on**), read live per call so flipping it needs no restart.
4. **Dialog:** modal `showWarningMessage` (a QuickPick can dismiss on focus
   loss — the exact sign_in failure mode; a non-modal toast can be missed and
   the agent hangs to timeout). Detail shows scalar args (60-char truncation,
   `confirm` skipped, keys matching /token|secret|password|credential/i
   masked) — informed consent needs values, logging's keys-only rule stays
   logging-only.
5. **Decline returns a prose refusal envelope** (`asRawText`), not a thrown
   error: the agent gets a well-shaped answer naming what happened and that
   the user declined, without the handler ever running.
6. **Seam:** the server module stays vscode-free — it gains
   `callRequestsConsent` + an injected `consentGate` option checked BEFORE the
   notifier; the vscode dialog lives beside the notifier in
   `agentOperationNotifier.ts` and is wired from `extension.ts`.
7. **sign_in(dalive) traversability:** fire-and-forget the QuickPick flow,
   return immediately with poll-`get_auth_status` instructions, raise a
   status-bar attention line, land the eventual outcome (status bar on
   success; log otherwise — a user's own cancel is not toast-worthy).
   Deliberate behavior change; its test updates with it.
8. **Guidance (generated bundle):** AGENTS.md front-loads `get_auth_status`
   before multi-step flows and documents the consent dialog + setting →
   `ai-context-authoring` seams, AI_CONTEXT_VERSION bump.

## Steps

1. Server seam: `callRequestsConsent` + `consentGate` option + ordering
   (consent → notifier → handler), pinned over the socket.
2. `createAgentConsentGate` (setting read, modal, refusal, arg rendering).
3. Wire in `extension.ts` + `package.json` setting.
4. `sign_in(dalive)` immediate return.
5. Generated-bundle guidance + AI_CONTEXT_VERSION bump.
6. Docs (`mcp-server.md`), backlog item close-out, full gate.
