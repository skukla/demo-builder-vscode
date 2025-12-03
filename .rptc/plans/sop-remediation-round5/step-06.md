# Step 6: Refactor Inline Object.keys in executor.ts

## Purpose

Refactor inline `Object.keys().forEach()` chain to comply with SOP §4.

## Files to Modify

- `src/features/project-creation/handlers/executor.ts:206`

## Tests to Write First

**No new tests needed** - this is a refactoring step. Existing tests must pass.

## Implementation

Replace:
```typescript
Object.keys(frontendDef.submodules).forEach(id => frontendSubmoduleIds.add(id));
```

With (Option 2 - more idiomatic):
```typescript
const frontendSubmoduleIds = new Set(Object.keys(frontendDef.submodules));
```

Or if the Set is initialized elsewhere, use intermediate variable:
```typescript
const submoduleIds = Object.keys(frontendDef.submodules);
submoduleIds.forEach(id => frontendSubmoduleIds.add(id));
```

## Expected Outcome

- No inline `Object.keys().forEach()` chain
- Behavior unchanged
- All existing tests pass

## Acceptance Criteria

- [ ] No inline Object.keys().forEach() pattern
- [ ] Behavior unchanged (same IDs added to Set)
- [ ] All existing tests pass
