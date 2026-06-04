# Step 3: Flow-Aware Step Filtering

**Purpose:** Make `filterStepsForStack` flow-aware so the **content flow hides
the steps it doesn't need** — prerequisites and API Mesh — while keeping a
content-oriented "connect" step (Step 5) and the storefront/DA.live steps. The
commerce flow is unchanged. Flow is modeled as an **additional `StepCondition`
predicate composed with** the existing stack-property checks, not a replacement.

**Prerequisites:**
- [ ] `src/features/project-creation/ui/wizard/stepFiltering.ts` understood
  (conditions: `stackRequires`, `requiresAdobeIO`, `requiresAdobeAuth`,
  `showWhenNoStack`, `createModeOnly`)
- [ ] The wizard steps registry (the step list the filter is applied to) located
- [ ] Step 1 + 2 complete (flow exists and reaches the wizard)

---

## Tests to Write First

### Unit: `tests/.../stepFiltering-flow.test.ts`
- [ ] **Content flow hides `prerequisites`** step.
- [ ] **Content flow hides `api-mesh` / mesh-deployment** steps.
- [ ] **Content flow keeps** storefront/DA.live + the content connect step.
- [ ] **Commerce flow unchanged** — same steps as today for a given stack
  (regression: snapshot the commerce result before adding the predicate).
- [ ] **Absent flow == commerce** — legacy callers get today's behavior.
- [ ] **Composition:** a step with both a `flow` condition and a `stackRequires`
  condition is shown only when *both* pass.

---

## Files to Create/Modify
- [ ] `src/features/project-creation/ui/wizard/stepFiltering.ts` — extend
  `StepCondition` with an optional `flow?: 'commerce' | 'content'` (and/or
  `hiddenForFlow?`), and `FilterOptions` with the current `flow`
- [ ] The wizard step registry — tag prerequisites + mesh steps as
  commerce-only (or content-hidden)
- [ ] `tests/.../stepFiltering-flow.test.ts` — new

---

## Implementation Details

### RED
Add the flow tests; they fail (no flow concept in the filter).

### GREEN
Extend the condition type:
```typescript
export interface StepCondition {
    // …existing…
    /** Show this step only for the given flow. Absent ⇒ all flows. */
    flow?: 'commerce' | 'content';
}
export interface FilterOptions {
    // …existing…
    /** Current wizard flow; defaults to 'commerce' when absent. */
    flow?: 'commerce' | 'content';
}
```
In `filterStepsForStack`, after the `createModeOnly` check and before the
stack-property checks, add:
```typescript
const currentFlow = options.flow ?? 'commerce';
if (step.condition?.flow && step.condition.flow !== currentFlow) {
    return false;
}
```
Tag the **prerequisites** and **mesh** steps in the registry with
`condition: { flow: 'commerce' }` (additive; commerce keeps them, content drops
them). Keep DA.live/storefront steps untagged so both flows see them.

### REFACTOR
- Prefer the single `flow` equality predicate over a bespoke `hiddenForFlow`
  list unless multiple flows need exclusion (YAGNI).
- Ensure `WizardContainer` passes `options.flow` from wizard state into the
  filter call.

---

## Acceptance Criteria
- [ ] Content flow: no prerequisites, no mesh steps.
- [ ] Commerce flow: identical step set to today (regression snapshot green).
- [ ] Combined flow + stack conditions compose with AND semantics.
- [ ] 100% coverage on the new filter branch.

**Estimated time:** 3–4 hours
