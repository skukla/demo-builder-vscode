# Step 2: Quick Wins - Fix Keyframe Duplication

## Status
- [ ] Tests written
- [ ] Implementation complete
- [ ] Verified

## Purpose

Remove duplicate `@keyframes fadeIn` from custom-spectrum.css:954-963. Keep the canonical definition in index.css:152-155.

## Prerequisites

- [ ] Step 1 complete (dead code removal)

## Tests to Write First

### Test: fadeIn keyframe defined exactly once
- **Given:** All CSS files in src/core/ui/styles/
- **When:** Searching for `@keyframes fadeIn` definitions
- **Then:** Exactly one definition exists (in index.css)
- **File:** `tests/core/ui/styles/keyframe-deduplication.test.ts`

### Test: animate-fade-in class still animates
- **Given:** Element with `.animate-fade-in` class
- **When:** Class applied in browser context
- **Then:** Element receives `animation: fadeIn` property
- **File:** Visual verification (manual)

## Files to Modify

- [ ] `src/core/ui/styles/custom-spectrum.css` - Remove lines 954-963 (@keyframes fadeIn block)

## Implementation Details

### RED Phase
Write test that asserts only one `@keyframes fadeIn` exists across CSS files.

### GREEN Phase
Delete duplicate keyframe from custom-spectrum.css:954-963:
```css
/* DELETE THIS BLOCK */
@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(-8px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

Note: The index.css version (opacity-only) becomes canonical. The translateY transform effect will be removed - acceptable trade-off for consistency.

### REFACTOR Phase
Update comment at line 2627 that references the duplicate.

## Expected Outcome

- Single `@keyframes fadeIn` definition in index.css
- `.animate-fade-in` class continues to work
- No visual regressions in fade animations

## Acceptance Criteria

- [ ] Only one fadeIn keyframe definition exists
- [ ] All `.animate-fade-in` usages still animate
- [ ] Build succeeds without CSS errors

## Dependencies from Other Steps

- Depends on: Step 1 (clean slate after dead code removal)
- Blocks: None (independent quick win)

## Estimated Time
15 minutes
