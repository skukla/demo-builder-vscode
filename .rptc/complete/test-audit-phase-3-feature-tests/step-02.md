# Step 2: Project Creation Feature Tests (52 files)

> **Phase:** 3 - Feature Tests
> **Step:** 2 of 9
> **Feature:** project-creation
> **Test Files:** 52
> **Estimated Time:** 4-5 hours

---

## Purpose

Audit all 52 project-creation test files to ensure tests accurately reflect the current wizard flow, step validation, and project creation process. Project creation is the core feature orchestrating the entire demo setup workflow.

---

## Prerequisites

- [ ] Step 1 (authentication) complete or in parallel
- [ ] All current tests pass before starting audit
- [ ] Read current project-creation implementation structure

---

## Test Files to Audit

### UI Wizard (16 files)

- [ ] `tests/features/project-creation/ui/wizard/WizardContainer-errorBoundary.test.tsx`
- [ ] `tests/features/project-creation/ui/wizard/WizardContainer-focus.test.tsx`
- [ ] `tests/features/project-creation/ui/wizard/WizardContainer-helpers.test.ts`
- [ ] `tests/features/project-creation/ui/wizard/WizardContainer-import.test.tsx`
- [ ] `tests/features/project-creation/ui/wizard/WizardContainer-initialization.test.tsx`
- [ ] `tests/features/project-creation/ui/wizard/WizardContainer-layout.test.tsx`
- [ ] `tests/features/project-creation/ui/wizard/WizardContainer-navigation.test.tsx`
- [ ] `tests/features/project-creation/ui/wizard/WizardContainer-noWelcome.test.tsx`
- [ ] `tests/features/project-creation/ui/wizard/WizardContainer-state.test.tsx`
- [ ] `tests/features/project-creation/ui/wizard/stepFiltering.test.ts`
- [ ] `tests/features/project-creation/ui/wizard/wizardHelpers.filterSteps.test.ts`
- [ ] `tests/features/project-creation/ui/wizard/wizardHelpers.test.ts`

### UI Wizard Steps (4 files)

- [ ] `tests/features/project-creation/ui/wizard/steps/ProjectCreationStep.test.tsx`
- [ ] `tests/features/project-creation/ui/wizard/steps/ReviewStep.test.tsx`
- [ ] `tests/features/project-creation/ui/wizard/steps/WelcomeStep.test.tsx`

### UI Wizard Hooks (1 file)

- [ ] `tests/features/project-creation/ui/wizard/hooks/useWizardNavigation-templates.test.tsx`

### UI Components (8 files)

- [ ] `tests/features/project-creation/ui/components/BrandGallery.helpers.test.ts`
- [ ] `tests/features/project-creation/ui/components/BrandSelector.test.tsx`
- [ ] `tests/features/project-creation/ui/components/ConfigurationSummary-helpers.test.ts`
- [ ] `tests/features/project-creation/ui/components/ConfigurationSummary.test.tsx`
- [ ] `tests/features/project-creation/ui/components/StackSelector.test.tsx`
- [ ] `tests/features/project-creation/ui/components/TemplateCard.test.tsx`
- [ ] `tests/features/project-creation/ui/components/TemplateGallery.test.tsx`
- [ ] `tests/features/project-creation/ui/components/TemplateRow.test.tsx`

### UI Steps (4 files)

- [ ] `tests/features/project-creation/ui/steps/ProjectCreationStep-predicates.test.ts`
- [ ] `tests/features/project-creation/ui/steps/ReviewStep-predicates.test.ts`
- [ ] `tests/features/project-creation/ui/steps/ReviewStep.helpers.test.tsx`
- [ ] `tests/features/project-creation/ui/steps/WelcomeStep-brand-stack.test.tsx`
- [ ] `tests/features/project-creation/ui/steps/WelcomeStep-templates.test.tsx`

### UI Hooks (1 file)

- [ ] `tests/features/project-creation/ui/hooks/useStepValidation.test.tsx`

### UI Helpers (5 files)

- [ ] `tests/features/project-creation/ui/helpers/brandDefaults.test.ts`
- [ ] `tests/features/project-creation/ui/helpers/buttonTextHelpers.test.ts`
- [ ] `tests/features/project-creation/ui/helpers/stackHelpers.test.ts`
- [ ] `tests/features/project-creation/ui/helpers/templateDefaults.test.ts`
- [ ] `tests/features/project-creation/ui/helpers/templateLoader.test.ts`

### Commands (2 files)

- [ ] `tests/features/project-creation/commands/createProject-context.test.ts`
- [ ] `tests/features/project-creation/commands/createProject.test.ts`

### Handlers (9 files)

- [ ] `tests/features/project-creation/handlers/createHandler-cancellation.test.ts`
- [ ] `tests/features/project-creation/handlers/createHandler-errors.test.ts`
- [ ] `tests/features/project-creation/handlers/createHandler-happy-path.test.ts`
- [ ] `tests/features/project-creation/handlers/createHandler-validation.test.ts`
- [ ] `tests/features/project-creation/handlers/executor-componentVersions.test.ts`
- [ ] `tests/features/project-creation/handlers/executor-meshStatePopulation.test.ts`
- [ ] `tests/features/project-creation/handlers/executor-meshStepEnabled.test.ts`
- [ ] `tests/features/project-creation/handlers/validateHandler.test.ts`

### Helpers (6 files)

