# Dependency Map

**Generated:** $(date '+%Y-%m-%d %H:%M:%S')

## Summary

- **@/core/ui imports:** 89 import statements
- **@/webviews imports:** 0 import statements
- **Feature UI imports:** 220 import statements

## Key Findings

### 1. All webview code already uses @/core/ui
Since there are 0 imports from `@/webviews`, this means:
- All active code imports from `@/core/ui/`
- Files in `src/webviews/` that duplicate `src/core/ui/` are **NOT being used**
- Safe to delete duplicates after verification

### 2. Feature UI has heavy dependency on @/core/ui
With 220 import statements from feature UI directories:
- All wizard steps use `@/core/ui/components/*`
- All wizard steps use `@/core/ui/hooks/*`
- All wizard steps use `@/core/ui/vscode-api`
- All wizard steps use `@/core/ui/types`

### 3. Import Patterns

#### Most Imported from @/core/ui:
1. **vscode-api** - VS Code webview API bridge (used in ~30 files)
2. **LoadingDisplay** - Loading spinner component (used in ~15 files)
3. **FadeTransition** - Transition wrapper (used in ~10 files)
4. **Modal** - Modal dialog component (used in ~5 files)
5. **Types** (WizardState, WizardStep, etc.) - Shared types (used in ~40 files)

#### Hooks Usage:
- `useVSCodeMessage` - Message subscription
- `useVSCodeRequest` - Request-response pattern
- `useLoadingState` - Loading state management
- `useSelection` - Selection management
- `useAsyncData` - Async data fetching
- `useAutoScroll` - Auto-scroll logic
- `useSearchFilter` - Search/filter logic
- `useFocusTrap` - Focus trap for a11y
- `useSelectableDefault` - Default selection logic
- `useDebouncedValue` - Debounced values

## Import Details

### Files by Import Type

#### Extension Host Files (Commands)
See: `core-ui-imports.txt`
- Dashboard commands import `vscode-api`, types
- Welcome commands import `vscode-api`, types

#### Feature UI Files
See: `feature-ui-imports.txt`
- Authentication UI: 50+ imports
- Components UI: 20+ imports
- Dashboard UI: 40+ imports
- Mesh UI: 15+ imports
- Prerequisites UI: 10+ imports
- Project Creation UI: 85+ imports

### Import Path Patterns

All imports follow these patterns:
```typescript
// Components
import { Modal } from '@/core/ui/components/Modal';
import { LoadingDisplay } from '@/core/ui/components/LoadingDisplay';

// Hooks
import { useVSCodeMessage } from '@/core/ui/hooks';
import { useSelection } from '@/core/ui/hooks/useSelection';

// Types
import { WizardState, WizardStep } from '@/core/ui/types';

// Utils
import { vscode } from '@/core/ui/vscode-api';
import { cn } from '@/core/ui/utils/classNames';
```

## Migration Impact

### Phase 1: Move @/core/ui → webview-ui/src/shared
All 89 imports need path updates:
```typescript
// Before
import { Modal } from '@/core/ui/components/Modal';

// After
import { Modal } from '@/webview-ui/shared/components/Modal';
```

### Phase 2: Update tsconfig path aliases
```json
{
  "compilerOptions": {
    "paths": {
      "@/webview-ui/*": ["webview-ui/src/*"]
    }
  }
}
```

### Phase 3: Update webpack aliases
```javascript
resolve: {
  alias: {
    '@/webview-ui': path.resolve(__dirname, 'webview-ui/src')
  }
}
```

## Cross-Feature Dependencies

### Components Shared Across Features

**LoadingDisplay:**
- Used by: authentication, components, mesh, project-creation
- Type: Shared component
- Action: Move to `webview-ui/src/shared/components/`

**FadeTransition:**
- Used by: authentication, mesh
- Type: Shared component
- Action: Move to `webview-ui/src/shared/components/`

**Modal:**
- Used by: mesh
- Type: Shared component
- Action: Move to `webview-ui/src/shared/components/`

**NumberedInstructions:**
- Used by: mesh
- Type: Shared component
- Action: Move to `webview-ui/src/shared/components/`

## Files to Update (Step 5)

### Extension Host Files (Command Files)
Update imports in:
- `src/features/dashboard/commands/showDashboard.ts`
- `src/features/welcome/commands/showWelcome.ts`

### Feature UI Files
Update imports in all files under:
- `src/features/authentication/ui/`
- `src/features/components/ui/`
- `src/features/dashboard/ui/`
- `src/features/mesh/ui/`
- `src/features/prerequisites/ui/`
- `src/features/project-creation/ui/`

### Test Files
Update imports in all test files:
- `tests/core/ui/components/*.test.tsx`
- `tests/core/ui/hooks/*.test.ts`
- Other test files importing from `@/core/ui`

## Detailed Import Inventory

See complete import lists in:
- `core-ui-imports.txt` - All @/core/ui imports (89 lines)
- `webviews-imports.txt` - All @/webviews imports (0 lines - confirms duplicates unused)
- `feature-ui-imports.txt` - All feature UI imports (220 lines)
