# Step 7: Migrate Feature UIs (Features)

**Purpose:** Replace Adobe Spectrum imports in feature UI modules with the React Aria components created in Steps 1-5. This is the bulk of the migration work, covering 48 files across 10 feature directories.

**Prerequisites:**
- [ ] Step 1 complete: Infrastructure and react-aria-components installed
- [ ] Step 2 complete: Primitive components (Text, Heading, Flex, View, Divider)
- [ ] Step 3 complete: Interactive components (Button, ActionButton, ProgressCircle)
- [ ] Step 4 complete: Form components (TextField, SearchField, Checkbox, Select, ProgressBar)
- [ ] Step 5 complete: Overlay components (Dialog, Menu, MenuTrigger)
- [ ] Step 6 complete: Core UI components migrated

---

## Migration Scope Overview

### Files by Feature (48 total, 2 deferred)

| Feature | File Count | Priority | Complexity |
|---------|------------|----------|------------|
| projects-dashboard | 9 | High | Medium |
| project-creation | 9 (1 deferred) | High | High |
| eds | 12 | Medium | Medium |
| dashboard | 4 | High | Medium |
| sidebar | 5 (1 deferred) | Medium | Low |
| mesh | 4 | Medium | Low |
| components | 4 | Medium | High (Picker) |
| authentication | 3 | Medium | Low |
| prerequisites | 2 | Medium | Low |

### Deferred to Step 9 (Theme System)
- `src/features/project-creation/ui/App.tsx` - Uses `Provider`, `defaultTheme`
- `src/features/sidebar/ui/index.tsx` - Uses `Provider`, `defaultTheme`

### Complex Components Requiring Special Handling
- **Picker/Item** - Used in ComponentSelectionStep, GitHubRepoSelectionStep, EdsRepositoryConfigStep, DataSourceConfigStep
- **MenuTrigger/Menu** - Used in ProjectsDashboard, ProjectActionsMenu
- **ListView** - Used in ProjectListView (deferred to Step 8)
- **DialogContainer** - Used in BrandGallery, DaLiveSetupStep

---

## Test Strategy

### Testing Approach
- **Framework:** Jest with @testing-library/react
- **Coverage Goal:** 85% for migrated components
- **Test Location:** Tests in existing `tests/features/` directories

### Pre-Migration Verification
Before migrating each feature, verify existing tests pass:
```bash
npm test -- tests/features/[feature-name]/
```

### Post-Migration Verification
After each file migration:
```bash
npm test -- tests/features/[feature-name]/
```

---

## Implementation Tasks

### Task 7.1: Migrate Projects Dashboard (9 files)

**Priority:** High - Main entry point, high visibility

**Files:**
- [ ] `src/features/projects-dashboard/ui/ProjectsDashboard.tsx`
- [ ] `src/features/projects-dashboard/ui/components/ProjectCard.tsx`
- [ ] `src/features/projects-dashboard/ui/components/ProjectRow.tsx`
- [ ] `src/features/projects-dashboard/ui/components/ProjectRowList.tsx`
- [ ] `src/features/projects-dashboard/ui/components/ProjectButton.tsx`
- [ ] `src/features/projects-dashboard/ui/components/ProjectButtonGrid.tsx`
- [ ] `src/features/projects-dashboard/ui/components/ProjectListView.tsx` (Deferred if uses ListView)
- [ ] `src/features/projects-dashboard/ui/components/ProjectActionsMenu.tsx`
- [ ] `src/features/projects-dashboard/ui/components/DashboardEmptyState.tsx`

**Migration Pattern for ProjectsDashboard.tsx:**
```typescript
// Before
import {
    View,
    Flex,
    Text,
    Button,
    ProgressCircle,
    MenuTrigger,
    Menu,
    Item,
} from '@adobe/react-spectrum';

<Flex alignItems="start" gap="size-300">
    <View flex>
        <SearchHeader ... />
    </View>
    <MenuTrigger>
        <Button variant="cta">
            <Text>New</Text>
        </Button>
        <Menu onAction={...}>
            {(item) => <Item key={item.key}>{item.label}</Item>}
        </Menu>
    </MenuTrigger>
</Flex>

// After
import { View, Flex, Text, Button, ProgressCircle, Menu, MenuItem } from '@/core/ui/components/aria';

<Flex alignItems="start" gap="size-300">
    <View flex>
        <SearchHeader ... />
    </View>
    <Menu
        trigger={
            <Button variant="cta">
                <Text>New</Text>
            </Button>
        }
        onAction={...}
    >
        {(item) => <MenuItem key={item.key}>{item.label}</MenuItem>}
    </Menu>
</Flex>
```

