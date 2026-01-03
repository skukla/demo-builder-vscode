# Step 8: Complete Wizard Migration & Integration Testing

**Purpose:** Verify and complete the wizard step migrations started in Step 7, address complex patterns (Picker-to-Select, ProgressBar), migrate Provider/defaultTheme entry points, and run integration tests for the complete wizard flow. This step ensures the wizard works correctly end-to-end after React Aria migration.

**Prerequisites:**
- [ ] Step 1 complete: Infrastructure and react-aria-components installed
- [ ] Step 2 complete: Primitive components (Text, Heading, Flex, View, Divider)
- [ ] Step 3 complete: Interactive components (Button, ActionButton, ProgressCircle)
- [ ] Step 4 complete: Form components (TextField, SearchField, Checkbox, Select, ProgressBar)
- [ ] Step 5 complete: Overlay components (Dialog, Menu, MenuTrigger)
- [ ] Step 6 complete: Core UI components migrated
- [ ] Step 7 complete: Feature UIs migrated (includes initial wizard file migrations)

---

## Context

Step 7 performed the initial file-by-file migration of wizard steps. Step 8 focuses on:
1. **Verification** - Ensuring all wizard step migrations are complete and correct
2. **Integration Testing** - Testing the wizard flow as a cohesive unit
3. **Complex Patterns** - Addressing wizard-specific patterns (Picker with descriptions, locked checkboxes, ProgressBar)
4. **Provider Migration** - Migrating wizard entry points that use Provider/defaultTheme

---

## Wizard Step Files Overview

### Authentication Steps (3 files)
| File | Current Spectrum Components | Migration Complexity |
|------|----------------------------|---------------------|
| `AdobeAuthStep.tsx` | StatusDisplay (uses core) | Low |
| `AdobeProjectStep.tsx` | Text, TwoColumnLayout (uses core) | Low |
| `AdobeWorkspaceStep.tsx` | Text, TwoColumnLayout (uses core) | Low |

### Component Selection (1 file)
| File | Current Spectrum Components | Migration Complexity |
|------|----------------------------|---------------------|
| `ComponentSelectionStep.tsx` | View, Flex, Text, Picker, Item, Checkbox | High |

### Prerequisites (1 file)
| File | Current Spectrum Components | Migration Complexity |
|------|----------------------------|---------------------|
| `PrerequisitesStep.tsx` | View, Flex, Text, Button, ProgressBar | Medium |

### API Mesh (1 file)
| File | Current Spectrum Components | Migration Complexity |
|------|----------------------------|---------------------|
| `ApiMeshStep.tsx` | Text, Flex, Button | Low |

### Project Creation Steps (3 files)
| File | Current Spectrum Components | Migration Complexity |
|------|----------------------------|---------------------|
| `WelcomeStep.tsx` | TextField, Text | Low |
| `ReviewStep.tsx` | View, Text, Flex, Heading, Divider | Low |
| `ProjectCreationStep.tsx` | Text, Flex, Button | Low |

### Wizard Container (1 file)
| File | Current Spectrum Components | Migration Complexity |
|------|----------------------------|---------------------|
| `WizardContainer.tsx` | View, Flex, Heading, Button, Text | Medium |

---

## Test Strategy

### Testing Approach
- **Framework:** Jest with @testing-library/react
- **Coverage Goal:** 90% for wizard steps (critical user flow)
- **Test Types:** Unit tests + Integration tests for navigation flow

### Integration Test Focus Areas
1. **Navigation Flow** - Forward/backward step transitions
2. **State Persistence** - State maintained across step changes
3. **Validation Gates** - Steps correctly enable/disable Continue button
4. **Error Recovery** - Error boundaries catch component failures

---

## Implementation Tasks

### Task 8.1: Verify Authentication Step Migrations

**Files:**
- [ ] `src/features/authentication/ui/steps/AdobeAuthStep.tsx`
- [ ] `src/features/authentication/ui/steps/AdobeProjectStep.tsx`
- [ ] `src/features/authentication/ui/steps/AdobeWorkspaceStep.tsx`

**Verification Checklist:**
```typescript
// AdobeAuthStep.tsx - Verify no Spectrum imports except icons
// Uses StatusDisplay from @/core/ui/components/feedback (already migrated)
// Icons from @spectrum-icons/workflow remain unchanged

// AdobeProjectStep.tsx - Should use:
import { Text } from '@/core/ui/components/aria';

// AdobeWorkspaceStep.tsx - Should use:
import { Text } from '@/core/ui/components/aria';
```

