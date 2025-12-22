# Step 3: ProjectDashboardScreen Decomposition

## Purpose

Decompose god file (417 lines, 22 hooks) to improve maintainability per SOP code-patterns.md Section 12 (Minimize Over-Engineering). The file violates the 300-line guideline with mixed concerns: status display, action handlers, message subscriptions, and UI rendering.

## Prerequisites

- [ ] Step 1 complete (timeout constants - already in this file)
- [ ] Step 2 complete (inline styles fixed)
- [ ] Understand existing hook extraction pattern in `configure/hooks/`

## Analysis of Current State

**Hook inventory (22 total):**
- 5 `useState` calls (projectStatus, isRunning, isTransitioning, isOpeningBrowser, isLogsHoverSuppressed)
- 1 `useRef` call (statusRequestedRef)
- 1 `useFocusTrap` call
- 2 `useEffect` calls (message subscriptions, initial focus)
- 11 `useCallback` calls (all action handlers)
- 2 `useMemo` calls (demoStatusDisplay, meshStatusDisplay)

**Mixed concerns:**
1. **State & subscriptions** - Message handling, status updates
2. **Action handlers** - 11 different user actions
3. **Status computation** - Demo and mesh status displays
4. **UI rendering** - Status header and action grid

## Extraction Strategy

Follow the pattern established in `configure/hooks/` directory.

### Extract 1: `useDashboardActions` Hook

**Purpose:** Consolidate all 11 action handlers.

**Location:** `src/features/dashboard/ui/hooks/useDashboardActions.ts`

**Moves from parent:**
- `handleStartDemo`
- `handleStopDemo`
- `handleReAuthenticate`
- `handleViewLogs`
- `handleDeployMesh`
- `handleOpenBrowser`
- `handleConfigure`
- `handleOpenDevConsole`
- `handleDeleteProject`
- `handleNavigateBack`
- `handleViewComponents`

### Extract 2: `useDashboardStatus` Hook

**Purpose:** Consolidate status state, subscriptions, and computed displays.

**Location:** `src/features/dashboard/ui/hooks/useDashboardStatus.ts`

**Moves from parent:**
- State: `projectStatus`, `isRunning`, `isTransitioning`
- Ref: `statusRequestedRef`
- Message subscriptions (`useEffect` for statusUpdate/meshStatusUpdate)
- Status displays: `demoStatusDisplay`, `meshStatusDisplay`
- Helper imports: `isMeshDeploying`, `isMeshBusy`

### Extract 3: `ActionGrid` Component

**Purpose:** Isolate the 9-button action grid UI.

**Location:** `src/features/dashboard/ui/components/ActionGrid.tsx`

**Moves from parent:**
- GridLayout with all ActionButton components (lines 313-411)
- Receives handlers and disabled states as props

## Tests to Write First (RED phase)

### Test 3.1: useDashboardActions returns all handlers

```typescript
// tests/features/dashboard/ui/hooks/useDashboardActions.test.ts
import { renderHook } from '@testing-library/react';
import { useDashboardActions } from '@/features/dashboard/ui/hooks/useDashboardActions';

describe('useDashboardActions', () => {
  it('should return all action handlers', () => {
    const { result } = renderHook(() =>
      useDashboardActions({
        isOpeningBrowser: false,
        setIsTransitioning: jest.fn(),
        setIsOpeningBrowser: jest.fn(),
        setIsLogsHoverSuppressed: jest.fn(),
      })
    );

    expect(result.current.handleStartDemo).toBeDefined();
    expect(result.current.handleStopDemo).toBeDefined();
    expect(result.current.handleOpenBrowser).toBeDefined();
    expect(result.current.handleViewLogs).toBeDefined();
    expect(result.current.handleDeployMesh).toBeDefined();
    expect(result.current.handleConfigure).toBeDefined();
    expect(result.current.handleNavigateBack).toBeDefined();
  });

  it('should prevent double-click on Open Browser when already opening', () => {
    const setIsOpeningBrowser = jest.fn();
    const { result } = renderHook(() =>
      useDashboardActions({
        isOpeningBrowser: true,
        setIsTransitioning: jest.fn(),
        setIsOpeningBrowser,
        setIsLogsHoverSuppressed: jest.fn(),
      })
    );

    result.current.handleOpenBrowser();
    expect(setIsOpeningBrowser).not.toHaveBeenCalled();
  });
});
```