**Tests to Write First:**

- [ ] Test: ProjectsDashboard renders loading state
  - **Given:** ProjectsDashboard with isLoading=true
  - **When:** Component renders
  - **Then:** ProgressCircle displays with aria-label
  - **File:** `tests/features/projects-dashboard/ui/ProjectsDashboard.test.tsx`

- [ ] Test: ProjectsDashboard renders project cards
  - **Given:** ProjectsDashboard with projects array
  - **When:** Component renders
  - **Then:** ProjectCard components display for each project
  - **File:** `tests/features/projects-dashboard/ui/ProjectsDashboard.test.tsx`

- [ ] Test: ProjectCard displays project info
  - **Given:** ProjectCard with project data
  - **When:** Component renders
  - **Then:** Name, status, port display correctly
  - **File:** `tests/features/projects-dashboard/ui/components/ProjectCard.test.tsx`

- [ ] Test: ProjectActionsMenu opens and selects item
  - **Given:** ProjectActionsMenu with actions
  - **When:** User clicks trigger, then menu item
  - **Then:** onAction callback fires with correct key
  - **File:** `tests/features/projects-dashboard/ui/components/ProjectActionsMenu.test.tsx`

- [ ] Test: DashboardEmptyState shows create CTA
  - **Given:** DashboardEmptyState with onCreate callback
  - **When:** User clicks create button
  - **Then:** onCreate fires
  - **File:** `tests/features/projects-dashboard/ui/components/DashboardEmptyState.test.tsx`

**Acceptance Criteria:**
- [ ] All 9 files migrated to `@/core/ui/components/aria` imports
- [ ] No `@adobe/react-spectrum` imports remain
- [ ] No `UNSAFE_className` - all converted to `className`
- [ ] Existing tests pass
- [ ] Visual output identical

**Estimated Time:** 3 hours

---

### Task 7.2: Migrate Dashboard Feature (4 files)

**Priority:** High - Project control panel

**Files:**
- [ ] `src/features/dashboard/ui/ProjectDashboardScreen.tsx`
- [ ] `src/features/dashboard/ui/components/ActionGrid.tsx`
- [ ] `src/features/dashboard/ui/configure/ConfigureScreen.tsx`
- [ ] `src/features/dashboard/ui/configure/configureHelpers.tsx`

**Migration Pattern for ProjectDashboardScreen.tsx:**
```typescript
// Before
import {
    View,
    Flex,
    Button,
    ProgressCircle,
} from '@adobe/react-spectrum';

<Flex alignItems="center" gap="size-300">
    <View flex>
        <StatusCard ... />
    </View>
    <Button variant="secondary" onPress={handleNavigateBack}>
        All Projects
    </Button>
</Flex>

{meshStatus === 'authenticating' && (
    <ProgressCircle size="S" isIndeterminate UNSAFE_className="loading-spinner-small" />
)}

// After
import { View, Flex, Button, ProgressCircle } from '@/core/ui/components/aria';

<Flex alignItems="center" gap="size-300">
    <View flex>
        <StatusCard ... />
    </View>
    <Button variant="secondary" onPress={handleNavigateBack}>
        All Projects
    </Button>
</Flex>

{meshStatus === 'authenticating' && (
    <ProgressCircle size="S" isIndeterminate className="loading-spinner-small" />
)}
```

**Tests to Write First:**

- [ ] Test: ProjectDashboardScreen renders project name
  - **Given:** ProjectDashboardScreen with project prop
  - **When:** Component renders
  - **Then:** Project name displays in header
  - **File:** `tests/features/dashboard/ui/ProjectDashboardScreen.test.tsx`

- [ ] Test: ProjectDashboardScreen shows mesh status
  - **Given:** ProjectDashboardScreen with hasMesh=true
  - **When:** Component renders
  - **Then:** Mesh status indicator displays
  - **File:** `tests/features/dashboard/ui/ProjectDashboardScreen.test.tsx`