**Tests to Write First:**

- [ ] Test: AdobeAuthStep renders sign-in prompt when unauthenticated
  - **Given:** AdobeAuthStep with state.adobeAuth.isAuthenticated = false
  - **When:** Component renders
  - **Then:** StatusDisplay shows "Sign in to Adobe" with login button
  - **File:** `tests/features/authentication/ui/steps/AdobeAuthStep.test.tsx`

- [ ] Test: AdobeAuthStep shows connected state with org name
  - **Given:** AdobeAuthStep with authenticated state and org
  - **When:** Component renders
  - **Then:** StatusDisplay shows "Connected" with organization name
  - **File:** `tests/features/authentication/ui/steps/AdobeAuthStep.test.tsx`

- [ ] Test: AdobeProjectStep renders project list with selection
  - **Given:** AdobeProjectStep with projects array
  - **When:** User selects a project
  - **Then:** updateState called with adobeProject, dependent state cleared
  - **File:** `tests/features/authentication/ui/steps/AdobeProjectStep.test.tsx`

- [ ] Test: AdobeWorkspaceStep auto-selects Stage workspace
  - **Given:** AdobeWorkspaceStep with workspaces including "Stage"
  - **When:** Component loads and auto-select runs
  - **Then:** Stage workspace is pre-selected
  - **File:** `tests/features/authentication/ui/steps/AdobeWorkspaceStep.test.tsx`

**Acceptance Criteria:**
- [ ] No `@adobe/react-spectrum` imports (except icons)
- [ ] No `UNSAFE_className` usage
- [ ] All tests pass
- [ ] setCanProceed logic works correctly

**Estimated Time:** 1.5 hours

---

### Task 8.2: Complete ComponentSelectionStep Migration

**Files:**
- [ ] `src/features/components/ui/steps/ComponentSelectionStep.tsx`

**Current Spectrum Usage (High Complexity):**
```typescript
// Before
import {
    View,
    Flex,
    Text,
    Picker,
    Item,
    Checkbox,
} from '@adobe/react-spectrum';

<Picker
    width="100%"
    selectedKey={selectedFrontend}
    onSelectionChange={(key) => setSelectedFrontend(key as string)}
    placeholder="Select frontend system"
    aria-label="Select frontend system"
    menuWidth="size-4600"
    UNSAFE_className={cn('cursor-pointer')}
>
    {frontendOptions.map((opt) => (
        <Item key={opt.id} textValue={opt.name}>
            <Text>{opt.name}</Text>
            <Text slot="description">{opt.description}</Text>
        </Item>
    ))}
</Picker>

<Checkbox
    isSelected={selectedDependencies.has(dep.id)}
    isDisabled={true}
    onChange={(sel) => handleDependencyToggle(dep.id, sel)}
    UNSAFE_className="checkbox-spacing"
>
    <Flex alignItems="center" gap="size-50">
        <LockClosed size="XS" UNSAFE_className="text-gray-600" />
        <Text UNSAFE_className="text-md">{dep.name}</Text>
    </Flex>
</Checkbox>
```

**Migration Pattern:**
```typescript
// After
import { View, Flex, Text, Checkbox } from '@/core/ui/components/aria';
import { Select, SelectItem } from '@/core/ui/components/aria';

<Select
    selectedKey={selectedFrontend}
    onSelectionChange={(key) => setSelectedFrontend(key as string)}
    placeholder="Select frontend system"
    aria-label="Select frontend system"
    className="w-full cursor-pointer"
>
    {frontendOptions.map((opt) => (
        <SelectItem key={opt.id} textValue={opt.name}>
            <div className="flex flex-col">
                <Text className="font-medium">{opt.name}</Text>
                <Text className="text-sm text-gray-500">{opt.description}</Text>
            </div>
        </SelectItem>
    ))}
</Select>

<Checkbox
    isSelected={selectedDependencies.has(dep.id)}
    isDisabled={true}
    onChange={(sel) => handleDependencyToggle(dep.id, sel)}
    className="checkbox-spacing"
>
    <Flex alignItems="center" gap="size-50">
        <LockClosed size="XS" className="text-gray-600" />
        <Text className="text-md">{dep.name}</Text>
    </Flex>
</Checkbox>
```

**Special Handling - Picker with Descriptions:**
The Spectrum Picker supports `slot="description"` for rich item content. React Aria Select requires custom rendering:

