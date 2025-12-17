# Step 3: Integrate TemplateGallery into WelcomeStep

## Objective
Replace the existing TemplateCardGrid with the new TemplateGallery component and update WelcomeStep layout to accommodate the full gallery experience.

## Test Specifications

### WelcomeStep Integration Tests
```typescript
describe('WelcomeStep with TemplateGallery', () => {
    it('should render project name input at top');
    it('should render TemplateGallery below name input');
    it('should pass templates to TemplateGallery');
    it('should update selectedTemplate when gallery selection changes');
    it('should require both name and template selection to proceed');
    it('should support search within template gallery');
    it('should support tag filtering within template gallery');
});
```

## Implementation Details

### WelcomeStep Layout Update

**Before (Phase 3):**
```tsx
<View>
    <Heading>Name Your Demo</Heading>
    <TextField ... />
</View>

<View>
    <Heading>Choose a Template</Heading>
    <TemplateCardGrid ... />
</View>
```

**After (Phase 4):**
```tsx
<View>
    <Heading>Name Your Demo</Heading>
    <TextField ... />
</View>

<View>
    <Heading>Choose a Template</Heading>
    <TemplateGallery
        templates={templates}
        selectedTemplateId={state.selectedTemplate}
        onSelect={handleTemplateSelect}
    />
</View>
```

### Cleanup Tasks
1. Remove `TemplateCardGrid.tsx` (replaced by TemplateGallery)
2. Remove `TemplateCardGrid.test.tsx`
3. Update imports in WelcomeStep
4. Update WelcomeStep tests

### Layout Considerations
- TemplateGallery takes full width of step content area
- Search header is part of the gallery, not WelcomeStep
- Project name stays at top (unchanged)

## File Changes

### Files to Modify
- `src/features/project-creation/ui/steps/WelcomeStep.tsx`
  - Replace TemplateCardGrid import with TemplateGallery
  - Update component usage
- `tests/features/project-creation/ui/steps/WelcomeStep-templates.test.tsx`
  - Update tests for new gallery behavior

### Files to Delete
- `src/features/project-creation/ui/components/TemplateCardGrid.tsx`
- `tests/features/project-creation/ui/components/TemplateCardGrid.test.tsx`

## Acceptance Criteria
- [ ] WelcomeStep uses TemplateGallery instead of TemplateCardGrid
- [ ] Search and filter work within WelcomeStep context
- [ ] Template selection updates wizard state correctly
- [ ] TemplateCardGrid files are removed
- [ ] All tests pass
- [ ] Manual testing confirms UX matches ProjectsDashboard