- [ ] Test: ActionGrid renders all action buttons
  - **Given:** ActionGrid with all props
  - **When:** Component renders
  - **Then:** Start, Stop, Open, Logs buttons visible
  - **File:** `tests/features/dashboard/ui/components/ActionGrid.test.tsx`

- [ ] Test: ConfigureScreen renders configuration sections
  - **Given:** ConfigureScreen with config data
  - **When:** Component renders
  - **Then:** Configuration sections display
  - **File:** `tests/features/dashboard/ui/configure/ConfigureScreen.test.tsx`

**Acceptance Criteria:**
- [ ] All 4 files migrated
- [ ] No Spectrum imports remain
- [ ] Dashboard functionality preserved
- [ ] All tests pass

**Estimated Time:** 2 hours

---

### Task 7.3: Migrate Project Creation Feature (8 files)

**Priority:** High - Core wizard functionality

**Files:**
- [ ] `src/features/project-creation/ui/wizard/WizardContainer.tsx`
- [ ] `src/features/project-creation/ui/wizard/index.tsx`
- [ ] `src/features/project-creation/ui/steps/WelcomeStep.tsx`
- [ ] `src/features/project-creation/ui/steps/ReviewStep.tsx`
- [ ] `src/features/project-creation/ui/steps/ProjectCreationStep.tsx`
- [ ] `src/features/project-creation/ui/steps/reviewStepHelpers.tsx`
- [ ] `src/features/project-creation/ui/components/StackSelector.tsx`
- [ ] `src/features/project-creation/ui/components/BrandGallery.tsx`

**Note:** `App.tsx` deferred to Step 9 (uses Provider/defaultTheme)

**Migration Pattern for WizardContainer.tsx:**
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
    <Flex gap="size-100">
        <Button variant="secondary" onPress={goBack} isQuiet isDisabled={isConfirmingSelection}>
            Back
        </Button>
        <Button variant="accent" onPress={goNext} isDisabled={!canProceed}>
            {getNextButtonText(...)}
        </Button>
    </Flex>
</View>

// After
import { View, Flex, Heading, Button, Text } from '@/core/ui/components/aria';

<View
    backgroundColor="gray-50"
    width="100%"
    height="100vh"
    className={cn('flex', 'overflow-hidden')}
>
    <Flex gap="size-100">
        <Button variant="secondary" onPress={goBack} isQuiet isDisabled={isConfirmingSelection}>
            Back
        </Button>
        <Button variant="accent" onPress={goNext} isDisabled={!canProceed}>
            {getNextButtonText(...)}
        </Button>
    </Flex>
</View>
```

**Migration Pattern for BrandGallery.tsx (DialogContainer):**
```typescript
// Before
import { Text, DialogContainer, Checkbox, Divider } from '@adobe/react-spectrum';

<DialogContainer onDismiss={onClose}>
    {isOpen && <BrandDialog brand={selectedBrand} onClose={onClose} />}
</DialogContainer>

// After
import { Text, Dialog, Checkbox, Divider } from '@/core/ui/components/aria';

<Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
    <BrandDialog brand={selectedBrand} onClose={onClose} />
</Dialog>
```

**Tests to Write First:**

- [ ] Test: WizardContainer renders current step
  - **Given:** WizardContainer with wizard configuration
  - **When:** Component renders
  - **Then:** Current step component displays
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer.test.tsx`

- [ ] Test: WizardContainer navigation buttons work
  - **Given:** WizardContainer on step 2
  - **When:** User clicks Back button
  - **Then:** Previous step displays
  - **File:** `tests/features/project-creation/ui/wizard/WizardContainer.test.tsx`

- [ ] Test: WelcomeStep renders project name field
  - **Given:** WelcomeStep with state
  - **When:** Component renders
  - **Then:** TextField for project name displays
  - **File:** `tests/features/project-creation/ui/steps/WelcomeStep.test.tsx`

- [ ] Test: ReviewStep shows configuration summary
  - **Given:** ReviewStep with complete state
  - **When:** Component renders
  - **Then:** All configuration sections display
  - **File:** `tests/features/project-creation/ui/steps/ReviewStep.test.tsx`

- [ ] Test: BrandGallery opens dialog on brand click
  - **Given:** BrandGallery with brands
  - **When:** User clicks brand card
  - **Then:** Dialog opens with brand details
  - **File:** `tests/features/project-creation/ui/components/BrandGallery.test.tsx`

