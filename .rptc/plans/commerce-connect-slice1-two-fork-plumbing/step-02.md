# Step 2: Content-SC Wizard Entry (reusing `WizardContainer`)

**Purpose:** Add a second wizard entry point — the **content-SC wizard** — that
**reuses** the existing `WizardContainer` and seeds the wizard with
`flow: 'content'`. No new wizard UI shell; only a new launch command + the flow
seed propagated into wizard state.

**Prerequisites:**
- [ ] Step 1 complete (`flow` on the model)
- [ ] How the existing wizard command is registered and launched
  (`src/commands/commandManager.ts` + `src/commands/handlers/`) understood
- [ ] `WizardContainer.tsx` initial-state wiring understood (how the existing
  command passes initial config into the webview)

---

## Tests to Write First

### Unit: `tests/commands/createContentScProjectWebview.test.ts`
- [ ] **Command is registered** under its own id (e.g.
  `demoBuilder.createContentScProject`) via the command manager.
- [ ] **Launch seeds `flow: 'content'`** into the wizard initial state/message.
- [ ] **Existing create command unchanged** — still seeds `flow: 'commerce'`
  (or omits it, resolving to commerce). Regression assertion.

### React: `tests/.../WizardContainer-flow.test.tsx`
- [ ] **WizardContainer accepts an initial `flow`** and stores it in wizard state.
- [ ] **`flow` is forwarded** in the creation payload sent to the executor.

---

## Files to Create/Modify
- [ ] `src/commands/handlers/createContentScProjectWebview.ts` — new launch handler (mirrors the existing create handler; sets `flow:'content'`)
- [ ] `src/commands/commandManager.ts` — register the new command id
- [ ] `package.json` — contribute the command (title e.g. "Demo Builder: Create Content SC Storefront")
- [ ] `src/features/project-creation/ui/wizard/WizardContainer.tsx` — accept + store initial `flow`; include `flow` in the creation payload
- [ ] `src/types/webview.ts` — add `flow` to `WizardState` (if state is typed there)
- [ ] test files above

---

## Implementation Details

### RED
Tests assert registration + flow seeding; they fail (command/flow not present).

### GREEN
- Extract or parameterize the existing create-project launch so the content
  variant reuses it with `flow: 'content'`. **Prefer a single shared launch
  helper** that both commands call with a `flow` argument over duplicating the
  webview setup (DRY; avoids a parallel command implementation).
- Add `flow` to `WizardState`; default `'commerce'`. Forward it in the payload
  that becomes `ProjectCreationConfig` (Step 1 already accepts it).

### REFACTOR
- If the existing and content launch differ only by `flow` + title, keep one
  helper and two thin registrations — do not fork the whole command.
- Defer any content-specific *branding/copy* to JIT; this step is plumbing only.

---

## Acceptance Criteria
- [ ] New command registered and contributes a palette entry.
- [ ] Launching it opens the existing wizard with `flow: 'content'` in state.
- [ ] The flow value reaches the executor payload.
- [ ] Existing create command/flow path unchanged (regression test green).
- [ ] No duplicated wizard shell; shared launch helper.

**Estimated time:** 3–4 hours