```typescript
// CSS Module for SelectItem descriptions
// src/features/components/ui/styles/componentSelection.module.css
.selectItemContent {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.selectItemDescription {
    font-size: 12px;
    color: var(--spectrum-gray-600);
}
```

**Tests to Write First:**

- [ ] Test: ComponentSelectionStep renders frontend picker with options
  - **Given:** ComponentSelectionStep with frontend options
  - **When:** Component renders
  - **Then:** Select displays with all frontend options
  - **File:** `tests/features/components/ui/steps/ComponentSelectionStep.test.tsx`

- [ ] Test: ComponentSelectionStep shows option descriptions
  - **Given:** ComponentSelectionStep with frontend options including descriptions
  - **When:** User opens Select dropdown
  - **Then:** Each option shows name and description
  - **File:** `tests/features/components/ui/steps/ComponentSelectionStep.test.tsx`

- [ ] Test: ComponentSelectionStep locked checkboxes stay disabled
  - **Given:** ComponentSelectionStep with locked dependencies
  - **When:** User attempts to interact with locked checkbox
  - **Then:** Checkbox remains selected and disabled
  - **File:** `tests/features/components/ui/steps/ComponentSelectionStep.test.tsx`

- [ ] Test: ComponentSelectionStep optional addons can be toggled
  - **Given:** ComponentSelectionStep with optional addon selected
  - **When:** User unchecks addon
  - **Then:** handleDependencyToggle called, addon removed from selection
  - **File:** `tests/features/components/ui/steps/ComponentSelectionStep.test.tsx`

- [ ] Test: ComponentSelectionStep backend picker works independently
  - **Given:** ComponentSelectionStep with backend options
  - **When:** User selects backend
  - **Then:** setSelectedBackend called, backend services shown
  - **File:** `tests/features/components/ui/steps/ComponentSelectionStep.test.tsx`

**Acceptance Criteria:**
- [ ] Picker replaced with Select component
- [ ] Item descriptions render correctly in dropdown
- [ ] Locked checkboxes display lock icon and stay disabled
- [ ] Optional addons toggleable
- [ ] No `UNSAFE_className` usage
- [ ] All tests pass

**Estimated Time:** 2 hours

---

### Task 8.3: Complete PrerequisitesStep Migration

**Files:**
- [ ] `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`

**Current Spectrum Usage:**
```typescript
// Before
import {
    View,
    Flex,
    Text,
    Button,
    ProgressBar,
} from '@adobe/react-spectrum';

<Text marginBottom="size-200" UNSAFE_className={cn('text-gray-700', 'text-md')}>
    Checking required tools...
</Text>

<View marginTop="size-100" UNSAFE_className="animate-fade-in">
    <ProgressBar
        label={progressLabel}
        value={getProgressValue(check.unifiedProgress)}
        maxValue={100}
        size="S"
        UNSAFE_className="progress-bar-spacing progress-bar-small-label progress-bar-full-width"
    />
</View>

<Button
    variant="secondary"
    onPress={() => checkPrerequisites(true)}
    isDisabled={isChecking || installingIndex !== null}
    UNSAFE_className={cn('btn-standard', 'text-base')}
>
    Recheck
</Button>
```

**Migration Pattern:**
```typescript
// After
import { View, Flex, Text, Button, ProgressBar } from '@/core/ui/components/aria';

<Text marginBottom="size-200" className={cn('text-gray-700', 'text-md')}>
    Checking required tools...
</Text>

<View marginTop="size-100" className="animate-fade-in">
    <ProgressBar
        label={progressLabel}
        value={getProgressValue(check.unifiedProgress)}
        maxValue={100}
        size="S"
        className="progress-bar-spacing progress-bar-small-label progress-bar-full-width"
    />
</View>

<Button
    variant="secondary"
    onPress={() => checkPrerequisites(true)}
    isDisabled={isChecking || installingIndex !== null}
    className={cn('btn-standard', 'text-base')}
>
    Recheck
</Button>
```

**Note on ProgressBar:**
ProgressBar may need to be created as a new React Aria component if not already in Step 3. React Aria provides `<ProgressBar>` from `react-aria-components`:

