# Step 1: Project Model — `flow` discriminator, `upstream`, and flow predicates

**Purpose:** Add the additive data model that the whole slice hangs off:
a `flow` discriminator (`'commerce' | 'content'`) and an `upstream{owner,repo}`
reference on `Project`, plus typed predicates so every downstream branch reads a
predicate rather than re-deriving flow. Absent `flow` ⇒ treated as `'commerce'`
(today's behavior) for full backward compatibility.

**Prerequisites:**
- [ ] `src/types/base.ts` `Project` (line 42) read and understood
- [ ] `src/types/typeGuards.ts` existing guards (`isEdsStackId`, etc.) understood
- [ ] `ProjectCreationConfig` in `executor.ts` understood

---

## Tests to Write First

### Unit: `tests/types/flowPredicates.test.ts`

- [ ] **`getProjectFlow` defaults to `'commerce'` when `flow` absent**
  - Given a legacy `Project` with no `flow` → returns `'commerce'`.
- [ ] **`getProjectFlow` returns `'content'` for a content project**
  - Given `{ flow: 'content' }` → returns `'content'`.
- [ ] **`isContentFlow` true only for content**
  - `isContentFlow({flow:'content'})` → true; `isContentFlow({})` → false.
- [ ] **`isCommerceFlow` true for commerce and for legacy (absent)**
  - `isCommerceFlow({flow:'commerce'})` → true; `isCommerceFlow({})` → true.
- [ ] **Predicates accept the `ProjectCreationConfig` shape too**
  - Overload/structural typing works for the in-flight config (not just saved
    `Project`), since the executor checks flow before a `Project` exists.

### Type-level checks (compile-time, asserted via a `.test-d` or inline cast test)
- [ ] `Project.flow` is optional and union-typed; `upstream` is
  `{ owner: string; repo: string }` optional.

---

## Files to Create/Modify

- [ ] `src/types/base.ts` — extend `Project`
- [ ] `src/types/typeGuards.ts` — add `getProjectFlow`, `isContentFlow`, `isCommerceFlow`
- [ ] `src/features/project-creation/handlers/executor.ts` — add `flow`/`upstream` to `ProjectCreationConfig`
- [ ] `tests/types/flowPredicates.test.ts` — new

---

## Implementation Details

### RED
Write `flowPredicates.test.ts` against the not-yet-exported predicates.

### GREEN
In `src/types/base.ts`, extend `Project` additively:
```typescript
/** Which storefront archetype this project is. Absent ⇒ 'commerce' (legacy). */
flow?: 'commerce' | 'content';
/** Neutral upstream this fork was created from and syncs against. */
upstream?: { owner: string; repo: string };
```

In `src/types/typeGuards.ts`:
```typescript
type FlowBearing = { flow?: 'commerce' | 'content' };

/** Resolve a project's flow, defaulting legacy projects to 'commerce'. */
export function getProjectFlow(p: FlowBearing): 'commerce' | 'content' {
    return p.flow ?? 'commerce';
}
export function isContentFlow(p: FlowBearing): boolean {
    return getProjectFlow(p) === 'content';
}
export function isCommerceFlow(p: FlowBearing): boolean {
    return getProjectFlow(p) === 'commerce';
}
```

In `executor.ts` `ProjectCreationConfig`, add `flow?: 'commerce' | 'content'`
and `upstream?: { owner: string; repo: string }`, and thread them onto the
`project` object built at `executor.ts:261` (set `flow`, `upstream`).

### REFACTOR
- Keep the `FlowBearing` structural type so both `Project` and
  `ProjectCreationConfig` satisfy the predicates without coupling.
- No behavior change for commerce/legacy — only new optional fields.

---

## Acceptance Criteria
- [ ] All Step-1 tests pass; 100% coverage on the three predicates.
- [ ] `Project` and `ProjectCreationConfig` carry `flow`/`upstream` (optional).
- [ ] Legacy projects (no `flow`) resolve to `'commerce'` everywhere.
- [ ] No change to existing commerce/EDS behavior; full build + existing tests green.

**Estimated time:** 2–3 hours
