# Step 2: Migrate Welcome Feature

## Purpose

Migrate the Welcome webview UI from `webview-ui/src/welcome/` to `src/features/welcome/ui/`, establishing the pattern for subsequent feature migrations. This is the simplest feature (3 files, no dependencies) chosen deliberately to validate the migration approach with minimal risk.

**What This Step Accomplishes:**
- Welcome screen UI components moved to feature-based location
- Import paths updated from `@/webview-ui/*` to `@/features/*` and `@/shared/*`
- Tests migrated to tests/features/welcome/ui/ directory (mirror structure)
- Welcome bundle builds successfully from new location
- Extension command references updated bundle path

**Criticality:** MEDIUM - Validates migration pattern, but failure is isolated to Welcome screen only.

---

## Prerequisites

**Completed Steps:**
- ✅ Step 1: Webpack + Config Setup (webpack.config.js configured for feature paths)

**Required Knowledge:**
- Understanding of current Welcome screen implementation (webview-ui/src/welcome/)
- Familiarity with extension command that loads Welcome webview
- Knowledge of React component structure and testing patterns

**Existing Code to Review:**
- `webview-ui/src/welcome/index.tsx` - Entry point
- `webview-ui/src/welcome/WelcomeScreen.tsx` - Main component
- `webview-ui/src/welcome/ProjectCard.tsx` - Subcomponent
- `webview-ui/src/welcome/EmptyState.tsx` - Subcomponent (if exists)
- `src/commands/welcomeWebview.ts` - Extension command loading webview
- `tests/` directory - Existing tests for Welcome components

---

## Tests to Write First

### Test Scenario 1: Welcome Screen Renders

**Given:** Welcome entry point at `src/features/welcome/ui/index.tsx`
**When:** Webpack builds welcome-bundle.js
**Then:**
- Bundle builds successfully without errors
- Bundle size is smaller than baseline (vendors extracted)
- No import resolution errors

**Test Type:** Integration test (build verification)
**Coverage Target:** 100% (build must succeed)

### Test Scenario 2: WelcomeScreen Component Displays

**Given:** WelcomeScreen component with recent projects list
**When:** Component renders with mock project data
**Then:**
- Component renders without errors
- Project cards display for each project
- Empty state shows when no projects
- All interactive elements respond correctly

**Test Type:** Unit test (React Testing Library)
**Coverage Target:** 85%
**Test File:** `src/features/welcome/ui/WelcomeScreen.test.tsx`

### Test Scenario 3: ProjectCard Component

**Given:** ProjectCard component with project data
**When:** Component renders with project info
**Then:**
- Project name displays correctly
- Project path displays correctly
- Click handler triggers navigation
- Hover state applies correctly

**Test Type:** Unit test
**Coverage Target:** 85%
**Test File:** `src/features/welcome/ui/ProjectCard.test.tsx`

### Test Scenario 4: Import Path Resolution

**Given:** Welcome components import from `@/core/ui/`
**When:** TypeScript compiler runs
**Then:**
- No import resolution errors
- All shared component imports resolve
- All hook imports resolve correctly

**Test Type:** Integration test (TypeScript compilation)
**Coverage Target:** 100% (no compilation errors)

### Test Scenario 5: Extension Command Loads Welcome

**Given:** Updated bundle path in welcomeWebview.ts command
**When:** User triggers "Demo Builder: Welcome" command
**Then:**
- Webview panel opens successfully
- Welcome bundle loads without errors
- UI renders correctly in VS Code webview

**Test Type:** Integration test (manual in Extension Development Host)
**Coverage Target:** Manual verification

---

## Edge Cases to Test

**Edge Case 1: No Recent Projects**
- **Scenario:** User has never created a project
- **Expected:** EmptyState component displays with call-to-action
- **Test:** Render WelcomeScreen with empty projects array

**Edge Case 2: Invalid Project Path**
- **Scenario:** Recent project directory no longer exists
- **Expected:** ProjectCard shows warning indicator, click shows error message
- **Test:** Mock project with non-existent path

**Edge Case 3: Long Project Names**
- **Scenario:** Project name exceeds 50 characters
- **Expected:** Name truncates with ellipsis, full name in tooltip
- **Test:** Render ProjectCard with 100-character name

---

## Error Conditions to Test

**Error Condition 1: Webpack Build Failure**
- **Trigger:** Missing import in Welcome components
- **Expected Behavior:** Clear webpack error with file/line reference
- **Test:** Temporarily remove import, verify error clarity

**Error Condition 2: Component Render Error**
- **Trigger:** Invalid props passed to WelcomeScreen
- **Expected Behavior:** React error boundary catches, shows fallback UI
- **Test:** Pass invalid props, verify error handling

**Error Condition 3: Bundle Load Failure in VS Code**
- **Trigger:** Incorrect bundle path in extension command
- **Expected Behavior:** Webview shows error message
- **Test:** Intentionally break path, verify error shown

---

## Files to Create/Modify

### Created Files (Migrated from webview-ui/src/welcome/)

#### 1. `src/features/welcome/ui/index.tsx` (ENTRY POINT)

**Source:** `webview-ui/src/welcome/index.tsx`