```typescript
import { ProgressBar as AriaProgressBar, Label } from 'react-aria-components';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
    label?: string;
    value: number;
    maxValue?: number;
    size?: 'S' | 'M' | 'L';
    className?: string;
}

export function ProgressBar({ label, value, maxValue = 100, size = 'M', className }: ProgressBarProps) {
    return (
        <AriaProgressBar value={value} maxValue={maxValue} className={cn(styles.progressBar, styles[size], className)}>
            {label && <Label className={styles.label}>{label}</Label>}
            <div className={styles.track}>
                <div className={styles.fill} style={{ width: `${(value / maxValue) * 100}%` }} />
            </div>
        </AriaProgressBar>
    );
}
```

**Tests to Write First:**

- [ ] Test: PrerequisitesStep shows checking status with progress
  - **Given:** PrerequisitesStep with check in progress
  - **When:** unifiedProgress is provided
  - **Then:** ProgressBar displays with current step info
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

- [ ] Test: PrerequisitesStep shows install button for failed items
  - **Given:** PrerequisitesStep with failed prerequisite that canInstall
  - **When:** Component renders
  - **Then:** Install button displays for that prerequisite
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

- [ ] Test: PrerequisitesStep recheck button triggers check
  - **Given:** PrerequisitesStep with checks complete
  - **When:** User clicks Recheck
  - **Then:** checkPrerequisites(true) is called
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

- [ ] Test: PrerequisitesStep shows plugin details on expand
  - **Given:** PrerequisitesStep with check containing plugins
  - **When:** shouldShowPluginDetails returns true
  - **Then:** Plugin list displays with status icons
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

- [ ] Test: PrerequisitesStep enables Continue when all pass
  - **Given:** PrerequisitesStep with all checks passing
  - **When:** Checks complete
  - **Then:** setCanProceed(true) is called
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

**Acceptance Criteria:**
- [ ] ProgressBar component created or imported from aria
- [ ] Progress labels display correctly
- [ ] Install/Recheck buttons work
- [ ] CSS Module styles preserved
- [ ] All tests pass

**Estimated Time:** 2 hours

---

### Task 8.4: Complete ApiMeshStep Migration

**Files:**
- [ ] `src/features/mesh/ui/steps/ApiMeshStep.tsx`

**Current Spectrum Usage:**
```typescript
// Before
import { Text, Flex, Button } from '@adobe/react-spectrum';

<Text marginBottom="size-300">
    Verifying API Mesh API availability for your selected workspace.
</Text>

<Flex direction="column" gap="size-200" alignItems="center">
    <Info size="L" UNSAFE_className="text-blue-600" />
    <Text UNSAFE_className="text-xl font-medium">Ready for Mesh Creation</Text>
    <Button variant="accent" marginTop="size-300" onPress={createMesh}>
        Create Mesh
    </Button>
</Flex>
```

**Migration Pattern:**
```typescript
// After
import { Text, Flex, Button } from '@/core/ui/components/aria';

<Text marginBottom="size-300">
    Verifying API Mesh API availability for your selected workspace.
</Text>

<Flex direction="column" gap="size-200" alignItems="center">
    <Info size="L" className="text-blue-600" />
    <Text className="text-xl font-medium">Ready for Mesh Creation</Text>
    <Button variant="accent" marginTop="size-300" onPress={createMesh}>
        Create Mesh
    </Button>
</Flex>
```

**Tests to Write First:**

- [ ] Test: ApiMeshStep shows loading state during check
  - **Given:** ApiMeshStep with isChecking=true
  - **When:** Component renders
  - **Then:** LoadingDisplay shows with checking message
  - **File:** `tests/features/mesh/ui/steps/ApiMeshStep.test.tsx`

- [ ] Test: ApiMeshStep shows error when mesh not enabled
  - **Given:** ApiMeshStep with error state
  - **When:** Component renders
  - **Then:** MeshErrorDialog displays with setup instructions
  - **File:** `tests/features/mesh/ui/steps/ApiMeshStep.test.tsx`

- [ ] Test: ApiMeshStep shows create button when ready
  - **Given:** ApiMeshStep with showCreateMesh=true
  - **When:** Component renders
  - **Then:** "Create Mesh" button displays
  - **File:** `tests/features/mesh/ui/steps/ApiMeshStep.test.tsx`

- [ ] Test: ApiMeshStep shows mesh data when exists
  - **Given:** ApiMeshStep with existing meshData
  - **When:** Component renders
  - **Then:** MeshStatusDisplay shows mesh info
  - **File:** `tests/features/mesh/ui/steps/ApiMeshStep.test.tsx`

**Acceptance Criteria:**
- [ ] All Spectrum imports replaced
- [ ] No `UNSAFE_className` usage
- [ ] TwoColumnLayout integration preserved
- [ ] ConfigurationSummary renders correctly
- [ ] All tests pass