### Test 3.2: useDashboardStatus computes displays correctly

```typescript
// tests/features/dashboard/ui/hooks/useDashboardStatus.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardStatus } from '@/features/dashboard/ui/hooks/useDashboardStatus';

// Mock webviewClient
jest.mock('@/core/ui/utils/WebviewClient', () => ({
  webviewClient: {
    postMessage: jest.fn(),
    onMessage: jest.fn(() => jest.fn()),
  },
}));

describe('useDashboardStatus', () => {
  it('should return initial state', () => {
    const { result } = renderHook(() => useDashboardStatus({ hasMesh: true }));

    expect(result.current.projectStatus).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isTransitioning).toBe(false);
  });

  it('should compute demo status display for running state', async () => {
    const { result } = renderHook(() => useDashboardStatus({ hasMesh: false }));

    // Simulate status update through mock
    // (Implementation detail - verify demoStatusDisplay computation)
    expect(result.current.demoStatusDisplay).toBeDefined();
    expect(result.current.demoStatusDisplay.color).toBeDefined();
    expect(result.current.demoStatusDisplay.text).toBeDefined();
  });
});
```

### Test 3.3: ActionGrid renders all buttons

```typescript
// tests/features/dashboard/ui/components/ActionGrid.test.tsx
import { render, screen } from '@testing-library/react';
import { ActionGrid } from '@/features/dashboard/ui/components/ActionGrid';
import { Provider, defaultTheme } from '@adobe/react-spectrum';

const mockHandlers = {
  handleStartDemo: jest.fn(),
  handleStopDemo: jest.fn(),
  handleOpenBrowser: jest.fn(),
  handleViewLogs: jest.fn(),
  handleDeployMesh: jest.fn(),
  handleConfigure: jest.fn(),
  handleViewComponents: jest.fn(),
  handleOpenDevConsole: jest.fn(),
  handleDeleteProject: jest.fn(),
};

describe('ActionGrid', () => {
  it('should render Start button when not running', () => {
    render(
      <Provider theme={defaultTheme}>
        <ActionGrid
          isRunning={false}
          isStartDisabled={false}
          isStopDisabled={false}
          isMeshActionDisabled={false}
          isOpeningBrowser={false}
          isLogsHoverSuppressed={false}
          {...mockHandlers}
        />
      </Provider>
    );

    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('should render Stop button when running', () => {
    render(
      <Provider theme={defaultTheme}>
        <ActionGrid
          isRunning={true}
          isStartDisabled={false}
          isStopDisabled={false}
          isMeshActionDisabled={false}
          isOpeningBrowser={false}
          isLogsHoverSuppressed={false}
          {...mockHandlers}
        />
      </Provider>
    );

    expect(screen.getByText('Stop')).toBeInTheDocument();
  });
});
```

## Files to Create

| New File | Purpose | Est. Lines |
|----------|---------|------------|
| `hooks/useDashboardActions.ts` | All 11 action handlers | ~80 |
| `hooks/useDashboardStatus.ts` | Status state, subscriptions, displays | ~120 |
| `components/ActionGrid.tsx` | 9-button action grid | ~100 |
| `components/index.ts` | Component exports | ~5 |

## Files to Modify

| File | Change |
|------|--------|
| `ProjectDashboardScreen.tsx` | Import and use extracted hooks/components |
| `hooks/index.ts` | Export new hooks |

## Implementation Details

### RED Phase

Write failing tests for:
- [ ] `useDashboardActions` - All handlers defined, double-click prevention
- [ ] `useDashboardStatus` - Initial state, status computation
- [ ] `ActionGrid` - Button rendering based on running state

### GREEN Phase

#### 1. Create `hooks/useDashboardActions.ts`

```typescript
interface UseDashboardActionsProps {
  isOpeningBrowser: boolean;
  setIsTransitioning: Dispatch<SetStateAction<boolean>>;
  setIsOpeningBrowser: Dispatch<SetStateAction<boolean>>;
  setIsLogsHoverSuppressed: Dispatch<SetStateAction<boolean>>;
}

interface UseDashboardActionsReturn {
  handleStartDemo: () => void;
  handleStopDemo: () => void;
  handleReAuthenticate: () => void;
  handleViewLogs: () => void;
  handleDeployMesh: () => void;
  handleOpenBrowser: () => void;
  handleConfigure: () => void;
  handleOpenDevConsole: () => void;
  handleDeleteProject: () => void;
  handleNavigateBack: () => void;
  handleViewComponents: () => void;
}
```