**Migration Steps:**
1. Copy file to new location
2. Update imports:
   - `@/webview-ui/shared/` → `@/core/ui/`
   - `@/components/` → `@/core/ui/components/`
   - `@/hooks/` → `@/core/ui/hooks/`
3. Verify React root mounting logic unchanged
4. Test that bundle builds

**Expected Content:**
```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WelcomeScreen } from './WelcomeScreen';
// Updated imports from @/core/ui/

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<WelcomeScreen />);
```

#### 2. `src/features/welcome/ui/WelcomeScreen.tsx` (MAIN COMPONENT)

**Source:** `webview-ui/src/welcome/WelcomeScreen.tsx`

**Migration Steps:**
1. Copy component file
2. Update all imports to new paths
3. Review component logic (no changes needed, just imports)
4. Ensure Adobe Spectrum components still imported correctly

**Import Changes:**
```typescript
// OLD
import { ProjectCard } from './ProjectCard';
import { useRecentProjects } from '@/hooks/useRecentProjects';
import { EmptyState } from '@/components/EmptyState';

// NEW
import { ProjectCard } from './ProjectCard';
import { useRecentProjects } from '@/core/ui/hooks/useRecentProjects';
import { EmptyState } from '@/core/ui/components/EmptyState';
```

#### 3. `src/features/welcome/ui/ProjectCard.tsx` (SUBCOMPONENT)

**Source:** `webview-ui/src/welcome/ProjectCard.tsx`

**Migration Steps:**
1. Copy component file
2. Update imports (Spectrum, shared utilities)
3. Verify click handlers still work
4. Test rendering with mock data

#### 4. `tests/core/ui/WelcomeScreen.test.tsx` (MIRRORED TEST)

**Source:** Create new in tests directory (mirrors src/core/ui/)

**Migration Steps:**
1. Create test file in tests/features/welcome/ui/ directory
2. Update imports to reference component location (src/features/welcome/ui/WelcomeScreen)
3. Verify tests still pass after migration
4. Add coverage for edge cases if missing

**Test Structure:**
```typescript
import { render, screen } from '@testing-library/react';
import { WelcomeScreen } from './WelcomeScreen';

describe('WelcomeScreen', () => {
  it('renders welcome message', () => {
    render(<WelcomeScreen />);
    expect(screen.getByText(/Welcome/i)).toBeInTheDocument();
  });

  it('displays recent projects', () => {
    // Test with mock projects
  });

  it('shows empty state when no projects', () => {
    // Test empty state
  });
});
```

#### 5. `tests/features/welcome/ui/ProjectCard.test.tsx` (MIRRORED TEST)

**Source:** Create new in tests directory (mirrors src/features/welcome/ui/)

**Test Structure:**
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectCard } from '@/features/welcome/ui/ProjectCard';

describe('ProjectCard', () => {
  const mockProject = {
    name: 'Test Project',
    path: '/path/to/project',
    lastOpened: new Date()
  };

  it('renders project information', () => {
    render(<ProjectCard project={mockProject} />);
    expect(screen.getByText('Test Project')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const onClick = jest.fn();
    render(<ProjectCard project={mockProject} onClick={onClick} />);
    fireEvent.click(screen.getByText('Test Project'));
    expect(onClick).toHaveBeenCalledWith(mockProject);
  });
});
```

### Modified Files

#### 1. `src/commands/welcomeWebview.ts` (UPDATE BUNDLE PATH)

**Changes:**
```typescript
// OLD
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'welcome-bundle.js')
);

// NEW (no change to path, but verify it loads from new source)
// Bundle path unchanged, but built from src/features/welcome/ui/
const scriptUri = webview.asWebviewUri(
  vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'welcome-bundle.js')
);
```

**Note:** Bundle output path doesn't change, only the source location changes. Verify bundle loads correctly.

#### 2. `src/features/welcome/CLAUDE.md` (if exists - update documentation)

**Changes:**
- Update references from webview-ui/src/welcome/ to src/features/welcome/ui/
- Document new feature-based structure
- Update import examples

---

## Implementation Guidance

### Migration Order

1. **Create directory structure:**
   ```bash
   mkdir -p src/features/welcome/ui
   ```

2. **Copy components (DON'T DELETE OLD YET):**
   ```bash
   cp webview-ui/src/welcome/index.tsx src/features/welcome/ui/
   cp webview-ui/src/welcome/WelcomeScreen.tsx src/features/welcome/ui/
   cp webview-ui/src/welcome/ProjectCard.tsx src/features/welcome/ui/
   ```

3. **Update imports in copied files** (change all @/webview-ui/ to @/core/ui/)

4. **Run TypeScript compiler:**
   ```bash
   npx tsc --noEmit
   ```
   Fix any import errors until clean.

5. **Build webpack:**
   ```bash
   npm run build
   ```
   Verify welcome-bundle.js generates successfully.

6. **Write mirrored tests in tests/ directory:**
   - Create tests/features/welcome/ui/WelcomeScreen.test.tsx
   - Create tests/features/welcome/ui/ProjectCard.test.tsx
   - Run tests: `npm test -- tests/features/welcome`

7. **Manual verification in Extension Development Host:**
   - Press F5 to launch extension
   - Trigger "Demo Builder: Welcome" command
   - Verify UI renders correctly
   - Test all interactions (click project cards, empty state, etc.)

8. **Delete old files (ONLY AFTER VERIFICATION):**
   ```bash
   rm -rf webview-ui/src/welcome/
   ```

9. **Run full test suite:**
   ```bash
   npm test
   ```
   Ensure no regressions.

10. **Commit changes:**
    ```bash
    git add src/features/welcome/
    git add src/commands/welcomeWebview.ts
    git rm -r webview-ui/src/welcome/
    git commit -m "refactor(welcome): migrate to feature-based UI architecture"
    ```

### Import Path Update Strategy

**Automated Search-Replace (Careful!):**
```bash
# In src/features/welcome/ui/ files only
find src/features/welcome/ui -name "*.tsx" -o -name "*.ts" | \
  xargs sed -i '' 's/@\/webview-ui\/shared/@\/core\/ui/g'