**Estimated Time:** 1 hour

---

### Task 8.5: Complete Project Creation Steps Migration

**Files:**
- [ ] `src/features/project-creation/ui/steps/WelcomeStep.tsx`
- [ ] `src/features/project-creation/ui/steps/ReviewStep.tsx`
- [ ] `src/features/project-creation/ui/steps/ProjectCreationStep.tsx`

**WelcomeStep Migration:**
```typescript
// Before
import { TextField, Text } from '@adobe/react-spectrum';

<TextField
    label="Project Name"
    placeholder="Enter project name..."
    value={state.projectName}
    onChange={(value) => updateState({ projectName: normalizeProjectName(value) })}
    validationState={getProjectNameValidationState(state.projectName)}
    errorMessage={...}
    width="size-6000"
    isRequired
/>

// After
import { TextField, Text } from '@/core/ui/components/aria';

<TextField
    label="Project Name"
    placeholder="Enter project name..."
    value={state.projectName}
    onChange={(value) => updateState({ projectName: normalizeProjectName(value) })}
    isInvalid={getProjectNameValidationState(state.projectName) === 'invalid'}
    errorMessage={...}
    className="w-[360px]"
    isRequired
/>
```

**ReviewStep Migration:**
```typescript
// Before
import { View, Text, Flex, Heading, Divider } from '@adobe/react-spectrum';

<Heading level={2} marginBottom="size-200">
    {state.projectName}
</Heading>
<Divider size="S" marginBottom="size-200" />

// After
import { View, Text, Flex, Heading, Divider } from '@/core/ui/components/aria';

<Heading level={2} marginBottom="size-200">
    {state.projectName}
</Heading>
<Divider size="S" marginBottom="size-200" />
```

**ProjectCreationStep Migration:**
```typescript
// Before
import { Text, Flex, Button } from '@adobe/react-spectrum';

<Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
    <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />
    <Text UNSAFE_className="text-xl font-medium">Project Created Successfully</Text>
    <Button variant="cta" onPress={handleOpenProject}>View Projects</Button>
</Flex>

// After
import { Text, Flex, Button } from '@/core/ui/components/aria';

<Flex direction="column" gap="size-200" alignItems="center" maxWidth="600px">
    <CheckmarkCircle size="L" className="text-green-600" />
    <Text className="text-xl font-medium">Project Created Successfully</Text>
    <Button variant="cta" onPress={handleOpenProject}>View Projects</Button>
</Flex>
```

**Tests to Write First:**

- [ ] Test: WelcomeStep validates project name format
  - **Given:** WelcomeStep with invalid project name "My Project"
  - **When:** User types the name
  - **Then:** Validation error shows "Use lowercase letters, numbers, and hyphens only"
  - **File:** `tests/features/project-creation/ui/steps/WelcomeStep.test.tsx`

- [ ] Test: WelcomeStep detects duplicate project names
  - **Given:** WelcomeStep with existingProjectNames=["my-demo"]
  - **When:** User types "my-demo"
  - **Then:** Validation error shows "A project with this name already exists"
  - **File:** `tests/features/project-creation/ui/steps/WelcomeStep.test.tsx`

- [ ] Test: WelcomeStep enables Continue with valid name and selections
  - **Given:** WelcomeStep with valid name, package, and stack
  - **When:** All required fields filled
  - **Then:** setCanProceed(true) is called
  - **File:** `tests/features/project-creation/ui/steps/WelcomeStep.test.tsx`

- [ ] Test: ReviewStep displays all configuration sections
  - **Given:** ReviewStep with complete state
  - **When:** Component renders
  - **Then:** Package, Architecture, Adobe I/O, and Components sections display
  - **File:** `tests/features/project-creation/ui/steps/ReviewStep.test.tsx`

- [ ] Test: ReviewStep shows Adobe org/project/workspace
  - **Given:** ReviewStep with adobeOrg, adobeProject, adobeWorkspace
  - **When:** Component renders
  - **Then:** Adobe I/O section shows all three values
  - **File:** `tests/features/project-creation/ui/steps/ReviewStep.test.tsx`

- [ ] Test: ProjectCreationStep shows mesh check loading
  - **Given:** ProjectCreationStep with phase='checking-mesh'
  - **When:** Component renders
  - **Then:** LoadingDisplay shows "Checking API Mesh Access"
  - **File:** `tests/features/project-creation/ui/steps/ProjectCreationStep.test.tsx`

