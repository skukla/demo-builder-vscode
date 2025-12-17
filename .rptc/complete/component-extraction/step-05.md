# Step 5: Adopt Components in WizardContainer

## Purpose

Replace inline header/footer JSX in WizardContainer.tsx with the extracted PageHeader, PageFooter, and PageLayout components, reducing duplication and proving component reusability.

## Prerequisites

- [x] Step 1: PageHeader component complete
- [x] Step 2: PageFooter component complete
- [x] Step 3: PageLayout component complete

## Tests to Write First

- [x] Test: WizardContainer renders with PageLayout structure
  - **Given:** WizardContainer mounted with valid props
  - **When:** Component renders
  - **Then:** Contains PageLayout wrapper with header/footer slots
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer-layout.test.tsx`

- [x] Test: Header displays current step name
  - **Given:** Wizard on step "adobe-auth"
  - **When:** Component renders
  - **Then:** PageHeader shows "Create Demo Project" title and step subtitle

- [x] Test: Footer buttons remain functional
  - **Given:** WizardContainer with canProceed=true
  - **When:** Continue button clicked
  - **Then:** goNext callback fires

## Files to Modify

- [x] `src/features/project-creation/ui/wizard/WizardContainer.tsx`
- [x] `tests/features/project-creation/ui/wizard/WizardContainer-layout.test.tsx` - New tests
  - Add imports for PageHeader, PageFooter, PageLayout
  - Replace lines 525-535 (header View) with PageHeader
  - Replace lines 571-606 (footer View) with PageFooter
  - Wrap content in PageLayout

## Implementation Details

**RED Phase:** Update existing WizardContainer tests to expect new component structure.

**GREEN Phase:**
1. Import: `import { PageHeader, PageFooter, PageLayout } from '@/core/ui/components/layout'`
2. Replace header View with: `<PageHeader title="Create Demo Project" subtitle={currentStepName} />`
3. Replace footer View with PageFooter using leftContent (Cancel) and rightContent (Back + Continue)
4. Wrap entire return in PageLayout with header/footer props

**REFACTOR Phase:** Remove unused View/Heading imports if no longer needed.

## Acceptance Criteria

- [x] All existing WizardContainer tests pass (123 tests)
- [x] Header/footer render identically (visual regression check)
- [x] Loading overlay and step transitions preserved
- [x] No duplicate View/Flex imports from Spectrum

## Completion Notes

**Completed:** 2025-12-02
**Tests:** 9 new tests in WizardContainer-layout.test.tsx (123 total for WizardContainer suite)
**Note:** PageLayout not adopted - WizardContainer has custom layout with animations, focus traps, and overlays that conflict with PageLayout's viewport structure. Only PageHeader and PageFooter adopted.
