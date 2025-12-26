# Step 9: Updates, Projects-Dashboard, and Sidebar Feature Tests (28 files)

> **Phase:** 3 - Feature Tests
> **Step:** 9 of 9
> **Features:** updates (8), projects-dashboard (11), sidebar (9)
> **Test Files:** 28 total
> **Estimated Time:** 2-3 hours

---

## Purpose

Audit the remaining smaller feature areas to ensure tests accurately reflect current implementation:
- **Updates** (8 files): Auto-update checking, version comparison, component updates
- **Projects-Dashboard** (11 files): Project listing, status display, project cards
- **Sidebar** (9 files): Navigation, view providers, wizard progress

---

## Prerequisites

- [ ] Steps 1-8 complete or in parallel
- [ ] All current tests pass before starting audit
- [ ] Read current implementation structures for all three features

---

## Test Files to Audit

### Updates Feature (8 files)

#### Commands (2 files)

- [ ] `tests/features/updates/commands/checkUpdates.security.test.ts`
- [ ] `tests/features/updates/commands/checkUpdates.test.ts`

#### Services (6 files)

- [ ] `tests/features/updates/services/componentUpdater.test.ts`
- [ ] `tests/features/updates/services/extensionUpdater.test.ts`
- [ ] `tests/features/updates/services/updateManager-channels.test.ts`
- [ ] `tests/features/updates/services/updateManager-checking.test.ts`
- [ ] `tests/features/updates/services/updateManager-components.test.ts`
- [ ] `tests/features/updates/services/updateManager-submodules.test.ts`

---

### Projects-Dashboard Feature (11 files)

#### UI (5 files)

- [ ] `tests/features/projects-dashboard/ui/ProjectsDashboard.helpers.test.ts`
- [ ] `tests/features/projects-dashboard/ui/ProjectsDashboard.test.tsx`
- [ ] `tests/features/projects-dashboard/ui/components/DashboardEmptyState.test.tsx`
- [ ] `tests/features/projects-dashboard/ui/components/ProjectCard.test.tsx`
- [ ] `tests/features/projects-dashboard/ui/components/ProjectsGrid.test.tsx`

#### Utils (1 file)

- [ ] `tests/features/projects-dashboard/utils/projectStatusUtils.test.ts`

#### Commands (2 files)

- [ ] `tests/features/projects-dashboard/commands/showProjectsList-sidebar.test.ts`
- [ ] `tests/features/projects-dashboard/commands/showProjectsList.test.ts`

#### Handlers (2 files)

- [ ] `tests/features/projects-dashboard/handlers/dashboardHandlers.test.ts`
- [ ] `tests/features/projects-dashboard/handlers/selectProject-navigation.test.ts`

#### Services (1 file)

- [ ] `tests/features/projects-dashboard/services/settingsSerializer.test.ts`

---

### Sidebar Feature (9 files)

#### UI (4 files)

- [ ] `tests/features/sidebar/ui/Sidebar.test.tsx`
- [ ] `tests/features/sidebar/ui/components/SidebarNav.test.tsx`
- [ ] `tests/features/sidebar/ui/components/WizardProgress.test.tsx`
- [ ] `tests/features/sidebar/ui/views/views-removal.test.ts`

#### Types (1 file)

- [ ] `tests/features/sidebar/types.test.ts`

#### Integration (2 files)

- [ ] `tests/features/sidebar/integration/extensionActivation.test.ts`
- [ ] `tests/features/sidebar/integration/navigationCommands.test.ts`

#### Providers (1 file)

- [ ] `tests/features/sidebar/providers/sidebarProvider.test.ts`

#### Handlers (1 file)

- [ ] `tests/features/sidebar/handlers/sidebarHandlers.test.ts`

---

## Audit Checklists

### Updates Feature Checklist

#### 1. Update Channel Types

```typescript
// VERIFY: Update channels match current definitions
// Check src/features/updates/types.ts

type UpdateChannel = 'stable' | 'beta';
// Verify all channels exist
```

#### 2. Version Comparison Logic

```typescript
// VERIFY: Version comparison tests match current semver logic
// Check src/features/updates/services/updateManager.ts

// Example: Version comparison
expect(isNewerVersion('1.2.0', '1.1.0')).toBe(true);
expect(isNewerVersion('1.1.0', '1.2.0')).toBe(false);
```

#### 3. Component Update Flow

```typescript
// VERIFY: Component update tests match current flow
// Check src/features/updates/services/componentUpdater.ts

// Key areas:
// - Snapshot creation
// - Update application
// - Rollback on failure
// - .env merging
```

#### 4. GitHub Releases Integration

```typescript
// VERIFY: GitHub API mocks match actual response shape
// Check src/features/updates/ for API usage

// Example: Release response
const release = {
  tag_name: 'v1.2.0',
  assets: [...],
  // Verify structure
};
```

---

### Projects-Dashboard Feature Checklist

#### 1. Project Info Types

```typescript
// VERIFY: Project info types match current definitions
// Check src/features/projects-dashboard/types.ts

interface ProjectInfo {
  name: string;
  path: string;
  status: ProjectStatus;
  // Verify all fields
}
```