- [ ] Test: ProjectCreationStep shows success with View Projects button
  - **Given:** ProjectCreationStep with phase='completed'
  - **When:** Component renders
  - **Then:** Success message and "View Projects" button display
  - **File:** `tests/features/project-creation/ui/steps/ProjectCreationStep.test.tsx`

- [ ] Test: ProjectCreationStep handles cancellation
  - **Given:** ProjectCreationStep during creation
  - **When:** User clicks Cancel
  - **Then:** 'cancel-project-creation' message sent
  - **File:** `tests/features/project-creation/ui/steps/ProjectCreationStep.test.tsx`

**Acceptance Criteria:**
- [ ] All 3 files migrated
- [ ] TextField validation works correctly
- [ ] No `UNSAFE_className` usage
- [ ] PageFooter integration preserved
- [ ] All tests pass

**Estimated Time:** 2.5 hours

---

### Task 8.6: Complete WizardContainer Migration

**Files:**
- [ ] `src/features/project-creation/ui/wizard/WizardContainer.tsx`

**Current Spectrum Usage:**
```typescript
// Before
import {
    View,
    Flex,
    Heading,
    Button,
    Text,
} from '@adobe/react-spectrum';

<View
    backgroundColor="gray-50"
    width="100%"
    height="100vh"
    UNSAFE_className={cn('flex', 'overflow-hidden')}
>
    <PageHeader
        title={state.editMode ? "Edit Project" : "Create Demo Project"}
        subtitle={currentStepName}
        description={currentStepDescription}
    />

    <PageFooter
        leftContent={<Button variant="secondary" onPress={handleCancel} isQuiet>Cancel</Button>}
        rightContent={
            <Flex gap="size-100">
                <Button variant="secondary" onPress={goBack} isQuiet>Back</Button>
                <Button variant="accent" onPress={goNext} isDisabled={!canProceed}>
                    {getNextButtonText(...)}
                </Button>
            </Flex>
        }
    />
</View>
```

**Migration Pattern:**
```typescript
// After
import { View, Flex, Heading, Button, Text } from '@/core/ui/components/aria';

<View
    backgroundColor="gray-50"
    width="100%"
    height="100vh"
    className={cn('flex', 'overflow-hidden')}
>
    <PageHeader
        title={state.editMode ? "Edit Project" : "Create Demo Project"}
        subtitle={currentStepName}
        description={currentStepDescription}
    />

    <PageFooter
        leftContent={<Button variant="secondary" onPress={handleCancel} isQuiet>Cancel</Button>}
        rightContent={
            <Flex gap="size-100">
                <Button variant="secondary" onPress={goBack} isQuiet>Back</Button>
                <Button variant="accent" onPress={goNext} isDisabled={!canProceed}>
                    {getNextButtonText(...)}
                </Button>
            </Flex>
        }
    />
</View>
```

**Special Handling - Inline Style Block:**
WizardContainer contains inline `<style>` for step transition animations. These should be preserved or moved to CSS Module:

```typescript
// Option 1: Keep inline (temporary during migration)
<style>{`
    .step-content { ... }
    .step-content.transitioning { ... }
`}</style>

// Option 2: Move to CSS Module (preferred)
// src/features/project-creation/ui/wizard/wizard.module.css
.stepContent {
    opacity: 1;
    transform: translateX(0);
}
.stepContent.transitioning {
    opacity: 0;
}
.stepContent.transitioning.forward {
    transform: translateX(-20px);
}
.stepContent.transitioning.backward {
    transform: translateX(20px);
}
```

**Tests to Write First:**

- [ ] Test: WizardContainer renders current step
  - **Given:** WizardContainer with state.currentStep='welcome'
  - **When:** Component renders
  - **Then:** WelcomeStep component displays
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer.test.tsx`

- [ ] Test: WizardContainer navigation back button works
  - **Given:** WizardContainer on step index > 0
  - **When:** User clicks Back
  - **Then:** Previous step displays, animation direction is 'backward'
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer.test.tsx`

- [ ] Test: WizardContainer Continue button disabled when canProceed=false
  - **Given:** WizardContainer with canProceed=false
  - **When:** Component renders
  - **Then:** Continue button is disabled
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer.test.tsx`

- [ ] Test: WizardContainer shows loading overlay during confirmation
  - **Given:** WizardContainer with isConfirmingSelection=true
  - **When:** Component renders
  - **Then:** LoadingOverlay is visible
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer.test.tsx`