- [ ] `tests/features/project-creation/helpers/envFileGenerator-basic.test.ts`
- [ ] `tests/features/project-creation/helpers/envFileGenerator-filtering.test.ts`
- [ ] `tests/features/project-creation/helpers/envFileGenerator-formatting.test.ts`
- [ ] `tests/features/project-creation/helpers/envFileGenerator-values.test.ts`
- [ ] `tests/features/project-creation/helpers/formatters.test.ts`
- [ ] `tests/features/project-creation/helpers/setupInstructions.test.ts`

### Services (1 file)

- [ ] `tests/features/project-creation/services/index.test.ts`

---

## Audit Checklist Per File

### 1. Wizard Step Configuration

```typescript
// VERIFY: Step definitions match current wizard-steps.json
// Check templates/wizard-steps.json for current step IDs

// Example: Verify step IDs
const expectedSteps = [
  'welcome',
  'prerequisites',
  'adobe-auth',
  'adobe-project',
  'adobe-workspace',
  'components',
  'review',
  'creation'
];
// Verify this matches current configuration
```

### 2. Template/Brand/Stack Handling

```typescript
// VERIFY: Template tests match current demo-templates.json
// Check templates/demo-templates.json for current template definitions

// Example: Template mock data
const mockTemplate = {
  id: 'starter-template',
  name: 'Starter Template',
  // Verify all fields match current schema
  components: ['frontend1', 'backend1'], // Verify component IDs exist
};
```

### 3. Component Selection Integration

```typescript
// VERIFY: Component selection tests match current components.json
// Check templates/components.json for v3.0.0 structure

// Example: Selected components shape
const selectedComponents = {
  frontends: ['eds'],
  backends: ['adobe-commerce-paas'],
  mesh: ['commerce-mesh'],
  // Verify categorical structure (not flat 'components' map)
};
```

### 4. Wizard State Management

```typescript
// VERIFY: Wizard state shape matches current WizardState type
// Check src/features/project-creation/types.ts

// Example: WizardState mock
const mockWizardState = {
  currentStep: 0,
  projectName: 'test-project',
  selectedTemplate: {...},
  selectedComponents: {...},
  // Verify all required fields present
};
```

### 5. Creation Handler Flow

```typescript
// VERIFY: Creation handler tests match current flow
// Check src/features/project-creation/handlers/

// Key areas:
// - Progress callback shape
// - Error response format
// - Cancellation handling
// - Component installation order
```

### 6. .env File Generation

```typescript
// VERIFY: Env file generator tests match current component config
// Check templates/components.json for envVars definitions

// Example: Verify env var names match component definitions
expect(envContent).toContain('COMMERCE_BACKEND_URL');
// Verify this var exists in current component envVars
```

---

## Key Source Files to Reference

| Source File | Purpose |
|-------------|---------|
| `src/features/project-creation/types.ts` | Type definitions |
| `src/features/project-creation/ui/wizard/` | Wizard components |
| `src/features/project-creation/handlers/` | Creation handlers |
| `src/features/project-creation/helpers/` | Helper functions |
| `templates/wizard-steps.json` | Step definitions |
| `templates/demo-templates.json` | Template definitions |
| `templates/components.json` | Component registry (v3.0.0) |

---

## Common Issues to Look For

### Issue 1: Old Step IDs

```typescript
// OLD: Might reference removed/renamed steps
const step = { id: 'auth-setup' }; // Might be 'adobe-auth' now

// CURRENT: Verify against wizard-steps.json
const step = { id: 'adobe-auth' };
```

### Issue 2: Flat Component Selection

```typescript
// OLD: Flat components map (v2.0)
const selection = { components: ['frontend1', 'backend1'] };

// CURRENT: Categorical selection (v3.0.0)
const selection = {
  frontends: ['eds'],
  backends: ['adobe-commerce-paas'],
};
```

### Issue 3: Template Structure Changes

```typescript
// OLD: Basic template shape
const template = { id: 'basic', components: [] };

// CURRENT: Verify full template schema
const template = {
  id: 'basic',
  name: 'Basic Template',
  description: '...',
  brand: '...',
  stack: '...',
  components: {...}, // Now categorical
};
```

### Issue 4: Wizard Navigation Changes

```typescript
// OLD: Simple step index navigation
wizard.goToStep(3);

// CURRENT: May use step IDs or conditional navigation
wizard.goToStep('adobe-project');
```

---

## Expected Outcomes

After auditing all 52 project-creation test files:

- [ ] All wizard step tests match current step definitions
- [ ] All template tests match current demo-templates.json
- [ ] All component selection tests use v3.0.0 categorical structure
- [ ] All handler tests match current creation flow
- [ ] All env file tests match current component envVars
- [ ] No version references (v2/v3) remain

---

## Acceptance Criteria

- [ ] All 52 project-creation test files reviewed
- [ ] Mock data matches current TypeScript interfaces
- [ ] Step definitions match wizard-steps.json
- [ ] Template mocks match demo-templates.json
- [ ] Component selection uses v3.0.0 structure
- [ ] All project-creation tests pass
- [ ] No hardcoded values (timeouts use TIMEOUTS.*)
- [ ] No version-specific logic remains

---

## Notes

- Project-creation tests are central to the wizard flow
- Many tests will reference components - verify v3.0.0 structure
- Template selection affects component presets - verify consistency
- Watch for integration with authentication context

---

## Implementation Log

_To be filled during audit_

### Files Audited

_List files as they are completed_

### Issues Found

_Document any issues requiring follow-up_

### Mock Updates Made

_Track mock structure changes for cross-feature consistency_