#### 2. Project Card Props

```typescript
// VERIFY: ProjectCard props match current component
// Check src/features/projects-dashboard/ui/components/ProjectCard.tsx

const props = {
  project: ProjectInfo,
  onSelect: (project) => void,
  onDelete: (project) => void,
  // Verify all props
};
```

#### 3. Project Status Display

```typescript
// VERIFY: Status display tests match current status values
// Check src/features/projects-dashboard/utils/projectStatusUtils.ts

// Example: Status mapping
const statusDisplay = {
  running: { icon: 'play', color: 'green' },
  stopped: { icon: 'stop', color: 'gray' },
  // Verify mappings
};
```

#### 4. Navigation After Selection

```typescript
// VERIFY: Navigation tests match current flow
// Check src/features/projects-dashboard/handlers/

// Key areas:
// - Project selection handler
// - Navigation to dashboard
// - State updates
```

---

### Sidebar Feature Checklist

#### 1. Sidebar View Types

```typescript
// VERIFY: View types match current definitions
// Check src/features/sidebar/types.ts

type SidebarView =
  | 'projects'
  | 'wizard'
  | 'dashboard';
// Verify all views
```

#### 2. Wizard Progress State

```typescript
// VERIFY: Wizard progress tests match current state
// Check src/features/sidebar/ui/components/WizardProgress.tsx

const progress = {
  currentStep: number,
  totalSteps: number,
  completedSteps: string[],
  // Verify structure
};
```

#### 3. Navigation Commands

```typescript
// VERIFY: Navigation command tests match current commands
// Check package.json for command definitions

const commands = [
  'demoBuilder.showProjects',
  'demoBuilder.showDashboard',
  // Verify all commands
];
```

#### 4. Provider Registration

```typescript
// VERIFY: Provider registration tests match current setup
// Check src/features/sidebar/providers/sidebarProvider.ts

// Key areas:
// - WebviewViewProvider implementation
// - View container registration
// - Message handling
```

---

## Key Source Files to Reference

### Updates

| Source File | Purpose |
|-------------|---------|
| `src/features/updates/types.ts` | Type definitions |
| `src/features/updates/services/` | Update services |
| `src/features/updates/commands/` | Update commands |

### Projects-Dashboard

| Source File | Purpose |
|-------------|---------|
| `src/features/projects-dashboard/types.ts` | Type definitions |
| `src/features/projects-dashboard/ui/` | UI components |
| `src/features/projects-dashboard/handlers/` | Handlers |

### Sidebar

| Source File | Purpose |
|-------------|---------|
| `src/features/sidebar/types.ts` | Type definitions |
| `src/features/sidebar/ui/` | UI components |
| `src/features/sidebar/providers/` | WebviewViewProvider |

---

## Common Issues to Look For

### Issue 1: Update Channel Names

```typescript
// OLD: Might use different channel names
const channel = 'release';

// CURRENT: Verify channel names
const channel = 'stable';
```

### Issue 2: Project Status Values

```typescript
// OLD: String literals
const status = 'active';

// CURRENT: Use status type/enum
const status = ProjectStatus.RUNNING;
```

### Issue 3: Sidebar View Names

```typescript
// OLD: View IDs might have changed
const viewId = 'demo-builder-projects';

// CURRENT: Verify against package.json
const viewId = 'demoBuilder.projectsView';
```

### Issue 4: Settings Serialization

```typescript
// OLD: Direct JSON
const settings = JSON.stringify(config);

// CURRENT: May use serializer
const settings = settingsSerializer.serialize(config);
```

---

## Expected Outcomes

After auditing all 28 test files in these three features:

### Updates

- [ ] All update channel tests match current channels
- [ ] All version comparison tests match current logic
- [ ] All component update tests match current flow
- [ ] All GitHub API mocks match actual responses

### Projects-Dashboard

- [ ] All project info tests match current types
- [ ] All project card tests match current props
- [ ] All status display tests match current mappings
- [ ] All navigation tests match current flow

### Sidebar

- [ ] All view type tests match current views
- [ ] All wizard progress tests match current state
- [ ] All navigation command tests match current commands
- [ ] All provider tests match current registration

---

## Acceptance Criteria

- [ ] All 8 updates test files reviewed
- [ ] All 11 projects-dashboard test files reviewed
- [ ] All 9 sidebar test files reviewed
- [ ] Mock data matches current TypeScript interfaces
- [ ] All tests pass
- [ ] No hardcoded values where constants exist
- [ ] No version-specific logic remains

---

## Notes

- These are smaller features - should audit faster
- Updates feature is security-sensitive (verify GitHub API handling)
- Projects-dashboard is user-facing - verify status displays
- Sidebar integrates with all views - watch for consistency

---

## Implementation Log

_To be filled during audit_

### Files Audited

#### Updates

_List files as they are completed_

#### Projects-Dashboard

_List files as they are completed_

#### Sidebar

_List files as they are completed_

### Issues Found

_Document any issues requiring follow-up_

### Mock Updates Made

_Track mock structure changes for cross-feature consistency_