- [ ] Test: WizardContainer handles architecture change
  - **Given:** WizardContainer with selectedStack
  - **When:** handleArchitectureChange called with new stack
  - **Then:** componentConfigs filtered, completedSteps reset to ['welcome']
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer.test.tsx`

- [ ] Test: WizardContainer hides footer on project-creation step
  - **Given:** WizardContainer with state.currentStep='project-creation'
  - **When:** Component renders
  - **Then:** PageFooter not rendered (step has own buttons)
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer.test.tsx`

**Acceptance Criteria:**
- [ ] All Spectrum imports replaced
- [ ] No `UNSAFE_className` usage
- [ ] Step transitions animate correctly
- [ ] Focus trap works with new components
- [ ] All tests pass

**Estimated Time:** 2 hours

---

### Task 8.7: Wizard Integration Tests

**Purpose:** Validate the complete wizard flow works correctly after all step migrations.

**Integration Test File:** `tests/features/project-creation/ui/wizard/WizardIntegration.test.tsx`

**Tests to Write:**

- [ ] Test: Complete wizard flow - Welcome to Review
  - **Given:** WizardContainer with initial state
  - **When:** User completes each step and clicks Continue
  - **Then:** Each step transition works, state accumulates correctly
  - **File:** `tests/features/project-creation/ui/wizard/WizardIntegration.test.tsx`

- [ ] Test: Wizard back navigation clears dependent state
  - **Given:** Wizard on adobe-workspace step
  - **When:** User navigates back to adobe-project
  - **Then:** adobeWorkspace state is cleared
  - **File:** `tests/features/project-creation/ui/wizard/WizardIntegration.test.tsx`

- [ ] Test: Wizard sidebar navigation integration
  - **Given:** Wizard with sidebar navigation handler
  - **When:** Sidebar requests navigation to completed step
  - **Then:** Wizard navigates to requested step
  - **File:** `tests/features/project-creation/ui/wizard/WizardIntegration.test.tsx`

- [ ] Test: Wizard ErrorBoundary catches step errors
  - **Given:** Wizard step that throws error
  - **When:** Error occurs during render
  - **Then:** ErrorBoundary displays error UI, wizard doesn't crash
  - **File:** `tests/features/project-creation/ui/wizard/WizardIntegration.test.tsx`

- [ ] Test: Wizard preserves state across navigation
  - **Given:** Wizard with component selections made
  - **When:** User navigates back and forward
  - **Then:** Previous selections are preserved
  - **File:** `tests/features/project-creation/ui/wizard/WizardIntegration.test.tsx`

**Acceptance Criteria:**
- [ ] All integration tests pass
- [ ] Wizard flow works end-to-end
- [ ] No regressions from pre-migration behavior

**Estimated Time:** 3 hours

---

## Provider/Theme Migration (Deferred Reference)

The following files use `Provider` and `defaultTheme` and are deferred to Step 9:

- `src/features/project-creation/ui/App.tsx`
- `src/features/sidebar/ui/index.tsx`
- `webview-ui/src/*/index.tsx` (all webview entry points)

These files wrap the entire application in Spectrum's theme provider. Step 9 will:
1. Remove Provider/defaultTheme
2. Replace with CSS custom properties
3. Ensure VS Code theme integration via CSS variables

---

## ProgressBar Component (If Not Already Created)

If ProgressBar was not created in Steps 1-5, create it in this step:

**File:** `src/core/ui/components/aria/ProgressBar.tsx`

```typescript
import { ProgressBar as AriaProgressBar, Label } from 'react-aria-components';
import { cn } from '@/core/ui/utils/classNames';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
    label?: string;
    value: number;
    maxValue?: number;
    size?: 'S' | 'M' | 'L';
    className?: string;
    isIndeterminate?: boolean;
    'aria-label'?: string;
}

export function ProgressBar({
    label,
    value,
    maxValue = 100,
    size = 'M',
    className,
    isIndeterminate = false,
    'aria-label': ariaLabel,
}: ProgressBarProps) {
    return (
        <AriaProgressBar
            value={isIndeterminate ? undefined : value}
            maxValue={maxValue}
            isIndeterminate={isIndeterminate}
            aria-label={ariaLabel || label}
            className={cn(styles.progressBar, styles[`size${size}`], className)}
        >
            {({ percentage }) => (
                <>
                    {label && <Label className={styles.label}>{label}</Label>}
                    <div className={styles.track}>
                        <div
                            className={cn(styles.fill, isIndeterminate && styles.indeterminate)}
                            style={isIndeterminate ? undefined : { width: `${percentage}%` }}
                        />
                    </div>
                </>
            )}
        </AriaProgressBar>
    );
}
```