**Acceptance Criteria:**
- [ ] All 8 files migrated (App.tsx deferred)
- [ ] Wizard navigation works correctly
- [ ] Step transitions animate properly
- [ ] Form validation preserved
- [ ] All tests pass

**Estimated Time:** 4 hours

---

### Task 7.4: Migrate EDS Feature (12 files)

**Priority:** Medium - Edge Delivery Services integration

**Files:**
- [ ] `src/features/eds/ui/steps/ConnectServicesStep.tsx`
- [ ] `src/features/eds/ui/steps/GitHubSetupStep.tsx`
- [ ] `src/features/eds/ui/steps/GitHubRepoSelectionStep.tsx`
- [ ] `src/features/eds/ui/steps/DaLiveSetupStep.tsx`
- [ ] `src/features/eds/ui/steps/DataSourceConfigStep.tsx`
- [ ] `src/features/eds/ui/steps/EdsRepositoryConfigStep.tsx`
- [ ] `src/features/eds/ui/components/GitHubAuthPanel.tsx`
- [ ] `src/features/eds/ui/components/DaLiveAuthPanel.tsx`
- [ ] `src/features/eds/ui/components/GitHubServiceCard.tsx`
- [ ] `src/features/eds/ui/components/DaLiveServiceCard.tsx`
- [ ] `src/features/eds/ui/components/VerifiedField.tsx`

**Migration Pattern for GitHubSetupStep.tsx:**
```typescript
// Before
import { Avatar, Text } from '@adobe/react-spectrum';

<Flex gap="size-100" alignItems="center">
    <Avatar src={user.avatarUrl} alt={user.login} size="avatar-size-100" />
    <Text UNSAFE_className="text-md font-medium">{user.login}</Text>
</Flex>

// After
import { Text } from '@/core/ui/components/aria';
// Avatar: use img with className since React Aria doesn't have Avatar

<div className="flex gap-2 items-center">
    <img src={user.avatarUrl} alt={user.login} className="avatar-sm rounded-full" />
    <Text className="text-md font-medium">{user.login}</Text>
</div>
```

**Migration Pattern for GitHubRepoSelectionStep.tsx (complex with Picker):**
```typescript
// Before
import { Text, Picker, Item, Flex, TextField, ... } from '@adobe/react-spectrum';

<Picker
    selectedKey={selectedOrg}
    onSelectionChange={(key) => setSelectedOrg(key as string)}
>
    {organizations.map((org) => (
        <Item key={org.login}>{org.login}</Item>
    ))}
</Picker>

// After
import { Text, Select, SelectItem, Flex, TextField, ... } from '@/core/ui/components/aria';

<Select
    selectedKey={selectedOrg}
    onSelectionChange={(key) => setSelectedOrg(key as string)}
>
    {organizations.map((org) => (
        <SelectItem key={org.login}>{org.login}</SelectItem>
    ))}
</Select>
```

**Tests to Write First:**

- [ ] Test: ConnectServicesStep shows service cards
  - **Given:** ConnectServicesStep in wizard
  - **When:** Component renders
  - **Then:** GitHub and DA.live service cards display
  - **File:** `tests/features/eds/ui/steps/ConnectServicesStep.test.tsx`

- [ ] Test: GitHubSetupStep shows authenticated user
  - **Given:** GitHubSetupStep with authenticated user
  - **When:** Component renders
  - **Then:** User avatar and name display
  - **File:** `tests/features/eds/ui/steps/GitHubSetupStep.test.tsx`

- [ ] Test: GitHubRepoSelectionStep organization picker works
  - **Given:** GitHubRepoSelectionStep with organizations
  - **When:** User selects organization
  - **Then:** Selection updates state
  - **File:** `tests/features/eds/ui/steps/GitHubRepoSelectionStep.test.tsx`

- [ ] Test: DaLiveServiceCard shows connection status
  - **Given:** DaLiveServiceCard with connected state
  - **When:** Component renders
  - **Then:** Connected status indicator displays
  - **File:** `tests/features/eds/ui/components/DaLiveServiceCard.test.tsx`

- [ ] Test: VerifiedField shows validation state
  - **Given:** VerifiedField with valid input
  - **When:** Validation completes
  - **Then:** Success icon displays
  - **File:** `tests/features/eds/ui/components/VerifiedField.test.tsx`