```

**Manual Verification Required:**
- Check each file after automated replacement
- Verify imports actually exist at new paths
- Test that TypeScript compiler passes

### Shared Dependencies to Watch

**Components that might need migration:**
- EmptyState component (if in webview-ui/src/shared/components/)
- May need to move to src/core/ui/components/ FIRST
- Coordinate with shared component migration strategy

**Hooks that might need migration:**
- useRecentProjects hook
- useVSCodeAPI hook
- Move to src/core/ui/hooks/ if not already there

---

## Expected Outcome

**After Step 2 Completion:**

✅ **Welcome Feature Migrated:**
- All Welcome UI in src/features/welcome/ui/
- Old webview-ui/src/welcome/ deleted
- Tests in tests/features/welcome/ui/ (mirrors source structure)
- All tests passing (maintain 80%+ coverage)

✅ **Build Working:**
- welcome-bundle.js builds successfully
- Bundle size reduced (vendors extracted)
- No webpack errors or warnings

✅ **Extension Command Working:**
- "Demo Builder: Welcome" command opens webview
- UI renders correctly in VS Code
- All interactions work (click cards, empty state)

✅ **Import Paths Updated:**
- All @/webview-ui/* imports changed to @/features/* or @/core/ui/*
- TypeScript compilation clean
- No import resolution errors

**What Works:**
- Welcome screen fully functional from new location
- Migration pattern validated for subsequent features
- Code splitting working (vendors bundle shared)

**What Doesn't Work Yet:**
- Other webviews still in old location (Dashboard, Configure, Wizard)
- webview-ui/ directory still exists (needed for other features)

**Next Step:** Step 3 - Migrate Dashboard Feature (similar simplicity, different command)

---

## Acceptance Criteria

**Definition of Done for Step 2:**

- [x] Directory created: `src/features/welcome/ui/`
- [x] All Welcome components migrated (index.tsx, WelcomeScreen.tsx, ProjectCard.tsx, EmptyState.tsx)
- [x] All imports updated to new paths (@/core/ui/* for shared components)
- [x] Mirrored tests created in tests/core/ui/ (WelcomeScreen.test.tsx, ProjectCard.test.tsx, EmptyState.test.tsx)
- [x] All tests passing (29 tests, no regressions)
- [x] Coverage maintained at 87.5%+ for Welcome feature (exceeds 85% target)
- [x] Jest config updated to support mirrored tests in tests/features/*/ui/
- [x] Webpack compiles successfully and generates welcome-bundle.js
- [x] Code splitting working (vendors bundle extracted)
- [x] CSS imports updated to use @/webview-ui/* aliases
- [x] Linting issues auto-fixed
- [x] Old directory deleted: `webview-ui/src/welcome/`

**Blocker Conditions:**

- ❌ If tests fail after migration, debug before proceeding
- ❌ If UI doesn't render in VS Code, fix bundle/command issue
- ❌ If imports broken, update path mappings

---

## Dependencies from Other Steps

**Depends On:**
- ✅ Step 1: Webpack + Config Setup (webpack.config.js must work)

**Enables:**
- Step 3: Migrate Dashboard Feature (same pattern, different feature)
- Step 7: Migrate Project Creation Wizard (may import from Welcome if needed)

**Can Run in Parallel With:**
- Step 3: Dashboard migration (independent features)
- Step 4: Configure migration (independent features)

---

## Notes

**Why Welcome First?**
- Simplest feature (3 files, no complex dependencies)
- Low risk (isolated screen, rarely used in workflow)
- Validates migration pattern before complex features
- Quick feedback loop (success or failure fast)

**Shared Component Strategy:**
- If Welcome imports components from webview-ui/src/shared/, those should be moved to src/core/ui/ FIRST
- OR: Keep temporary dual imports during transition
- Shared component migration can happen incrementally

**Test Migration Strategy:**
- Tests in tests/features/*/ui/ mirror src/features/*/ui/ structure
- Keep test structure identical (just move files, update imports)
- If tests break, debug imports (most common issue)

---

_Step 2 validates the migration pattern. Success here confirms approach for remaining 5 features._
