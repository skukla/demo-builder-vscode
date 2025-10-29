# Consolidation Strategy

**Generated:** $(date '+%Y-%m-%d %H:%M:%S')

## Overview

This document defines the strategy for consolidating duplicate files and migrating to the new `webview-ui/` structure.

## File Counts

- **src/webviews/:** 80 files
- **src/core/ui/:** 25 files
- **src/features/*/ui/:** 38 files
- **Total webview files:** 143 files

## Duplicate Consolidation (Steps 2-3)

### Confirmed Duplicates to Delete

These duplicates are **NOT being imported** (0 @/webviews imports found):

1. ✅ **src/webviews/components/shared/Modal.tsx**
   - Keep: `src/core/ui/components/Modal.tsx` (more robust)
   - Delete: `src/webviews/components/shared/Modal.tsx`

2. ✅ **src/webviews/components/shared/FadeTransition.tsx**
   - Keep: `src/core/ui/components/FadeTransition.tsx` (cleaner logic)
   - Delete: `src/webviews/components/shared/FadeTransition.tsx`

3. ✅ **src/webviews/components/shared/LoadingDisplay.tsx**
   - Keep: `src/core/ui/components/LoadingDisplay.tsx` (more features)
   - Delete: `src/webviews/components/shared/LoadingDisplay.tsx`

### Duplicates Requiring Comparison (Step 2)

4. ⚠️ **FormField.tsx**
   - `src/core/ui/components/FormField.tsx` (4904 bytes)
   - `src/webviews/components/molecules/FormField.tsx` (unknown size)
   - Action: Diff files, merge if needed, keep better version

5. ⚠️ **NumberedInstructions.tsx**
   - `src/core/ui/components/NumberedInstructions.tsx` (3180 bytes)
   - `src/webviews/components/shared/NumberedInstructions.tsx` (3180 bytes)
   - Action: Diff files (likely identical), delete duplicate

6. ⚠️ **StatusCard.tsx**
   - `src/core/ui/components/StatusCard.tsx` (2699 bytes)
   - `src/webviews/components/molecules/StatusCard.tsx` (unknown size)
   - Action: Diff files, merge if needed, keep better version

## Migration Strategy

### Phase 1: Create Directory Structure (Step 3)

Create new `webview-ui/` structure:

```
webview-ui/
├── src/
│   ├── shared/              # Shared UI infrastructure
│   │   ├── components/      # Shared React components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── contexts/        # React contexts
│   │   ├── styles/          # Shared styles
│   │   ├── utils/           # UI utilities (vscode-api, classNames)
│   │   └── types/           # UI-specific types
│   ├── wizard/              # Wizard webview
│   │   ├── components/      # Wizard-specific components
│   │   ├── steps/           # Wizard step components
│   │   └── App.tsx          # Wizard entry point
│   ├── dashboard/           # Dashboard webview
│   │   ├── components/      # Dashboard-specific components
│   │   └── ProjectDashboardScreen.tsx
│   └── configure/           # Configure webview
│       ├── components/      # Configure-specific components
│       └── ConfigureScreen.tsx
├── public/                  # Static assets
│   └── index.html
├── tsconfig.json           # Webview-specific TypeScript config
└── package.json            # Optional: if webview becomes separate package
```

### Phase 2: Move Shared Components (Step 3)

**From `src/core/ui/components/` → `webview-ui/src/shared/components/`:**

- ✅ Modal.tsx (1467 bytes)
- ✅ FadeTransition.tsx (1321 bytes)
- ✅ LoadingDisplay.tsx (4641 bytes)
- ⚠️ FormField.tsx (4904 bytes - after comparison)
- ⚠️ NumberedInstructions.tsx (3180 bytes - after comparison)
- ⚠️ StatusCard.tsx (2699 bytes - after comparison)
- ✅ GridLayout.tsx
- ✅ TwoColumnLayout.tsx

**Total shared components:** ~8-10 files

### Phase 3: Move Shared Hooks (Step 3)

**From `src/core/ui/hooks/` → `webview-ui/src/shared/hooks/`:**

All 9 hooks from research:
- useVSCodeMessage.ts
- useVSCodeRequest.ts
- useLoadingState.ts
- useSelection.ts
- useAsyncData.ts
- useAutoScroll.ts
- useSearchFilter.ts
- useFocusTrap.ts
- useSelectableDefault.ts
- useDebouncedValue.ts (if exists)

**Total hooks:** ~9-10 files

### Phase 4: Move Shared Utils (Step 3)

**From `src/core/ui/utils/` → `webview-ui/src/shared/utils/`:**

- vscode-api.ts (VS Code API bridge)
- classNames.ts (CSS class utilities)

**Total utils:** ~2 files

### Phase 5: Move Shared Types (Step 3)

**From `src/core/ui/types/` → `webview-ui/src/shared/types/`:**

- index.ts (all UI types)
- ThemeMode, WizardState, WizardStep, etc.

**Total type files:** ~1-2 files

### Phase 6: Move Shared Contexts (Step 3)

**From `src/core/ui/contexts/` → `webview-ui/src/shared/contexts/`:**

If any contexts exist in `src/core/ui/contexts/`

### Phase 7: Move Shared Styles (Step 3)

**From `src/core/ui/styles/` → `webview-ui/src/shared/styles/`:**

If any shared styles exist

### Phase 8: Move Wizard Files (Step 4)

**From `src/webviews/` → `webview-ui/src/wizard/`:**

Main files:
- index.tsx → App.tsx
- index.html → ../public/index.html

Components:
- components/wizard/* → wizard/components/
- components/steps/* → wizard/steps/

### Phase 9: Move Dashboard Files (Step 4)

**From `src/features/dashboard/ui/` → `webview-ui/src/dashboard/`:**

- ProjectDashboardScreen.tsx
- ConfigureScreen.tsx
- components/* → dashboard/components/
- main/project-dashboard.tsx → App.tsx
- main/configure.tsx → ConfigureApp.tsx

### Phase 10: Keep Feature UI in Place

**Leave these in `src/features/*/ui/`:**

- src/features/authentication/ui/ (stays)
- src/features/components/ui/ (stays)
- src/features/mesh/ui/ (stays)
- src/features/prerequisites/ui/ (stays)
- src/features/project-creation/ui/ (stays - except wizard)

**Why?** These are feature-specific components embedded in wizard. They stay with their features for cohesion.

## Import Path Updates (Step 5)

### Before Migration

```typescript
// Extension host (commands)
import type { WizardState } from '@/core/ui/types';