**Acceptance Criteria:**
- [ ] All 12 files migrated
- [ ] Picker components replaced with Select
- [ ] Avatar replaced with styled img
- [ ] OAuth flows work correctly
- [ ] All tests pass

**Estimated Time:** 4 hours

---

### Task 7.5: Migrate Components Feature (4 files)

**Priority:** Medium - Component selection uses Picker

**Files:**
- [ ] `src/features/components/ui/steps/ComponentSelectionStep.tsx`
- [ ] `src/features/components/ui/steps/ComponentConfigStep.tsx`
- [ ] `src/features/components/ui/components/ConfigFieldRenderer.tsx`
- [ ] `src/features/components/ui/components/ConfigNavigationPanel.tsx`

**Migration Pattern for ComponentSelectionStep.tsx (complex with Picker + Checkbox):**
```typescript
// Before
import { View, Flex, Text, Picker, Item, Checkbox } from '@adobe/react-spectrum';

<Picker
    width="100%"
    selectedKey={selectedFrontend}
    onSelectionChange={(key) => setSelectedFrontend(key as string)}
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

// After
import { View, Flex, Text, Select, SelectItem, Checkbox } from '@/core/ui/components/aria';

<Select
    selectedKey={selectedFrontend}
    onSelectionChange={(key) => setSelectedFrontend(key as string)}
    className="w-full cursor-pointer"
>
    {frontendOptions.map((opt) => (
        <SelectItem key={opt.id} textValue={opt.name}>
            <Text>{opt.name}</Text>
            <Text className="text-sm text-gray-500">{opt.description}</Text>
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

**Tests to Write First:**

- [ ] Test: ComponentSelectionStep renders frontend picker
  - **Given:** ComponentSelectionStep with frontend options
  - **When:** Component renders
  - **Then:** Frontend picker displays with options
  - **File:** `tests/features/components/ui/steps/ComponentSelectionStep.test.tsx`

- [ ] Test: ComponentSelectionStep locked dependencies stay selected
  - **Given:** ComponentSelectionStep with locked dependency
  - **When:** User attempts to uncheck
  - **Then:** Checkbox remains selected (disabled)
  - **File:** `tests/features/components/ui/steps/ComponentSelectionStep.test.tsx`

- [ ] Test: ComponentConfigStep renders config fields
  - **Given:** ComponentConfigStep with component configs
  - **When:** Component renders
  - **Then:** Configuration fields display
  - **File:** `tests/features/components/ui/steps/ComponentConfigStep.test.tsx`

- [ ] Test: ConfigFieldRenderer renders correct field type
  - **Given:** ConfigFieldRenderer with type="text"
  - **When:** Component renders
  - **Then:** TextField component displays
  - **File:** `tests/features/components/ui/components/ConfigFieldRenderer.test.tsx`

**Acceptance Criteria:**
- [ ] All 4 files migrated
- [ ] Picker replaced with Select component
- [ ] Checkbox functionality preserved
- [ ] Locked dependencies remain locked
- [ ] All tests pass

**Estimated Time:** 3 hours

---

### Task 7.6: Migrate Sidebar Feature (4 files)

**Priority:** Medium - Navigation sidebar

**Files:**
- [ ] `src/features/sidebar/ui/Sidebar.tsx`
- [ ] `src/features/sidebar/ui/components/SidebarNav.tsx`
- [ ] `src/features/sidebar/ui/components/WizardProgress.tsx`
- [ ] `src/features/sidebar/ui/views/UtilityBar.tsx`

**Note:** `index.tsx` deferred to Step 9 (uses Provider/defaultTheme)

**Migration Pattern for Sidebar.tsx:**
```typescript
// Before
import { Flex, Text, ActionButton, Divider } from '@adobe/react-spectrum';

<Flex direction="column" gap="size-100">
    <ActionButton isQuiet onPress={onBack}>
        <ChevronLeft size="S" />
        <Text>Back</Text>
    </ActionButton>
    <Divider size="S" />
</Flex>

// After
import { Flex, Text, ActionButton, Divider } from '@/core/ui/components/aria';

<Flex direction="column" gap="size-100">
    <ActionButton isQuiet onPress={onBack}>
        <ChevronLeft size="S" />
        <Text>Back</Text>
    </ActionButton>
    <Divider size="S" />
