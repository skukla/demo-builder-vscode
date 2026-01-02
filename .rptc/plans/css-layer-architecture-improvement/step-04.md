# Step 4: Wrap spectrum/*.css in @layer spectrum

## Purpose

Wrap both Spectrum override CSS files in `@layer spectrum` block to position them correctly in the cascade hierarchy (above theme, below components and utilities).

**Important:** This step adds NEW @layer wrappers to spectrum files that currently have NO @layer declaration (spectrum/components.css). Note that spectrum/buttons.css was RENAMED in Step 2 from `@layer overrides` to `@layer spectrum` and now gets a full wrapper added here.

## Prerequisites

- [x] Step 1 complete: @layer declaration updated to 5-layer hierarchy (REQUIRED)
- [x] Step 2 complete: Existing @layer declarations migrated to new names (REQUIRED)
- [ ] Step 3 complete: utilities/*.css wrapped in @layer utilities (for consistency)

## Tests to Write First

### Test File: `tests/core/ui/styles/layerStructure.test.ts`

- [ ] Test: Verify buttons.css wrapped in @layer spectrum
  - **Given:** buttons.css file exists
  - **When:** File content is parsed
  - **Then:** Content is enclosed in `@layer spectrum { ... }`
  - **File:** `tests/core/ui/styles/layerStructure.test.ts`

- [ ] Test: Verify spectrum/components.css wrapped in @layer spectrum
  - **Given:** spectrum/components.css file exists
  - **When:** File content is parsed
  - **Then:** Content is enclosed in `@layer spectrum { ... }`
  - **File:** `tests/core/ui/styles/layerStructure.test.ts`

- [ ] Test: Verify nested @layer overrides removed from buttons.css
  - **Given:** buttons.css wrapped in @layer spectrum
  - **When:** File content is searched
  - **Then:** No `@layer overrides` block exists (content merged into parent)
  - **File:** `tests/core/ui/styles/layerStructure.test.ts`

## Files to Modify

- [ ] `src/core/ui/styles/spectrum/buttons.css` - Wrap entire content in @layer spectrum, remove nested @layer overrides block
- [ ] `src/core/ui/styles/spectrum/components.css` - Wrap entire content in @layer spectrum

## Implementation Details

### RED Phase

Add spectrum layer tests to `tests/core/ui/styles/layerStructure.test.ts`:

```typescript
describe('spectrum/ files', () => {
  const spectrumFiles = [
    'buttons.css',
    'components.css',
  ];

  spectrumFiles.forEach((file) => {
    it(`${file} is wrapped in @layer spectrum`, () => {
      const content = readFileSync(
        join(stylesDir, 'spectrum', file),
        'utf-8'
      );
      expect(content).toMatch(/^@layer spectrum \{[\s\S]*\}$/);
    });
  });

  it('buttons.css has no nested @layer overrides block', () => {
    const content = readFileSync(
      join(stylesDir, 'spectrum', 'buttons.css'),
      'utf-8'
    );
    expect(content).not.toMatch(/@layer\s+overrides\s*\{/);
  });
});
```

### GREEN Phase

1. In `buttons.css`: Wrap all content in `@layer spectrum { ... }`, unwrap CTA section from nested `@layer overrides` (merge into parent layer)
2. In `components.css`: Wrap all content in `@layer spectrum { ... }`

### REFACTOR Phase

- Verify no duplicate layer declarations
- Ensure consistent indentation (2 spaces)
- Ensure closing `}` on its own line

## Expected Outcome

- Both spectrum/*.css files wrapped in `@layer spectrum`
- CTA button styles no longer in nested `@layer overrides` block
- Spectrum overrides positioned correctly in cascade (layer 3 of 5)

## Acceptance Criteria

- [ ] buttons.css wrapped in @layer spectrum
- [ ] components.css wrapped in @layer spectrum
- [ ] No nested @layer declarations in spectrum files
- [ ] All tests passing
- [ ] Webviews render correctly (visual check)

## Dependencies from Other Steps

- Requires Step 1 (@layer declaration includes `spectrum` layer)
- Independent of Steps 2-3 (can run in parallel if needed)
- Step 5 (components/*.css) depends on consistent pattern established here