// Webview code
import { Modal } from '@/core/ui/components/Modal';
import { useVSCodeMessage } from '@/core/ui/hooks';
```

### After Migration

```typescript
// Extension host (commands) - NO CHANGE
import type { WizardState } from '@/core/ui/types';

// Webview code - NEW PATHS
import { Modal } from '@/webview-ui/shared/components/Modal';
import { useVSCodeMessage } from '@/webview-ui/shared/hooks';
```

### Files Requiring Updates

**Extension host files (2 files):**
- src/features/dashboard/commands/showDashboard.ts
- src/features/welcome/commands/showWelcome.ts

**Feature UI files (38 files):**
- All files in src/features/*/ui/ directories

**Test files (~29 files):**
- tests/core/ui/components/*.test.tsx
- tests/core/ui/hooks/*.test.ts

**Webview entry points:**
- webview-ui/src/wizard/App.tsx
- webview-ui/src/dashboard/App.tsx
- webview-ui/src/configure/App.tsx

## TypeScript Configuration Updates (Step 6)

### tsconfig.json

Add path alias:
```json
{
  "compilerOptions": {
    "paths": {
      "@/webview-ui/*": ["webview-ui/src/*"],
      "@/core/ui/*": ["src/core/ui/*"]  // Keep for extension host
    }
  }
}
```

### tsconfig.webview.json

Create new config for webview:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "jsx": "react",
    "lib": ["ES2020", "DOM"],
    "paths": {
      "@/webview-ui/*": ["webview-ui/src/*"]
    }
  },
  "include": ["webview-ui/src/**/*"]
}
```

### tsconfig.build.json

Remove webview exclusions (currently blocks compilation):
```json
{
  "exclude": [
    "src/webviews/**/*",        // Remove this
    "src/core/ui/**/*"          // Remove this
  ]
}
```

## Webpack Configuration Updates (Step 6)

Update `webpack.config.js` for new structure:

```javascript
module.exports = {
  entry: {
    wizard: './webview-ui/src/wizard/App.tsx',
    dashboard: './webview-ui/src/dashboard/App.tsx',
    configure: './webview-ui/src/configure/App.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist', 'webview'),
    filename: '[name]-bundle.js'
  },
  resolve: {
    alias: {
      '@/webview-ui': path.resolve(__dirname, 'webview-ui/src'),
      '@/shared': path.resolve(__dirname, 'webview-ui/src/shared')
    }
  }
}
```

## Cleanup (Final Step)

After successful migration and verification:

1. ✅ Delete `src/webviews/` directory
2. ✅ Delete `src/core/ui/` directory
3. ✅ Update all CLAUDE.md files to reflect new structure
4. ✅ Update root CLAUDE.md with new architecture diagram

## Rollback Strategy

If migration fails:

1. Git has all original files
2. Revert changes: `git checkout .`
3. Review errors and adjust strategy
4. Re-attempt with fixes

## Success Criteria

✅ TypeScript compilation passes (0 errors)
✅ All 94 automated tests pass
✅ Webpack builds successfully
✅ All 3 webviews load and function
✅ No console errors in webviews
✅ All imports resolve correctly