</Flex>
```

**Tests to Write First:**

- [ ] Test: Sidebar renders navigation items
  - **Given:** Sidebar with navigation config
  - **When:** Component renders
  - **Then:** Nav items display in order
  - **File:** `tests/features/sidebar/ui/Sidebar.test.tsx`

- [ ] Test: SidebarNav highlights current item
  - **Given:** SidebarNav with currentItem set
  - **When:** Component renders
  - **Then:** Current item has active styling
  - **File:** `tests/features/sidebar/ui/components/SidebarNav.test.tsx`

- [ ] Test: WizardProgress shows step indicators
  - **Given:** WizardProgress with steps
  - **When:** Component renders
  - **Then:** All step indicators display
  - **File:** `tests/features/sidebar/ui/components/WizardProgress.test.tsx`

**Acceptance Criteria:**
- [ ] All 4 files migrated (index.tsx deferred)
- [ ] Navigation works correctly
- [ ] Step progress indicators display
- [ ] All tests pass

**Estimated Time:** 1.5 hours

---

### Task 7.7: Migrate Mesh Feature (4 files)

**Priority:** Medium - API Mesh deployment

**Files:**
- [ ] `src/features/mesh/ui/steps/ApiMeshStep.tsx`
- [ ] `src/features/mesh/ui/steps/MeshDeploymentStep.tsx`
- [ ] `src/features/mesh/ui/steps/components/MeshStatusDisplay.tsx`
- [ ] `src/features/mesh/ui/steps/components/MeshErrorDialog.tsx`

**Migration Pattern for ApiMeshStep.tsx:**
```typescript
// Before
import { Text, Flex, Button } from '@adobe/react-spectrum';

<Flex direction="column" gap="size-200">
    <Text UNSAFE_className="text-gray-700">{statusMessage}</Text>
    <Button variant="primary" onPress={handleDeploy}>
        Deploy API Mesh
    </Button>
</Flex>

// After
import { Text, Flex, Button } from '@/core/ui/components/aria';

<Flex direction="column" gap="size-200">
    <Text className="text-gray-700">{statusMessage}</Text>
    <Button variant="primary" onPress={handleDeploy}>
        Deploy API Mesh
    </Button>
</Flex>
```

**Migration Pattern for MeshErrorDialog.tsx (DialogTrigger):**
```typescript
// Before
import { Flex, Text, DialogTrigger, ActionButton } from '@adobe/react-spectrum';

<DialogTrigger>
    <ActionButton>View Details</ActionButton>
    <ErrorDialog error={error} />
</DialogTrigger>

// After
import { Flex, Text, Dialog, ActionButton } from '@/core/ui/components/aria';

// Use controlled dialog pattern
const [isOpen, setIsOpen] = useState(false);

<>
    <ActionButton onPress={() => setIsOpen(true)}>View Details</ActionButton>
    <Dialog isOpen={isOpen} onOpenChange={setIsOpen}>
        <ErrorDialogContent error={error} onClose={() => setIsOpen(false)} />
    </Dialog>
</>
```

**Tests to Write First:**

- [ ] Test: ApiMeshStep shows deploy button
  - **Given:** ApiMeshStep with mesh not deployed
  - **When:** Component renders
  - **Then:** Deploy button is enabled
  - **File:** `tests/features/mesh/ui/steps/ApiMeshStep.test.tsx`

- [ ] Test: MeshDeploymentStep shows progress
  - **Given:** MeshDeploymentStep during deployment
  - **When:** Component renders
  - **Then:** Progress indicator displays
  - **File:** `tests/features/mesh/ui/steps/MeshDeploymentStep.test.tsx`

- [ ] Test: MeshStatusDisplay shows status text
  - **Given:** MeshStatusDisplay with status="deployed"
  - **When:** Component renders
  - **Then:** "Deployed" status displays
  - **File:** `tests/features/mesh/ui/steps/components/MeshStatusDisplay.test.tsx`

- [ ] Test: MeshErrorDialog shows error details
  - **Given:** MeshErrorDialog with error object
  - **When:** User opens dialog
  - **Then:** Error message displays
  - **File:** `tests/features/mesh/ui/steps/components/MeshErrorDialog.test.tsx`

**Acceptance Criteria:**
- [ ] All 4 files migrated
- [ ] DialogTrigger converted to controlled Dialog
- [ ] Deployment flow works
- [ ] All tests pass

**Estimated Time:** 2 hours

---

### Task 7.8: Migrate Authentication Feature (3 files)

**Priority:** Medium - Adobe authentication steps

**Files:**
- [ ] `src/features/authentication/ui/steps/AdobeAuthStep.tsx`
- [ ] `src/features/authentication/ui/steps/AdobeProjectStep.tsx`
- [ ] `src/features/authentication/ui/steps/AdobeWorkspaceStep.tsx`

**Migration Pattern:**
```typescript
// Before
import { Text } from '@adobe/react-spectrum';