#### 2. Create `hooks/useDashboardStatus.ts`

```typescript
interface UseDashboardStatusProps {
  hasMesh?: boolean;
}

interface UseDashboardStatusReturn {
  projectStatus: ProjectStatus | null;
  isRunning: boolean;
  isTransitioning: boolean;
  setIsTransitioning: Dispatch<SetStateAction<boolean>>;
  demoStatusDisplay: { color: StatusColor; text: string };
  meshStatusDisplay: { color: StatusColor; text: string } | null;
  displayName: string;
  status: ProjectStatus['status'];
  meshStatus: MeshStatus | undefined;
}
```

#### 3. Create `components/ActionGrid.tsx`

Props interface:
```typescript
interface ActionGridProps {
  isRunning: boolean;
  isStartDisabled: boolean;
  isStopDisabled: boolean;
  isMeshActionDisabled: boolean;
  isOpeningBrowser: boolean;
  isLogsHoverSuppressed: boolean;
  handleStartDemo: () => void;
  handleStopDemo: () => void;
  handleOpenBrowser: () => void;
  handleViewLogs: () => void;
  handleDeployMesh: () => void;
  handleConfigure: () => void;
  handleViewComponents: () => void;
  handleOpenDevConsole: () => void;
  handleDeleteProject: () => void;
}
```

#### 4. Update `ProjectDashboardScreen.tsx`

After extraction:
```typescript
export function ProjectDashboardScreen({ project, hasMesh }: ProjectDashboardScreenProps) {
  const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);
  const [isLogsHoverSuppressed, setIsLogsHoverSuppressed] = useState(false);

  const containerRef = useFocusTrap<HTMLDivElement>({ ... });

  const {
    projectStatus, isRunning, isTransitioning, setIsTransitioning,
    demoStatusDisplay, meshStatusDisplay, displayName, status, meshStatus,
  } = useDashboardStatus({ hasMesh });

  const actions = useDashboardActions({
    isOpeningBrowser, setIsTransitioning, setIsOpeningBrowser, setIsLogsHoverSuppressed,
  });

  // Initial focus effect (keep - small, specific to this component)

  // Button disabled states (keep - derived from hook state)
  const isStartDisabled = isStartActionDisabled(isTransitioning, meshStatus, status);
  const isStopDisabled = isTransitioning || status === 'stopping';
  const isMeshActionDisabled = isTransitioning || isMeshBusy(meshStatus);

  return (
    // ... PageLayout with StatusHeader inline (small) and ActionGrid component
  );
}
```

### REFACTOR Phase

- [ ] Remove dead code from parent
- [ ] Verify hook interfaces are minimal (no unnecessary props)
- [ ] Add JSDoc comments to new files
- [ ] Update `hooks/index.ts` exports

## Expected Outcome

- `ProjectDashboardScreen.tsx` reduced from 417 to ~150-180 lines
- State logic centralized in `useDashboardStatus`
- Action handlers centralized in `useDashboardActions`
- Action grid UI isolated in `ActionGrid` component
- Easier to test (hooks testable independently)
- Follows established pattern from `configure/hooks/`

## Acceptance Criteria

- [ ] `useDashboardActions` extracts all 11 handlers
- [ ] `useDashboardStatus` extracts state, subscriptions, and computed displays
- [ ] `ActionGrid` component handles button rendering
- [ ] `ProjectDashboardScreen.tsx` is <200 lines
- [ ] All new files have JSDoc comments
- [ ] All new hooks exported via `hooks/index.ts`
- [ ] All new components exported via `components/index.ts`
- [ ] Tests pass for extracted hooks and components
- [ ] No visual regressions (manual verification)

## Dependencies

- Step 1 and Step 2 must be complete
- TIMEOUTS constant from Step 1 is already in this file

## Estimated Time

2-3 hours

## Notes

- Keep StatusHeader inline in parent (only ~50 lines, includes mesh auth button logic tightly coupled to parent state)
- Follow existing pattern from `useConfigureActions.ts` for hook structure
- The `dashboardPredicates.ts` file already exists with `isStartActionDisabled` - no changes needed there
