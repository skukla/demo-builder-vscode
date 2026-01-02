# Step 5: Wrap components/*.css in @layer components

## Purpose

Wrap all 4 component CSS files in `@layer components` block to position them correctly in the cascade hierarchy (above spectrum, below utilities). These are semantic component styles distinct from the utilities and Spectrum overrides.

**Important:** This step adds NEW @layer wrappers to component files that currently have NO @layer declaration. Note that wizard.css was RENAMED in Step 2 from `@layer theme` to `@layer components` and is NOT included here (it was already handled in Step 2).

## Prerequisites

- [x] Step 1 complete: @layer declaration updated to 5-layer hierarchy (REQUIRED)
- [x] Step 2 complete: Existing @layer declarations migrated to new names (REQUIRED)
- [ ] Step 3 complete: utilities/*.css wrapped in @layer utilities (for consistency)
- [ ] Step 4 complete: spectrum/*.css wrapped in @layer spectrum (for consistency)

## Tests to Write First

### Test File: `tests/core/ui/styles/layerStructure.test.ts`

- [ ] Test: Verify cards.css wrapped in @layer components
  - **Given:** cards.css file exists
  - **When:** File content is parsed
  - **Then:** Content is enclosed in `@layer components { ... }`
  - **File:** `tests/core/ui/styles/layerStructure.test.ts`

- [ ] Test: Verify common.css wrapped in @layer components
  - **Given:** common.css file exists
  - **When:** File content is parsed
  - **Then:** Content is enclosed in `@layer components { ... }`
  - **File:** `tests/core/ui/styles/layerStructure.test.ts`

- [ ] Test: Verify dashboard.css wrapped in @layer components
  - **Given:** dashboard.css file exists
  - **When:** File content is parsed
  - **Then:** Content is enclosed in `@layer components { ... }`
  - **File:** `tests/core/ui/styles/layerStructure.test.ts`

- [ ] Test: Verify timeline.css wrapped in @layer components
  - **Given:** timeline.css file exists
  - **When:** File content is parsed
  - **Then:** Content is enclosed in `@layer components { ... }`
  - **File:** `tests/core/ui/styles/layerStructure.test.ts`

## Files to Modify

- [ ] `src/core/ui/styles/components/cards.css` - Wrap entire content in @layer components
- [ ] `src/core/ui/styles/components/common.css` - Wrap entire content in @layer components
- [ ] `src/core/ui/styles/components/dashboard.css` - Wrap entire content in @layer components
- [ ] `src/core/ui/styles/components/timeline.css` - Wrap entire content in @layer components

## Implementation Details

### RED Phase

Add components layer tests to `tests/core/ui/styles/layerStructure.test.ts`:

```typescript
describe('components/ files', () => {
  const componentFiles = [
    'cards.css',
    'common.css',
    'dashboard.css',
    'timeline.css',
  ];

  componentFiles.forEach((file) => {
    it(`${file} is wrapped in @layer components`, () => {
      const content = readFileSync(
        join(stylesDir, 'components', file),
        'utf-8'
      );
      expect(content).toMatch(/^@layer components \{[\s\S]*\}$/);
    });
  });
});
```

### GREEN Phase

1. In `cards.css`: Wrap all content in `@layer components { ... }`
2. In `common.css`: Wrap all content in `@layer components { ... }`
3. In `dashboard.css`: Wrap all content in `@layer components { ... }`
4. In `timeline.css`: Wrap all content in `@layer components { ... }`

### REFACTOR Phase

- Verify consistent indentation (2 spaces) across all files
- Ensure closing `}` on its own line
- Verify no duplicate layer declarations

## Expected Outcome

- All 4 component CSS files wrapped in `@layer components`
- Component styles positioned at layer 4 of 5 (above spectrum, below utilities)
- Semantic component classes have correct cascade priority

## Acceptance Criteria

- [ ] cards.css wrapped in @layer components
- [ ] common.css wrapped in @layer components
- [ ] dashboard.css wrapped in @layer components
- [ ] timeline.css wrapped in @layer components
- [ ] All tests passing
- [ ] Webviews render correctly (visual check)

## Dependencies from Other Steps

- Requires Step 1 (@layer declaration includes `components` layer)
- Requires Steps 2-4 for consistent cascade testing
- Step 6 (!important removal) depends on utilities having highest priority