<Text UNSAFE_className="text-gray-700">{message}</Text>

// After
import { Text } from '@/core/ui/components/aria';

<Text className="text-gray-700">{message}</Text>
```

**Tests to Write First:**

- [ ] Test: AdobeAuthStep shows login button
  - **Given:** AdobeAuthStep with unauthenticated state
  - **When:** Component renders
  - **Then:** Sign in button displays
  - **File:** `tests/features/authentication/ui/steps/AdobeAuthStep.test.tsx`

- [ ] Test: AdobeProjectStep shows project list
  - **Given:** AdobeProjectStep with projects
  - **When:** Component renders
  - **Then:** Project list displays
  - **File:** `tests/features/authentication/ui/steps/AdobeProjectStep.test.tsx`

- [ ] Test: AdobeWorkspaceStep shows workspace options
  - **Given:** AdobeWorkspaceStep with workspaces
  - **When:** Component renders
  - **Then:** Workspace options display
  - **File:** `tests/features/authentication/ui/steps/AdobeWorkspaceStep.test.tsx`

**Acceptance Criteria:**
- [ ] All 3 files migrated
- [ ] Authentication flow preserved
- [ ] All tests pass

**Estimated Time:** 1 hour

---

### Task 7.9: Migrate Prerequisites Feature (2 files)

**Priority:** Medium - Tool checking step

**Files:**
- [ ] `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`
- [ ] `src/features/prerequisites/ui/steps/hooks/prerequisiteRenderers.tsx`

**Migration Pattern for PrerequisitesStep.tsx:**
```typescript
// Before
import { View, Flex, Text, Button, ProgressBar } from '@adobe/react-spectrum';

<Text marginBottom="size-200" UNSAFE_className={cn('text-gray-700', 'text-md')}>
    Checking required tools...
</Text>

<View marginTop="size-100" UNSAFE_className="animate-fade-in">
    <ProgressBar label={progressLabel} value={progressValue} maxValue={100} size="S" />
</View>

<Button variant="secondary" onPress={() => checkPrerequisites(true)} isDisabled={isChecking}>
    Recheck
</Button>

// After
import { View, Flex, Text, Button, ProgressBar } from '@/core/ui/components/aria';

<Text marginBottom="size-200" className={cn('text-gray-700', 'text-md')}>
    Checking required tools...
</Text>

<View marginTop="size-100" className="animate-fade-in">
    <ProgressBar label={progressLabel} value={progressValue} maxValue={100} size="S" />
</View>

<Button variant="secondary" onPress={() => checkPrerequisites(true)} isDisabled={isChecking}>
    Recheck
</Button>
```

**Tests to Write First:**

- [ ] Test: PrerequisitesStep shows checking status
  - **Given:** PrerequisitesStep during check
  - **When:** Check in progress
  - **Then:** Progress bar displays
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

- [ ] Test: PrerequisitesStep shows install button for failed check
  - **Given:** PrerequisitesStep with failed prerequisite
  - **When:** Component renders
  - **Then:** Install button displays for installable items
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

- [ ] Test: PrerequisitesStep recheck button works
  - **Given:** PrerequisitesStep with checks complete
  - **When:** User clicks Recheck
  - **Then:** Checks restart
  - **File:** `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

**Acceptance Criteria:**
- [ ] All 2 files migrated
- [ ] Progress bar displays correctly
- [ ] Install/Recheck buttons work
- [ ] All tests pass

**Estimated Time:** 1.5 hours

---

## Deferred Migrations

The following files are deferred to later steps:

### Step 8 (Complex Components)
- `src/features/projects-dashboard/ui/components/ProjectListView.tsx` - Uses ListView (virtualized list)

### Step 9 (Theme System)
- `src/features/project-creation/ui/App.tsx` - Uses Provider, defaultTheme
- `src/features/sidebar/ui/index.tsx` - Uses Provider, defaultTheme

