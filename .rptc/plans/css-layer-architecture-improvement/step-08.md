# Step 8: Update Documentation

## Purpose

Update CSS architecture documentation to reflect the new 5-layer hierarchy and removal of `!important` from utilities. Documentation must accurately describe the cascade system for future maintainers.

## Prerequisites

- [x] Step 1 complete: @layer declaration updated (REQUIRED)
- [x] Step 2 complete: Layer name migrations done (REQUIRED)
- [x] Step 3 complete: utilities/*.css wrapped (REQUIRED)
- [x] Step 4 complete: spectrum/*.css wrapped (REQUIRED)
- [x] Step 5 complete: components/*.css wrapped (REQUIRED)
- [x] Step 6 complete: !important removed from utilities (REQUIRED)
- [x] Step 7 complete: Visual regression testing passed (REQUIRED)

**Documentation is the final step, after all implementation and testing complete.**

## Tests to Write First

- [ ] Test: Documentation accuracy check
  - **Given:** Updated documentation files
  - **When:** Grepping for old layer references
  - **Then:** No references to `@layer reset, theme, overrides` remain
  - **File:** Manual verification or `npm run lint:docs` if available

## Files to Modify

- [ ] `src/core/ui/styles/CLAUDE.md` - Update @layer section (lines 46-58, 76-83)
- [ ] `CLAUDE.md` (project root) - Update CSS Architecture section (lines 160-170)

## Implementation Details

### RED Phase
Verify documentation contains outdated references:
- Old layer declaration: `@layer reset, theme, overrides;`
- Old !important documentation: "Utilities Use `!important`"

### GREEN Phase

**In `src/core/ui/styles/CLAUDE.md`:**

1. Update @layer declaration (line 51):
```css
@layer reset, vscode-theme, spectrum, components, utilities;
```

2. Update layer order description:
   - `reset` - Browser resets (lowest priority)
   - `vscode-theme` - VS Code theme integration
   - `spectrum` - Adobe Spectrum component overrides
   - `components` - Semantic component styles
   - `utilities` - Layout/spacing utilities (highest priority)

3. Remove "Utilities Use `!important`" section (lines 76-83) and replace with:
```markdown
### Utilities Override Without !important

Utilities are in the highest-priority layer, so they naturally override lower layers:
```css
.flex {
    display: flex;  /* No !important needed */
}
```
```

**In `CLAUDE.md` (project root):**

1. Update @layer cascade line 166:
   - Change: `reset → theme → overrides`
   - To: `reset → vscode-theme → spectrum → components → utilities`

2. Remove line 167 about !important or update to note it's no longer needed

### REFACTOR Phase
- Ensure consistent terminology across both files
- Verify cross-references are accurate

## Expected Outcome

- Documentation accurately describes 5-layer hierarchy
- No references to old 3-layer system
- Clear explanation that utilities don't need !important

## Acceptance Criteria

- [ ] `src/core/ui/styles/CLAUDE.md` updated with 5-layer documentation
- [ ] `CLAUDE.md` CSS Architecture section updated
- [ ] No grep hits for `@layer reset, theme, overrides`
- [ ] No documentation claiming utilities need !important

## Dependencies from Other Steps

- Depends on Steps 1-7 completing successfully
- Step 7 visual regression verification confirms implementation is correct

## Estimated Time

15 minutes