**CSS Module:** `src/core/ui/components/aria/ProgressBar.module.css`

```css
.progressBar {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
}

.label {
    font-size: 12px;
    color: var(--spectrum-gray-700);
}

.track {
    height: 4px;
    background: var(--spectrum-gray-300);
    border-radius: 2px;
    overflow: hidden;
}

.fill {
    height: 100%;
    background: var(--spectrum-blue-900);
    border-radius: 2px;
    transition: width 0.2s ease-out;
}

.indeterminate {
    width: 50%;
    animation: indeterminateSlide 1.5s ease-in-out infinite;
}

@keyframes indeterminateSlide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(300%); }
}

.sizeS .track { height: 2px; }
.sizeS .label { font-size: 11px; }

.sizeL .track { height: 6px; }
.sizeL .label { font-size: 14px; }
```

---

## Estimated Effort Summary

| Task | Files | Estimated Time |
|------|-------|----------------|
| 8.1 Authentication Steps | 3 | 1.5 hours |
| 8.2 ComponentSelectionStep | 1 | 2 hours |
| 8.3 PrerequisitesStep | 1 | 2 hours |
| 8.4 ApiMeshStep | 1 | 1 hour |
| 8.5 Project Creation Steps | 3 | 2.5 hours |
| 8.6 WizardContainer | 1 | 2 hours |
| 8.7 Integration Tests | - | 3 hours |
| **Total** | **10** | **14 hours** |

---

## Acceptance Criteria

- [ ] All 10 wizard step files migrated to `@/core/ui/components/aria` imports
- [ ] No `@adobe/react-spectrum` imports in wizard files (except icons)
- [ ] No `UNSAFE_className` usage - all converted to `className`
- [ ] Picker components replaced with Select
- [ ] ProgressBar component created or imported
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Wizard navigation works correctly (forward/back)
- [ ] State persistence works across step changes
- [ ] Validation gates function correctly
- [ ] Focus management preserved
- [ ] Build succeeds with no TypeScript errors

---

## Verification Commands

```bash
# Run all wizard step tests
npm test -- tests/features/authentication/ui/steps/
npm test -- tests/features/components/ui/steps/
npm test -- tests/features/prerequisites/ui/steps/
npm test -- tests/features/mesh/ui/steps/
npm test -- tests/features/project-creation/ui/

# Check for remaining Spectrum imports in wizard files
grep -r "from '@adobe/react-spectrum'" \
  src/features/authentication/ui/steps/ \
  src/features/components/ui/steps/ \
  src/features/prerequisites/ui/steps/ \
  src/features/mesh/ui/steps/ \
  src/features/project-creation/ui/

# Check for remaining UNSAFE_className
grep -r "UNSAFE_className" \
  src/features/authentication/ui/steps/ \
  src/features/components/ui/steps/ \
  src/features/prerequisites/ui/steps/ \
  src/features/mesh/ui/steps/ \
  src/features/project-creation/ui/

# Build verification
npm run build
```

---

## Rollback Instructions

If this step needs to be reverted:

1. **Revert wizard step files:** `git checkout src/features/*/ui/steps/`
2. **Revert wizard container:** `git checkout src/features/project-creation/ui/wizard/`
3. **Keep previous migrations:** Steps 6-7 changes remain intact
4. **Verify:** `npm run build && npm test`

**Rollback Impact:** Medium - reverts wizard migration but preserves feature UI migrations.

**Note:** Wizard steps can be individually reverted since migration is step-by-step.

---

## Notes

### Spectrum Icons Unchanged
Icons from `@spectrum-icons/workflow` remain unchanged - they work independently of the component library and require no migration.

### CSS Module Integration
Many wizard steps already use CSS Modules (e.g., `prerequisites.module.css`). These are preserved and work with React Aria components.

### Focus Management
The `useFocusTrap` hook in WizardContainer should work with React Aria components. Verify focus behavior after migration.

### State Management
Wizard state management (via hooks) is component-library agnostic and should work unchanged after migration.

### Error Handling
The ErrorBoundary wrapping each step should continue to work with React Aria components.

### Validation Pattern
The `setCanProceed` callback pattern should work unchanged - it's called by steps to enable/disable the Continue button.