---

## Estimated Effort Summary

| Task | Files | Estimated Time |
|------|-------|----------------|
| 7.1 Projects Dashboard | 9 | 3 hours |
| 7.2 Dashboard | 4 | 2 hours |
| 7.3 Project Creation | 8 | 4 hours |
| 7.4 EDS | 12 | 4 hours |
| 7.5 Components | 4 | 3 hours |
| 7.6 Sidebar | 4 | 1.5 hours |
| 7.7 Mesh | 4 | 2 hours |
| 7.8 Authentication | 3 | 1 hour |
| 7.9 Prerequisites | 2 | 1.5 hours |
| **Total** | **50** | **22 hours** |

---

## Acceptance Criteria

- [ ] All 46 non-deferred files migrated to `@/core/ui/components/aria` imports
- [ ] No `@adobe/react-spectrum` imports in migrated files
- [ ] No `UNSAFE_className` usage - all converted to `className`
- [ ] All existing tests pass (run full test suite)
- [ ] Visual regression: components render identically
- [ ] Functionality preserved: all interactions work
- [ ] Picker components replaced with Select
- [ ] DialogTrigger/MenuTrigger converted to controlled patterns
- [ ] Build succeeds with no TypeScript errors

---

## Verification Commands

```bash
# Run all feature tests
npm test -- tests/features/

# Check for remaining Spectrum imports in features
grep -r "from '@adobe/react-spectrum'" src/features/*/ui/

# Check for remaining UNSAFE_className in features
grep -r "UNSAFE_className" src/features/*/ui/

# Build verification
npm run build
```

---

## Rollback Instructions

If this step needs to be reverted:

1. **Revert feature imports:** `git checkout src/features/`
2. **Keep React Aria components:** Components created in Steps 2-5 remain intact
3. **Keep core migrations:** Changes from Step 6 remain intact
4. **Verify:** `npm run build && npm test`

**Rollback Impact:** Medium - reverts feature UI migrations but preserves core migrations.

**Note:** Features can be individually reverted since migration is file-by-file.

---

## Notes

### Import Path Change
All Spectrum imports change from:
```typescript
import { X, Y, Z } from '@adobe/react-spectrum';
```
To:
```typescript
import { X, Y, Z } from '@/core/ui/components/aria';
```

### UNSAFE_className Removal
Replace all instances of:
```typescript
UNSAFE_className="some-class"
```
With:
```typescript
className="some-class"
```

### Picker to Select Migration
Picker components use different API:
```typescript
// Before (Spectrum Picker)
<Picker selectedKey={key} onSelectionChange={handler}>
    <Item key="a">Option A</Item>
</Picker>

// After (React Aria Select)
<Select selectedKey={key} onSelectionChange={handler}>
    <SelectItem key="a">Option A</SelectItem>
</Select>
```

### DialogTrigger to Controlled Dialog
DialogTrigger requires conversion to controlled pattern:
```typescript
// Before (uncontrolled)
<DialogTrigger>
    <Button>Open</Button>
    <Dialog>Content</Dialog>
</DialogTrigger>

// After (controlled)
const [isOpen, setIsOpen] = useState(false);
<Button onPress={() => setIsOpen(true)}>Open</Button>
<Dialog isOpen={isOpen} onOpenChange={setIsOpen}>Content</Dialog>
```

### MenuTrigger Simplification
MenuTrigger is simplified:
```typescript
// Before
<MenuTrigger>
    <ActionButton>Menu</ActionButton>
    <Menu onAction={handler}>
        <Item key="a">Item A</Item>
    </Menu>
</MenuTrigger>

// After
<Menu trigger={<ActionButton>Menu</ActionButton>} onAction={handler}>
    <MenuItem key="a">Item A</MenuItem>
</Menu>
```

### Spectrum Icons Unchanged
Icons from `@spectrum-icons/workflow` remain unchanged - they work independently of the component library.

### CSS Modules Preserved
Existing CSS Modules (e.g., `prerequisites.module.css`, `projects-dashboard.module.css`) are preserved and continue to work with the new components.

### Avatar Component
React Aria doesn't have Avatar. Replace with styled img:
```typescript
// Before
<Avatar src={url} alt={name} size="avatar-size-100" />

// After
<img src={url} alt={name} className="avatar-sm rounded-full" />
```
