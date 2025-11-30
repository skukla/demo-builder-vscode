# Step 5: Migrate Feature-Specific Webview Code

**Purpose:** Move wizard, dashboard, and configure webview code from `src/webviews/` to `webview-ui/src/{wizard,dashboard,configure}/` respectively. Create webpack entry points for each feature. Preserve existing feature UI directories in `src/features/*/ui/`.

**Prerequisites:**

- [x] Step 1-4 completed (shared code migrated)
- [ ] Shared code migration verified (Step 4 complete)
- [ ] Checkpoint commit created after Step 4

**Tests to Write First:**

- [ ] Test: Verify wizard files moved correctly
  - **Given:** Wizard files moved to webview-ui/src/wizard/
  - **When:** List files in webview-ui/src/wizard/
  - **Then:** All wizard steps, components, and WizardContainer present
  - **File:** Manual test

- [ ] Test: Verify dashboard files moved correctly
  - **Given:** Dashboard files moved to webview-ui/src/dashboard/
  - **When:** List files in webview-ui/src/dashboard/
  - **Then:** ProjectDashboardScreen and related components present
  - **File:** Manual test

- [ ] Test: Verify configure files moved correctly
  - **Given:** Configure files moved to webview-ui/src/configure/
  - **When:** List files in webview-ui/src/configure/
  - **Then:** ConfigureScreen and related components present
  - **File:** Manual test

**Files to Create/Modify:**

- [ ] **Wizard feature migration**
  - `src/webviews/components/wizard/` → `webview-ui/src/wizard/components/`
  - `src/webviews/components/steps/` → `webview-ui/src/wizard/steps/`
  - `src/webviews/app/App.tsx` → `webview-ui/src/wizard/WizardApp.tsx`
  - `src/webviews/index.tsx` → `webview-ui/src/wizard/index.tsx` (entry point)

- [ ] **Dashboard feature migration**
  - `src/webviews/project-dashboard.tsx` → `webview-ui/src/dashboard/index.tsx` (entry point)
  - `src/webviews/project-dashboard/` → `webview-ui/src/dashboard/components/`

- [ ] **Configure feature migration**
  - `src/webviews/configure.tsx` → `webview-ui/src/configure/index.tsx` (entry point)
  - `src/webviews/configure/` → `webview-ui/src/configure/components/`

- [ ] **Welcome screen decision** (IMPORTANT)
  - Option A: Keep in extension features (`src/features/welcome/ui/`)
  - Option B: Move to webview-ui/src/welcome/
  - Decision: Keep in src/features/welcome/ui/ (it's feature-specific, not webview infrastructure)

**Implementation Details:**

**RED Phase** (Write failing tests)

No automated tests - manual verification:

```bash
# Test 1: Verify wizard files don't exist in new location yet
test -d webview-ui/src/wizard/steps && echo "EXISTS" || echo "NOT FOUND"

# Test 2: Verify dashboard files don't exist in new location yet
test -f webview-ui/src/dashboard/index.tsx && echo "EXISTS" || echo "NOT FOUND"

# Test 3: Verify configure files don't exist in new location yet
test -f webview-ui/src/configure/index.tsx && echo "EXISTS" || echo "NOT FOUND"
```

**GREEN Phase** (Minimal implementation)

1. **Migrate Wizard Feature**

```bash
# Move wizard container and timeline nav
git mv src/webviews/components/wizard webview-ui/src/wizard/components

# Move wizard steps
git mv src/webviews/components/steps webview-ui/src/wizard/

# Move wizard app wrapper
git mv src/webviews/app/App.tsx webview-ui/src/wizard/WizardApp.tsx

# Move vscodeApi wrapper
git mv src/webviews/app/vscodeApi.ts webview-ui/src/wizard/vscodeApi.ts

# Move wizard entry point (rename from index.tsx)
git mv src/webviews/index.tsx webview-ui/src/wizard/index.tsx

# Verify structure
tree webview-ui/src/wizard/ -L 2
```

2. **Create Wizard README**

```bash
cat > webview-ui/src/wizard/README.md << 'EOF'
# Wizard Feature

Project creation wizard webview.

## Structure

- `index.tsx` - Webpack entry point
- `WizardApp.tsx` - Root React component
- `vscodeApi.ts` - VS Code API wrapper
- `components/` - Wizard-specific components (WizardContainer, TimelineNav)
- `steps/` - All wizard steps (Welcome, Prerequisites, Adobe Auth, etc.)

## Steps

1. WelcomeStep - Project name and template
2. PrerequisitesStep - Tool verification and installation
3. AdobeAuthStep - Adobe authentication
4. AdobeProjectStep - Adobe project selection
5. AdobeWorkspaceStep - Adobe workspace selection
6. ComponentSelectionStep - Choose components
7. ComponentConfigStep - Configure components
8. ReviewStep - Review selections
9. ProjectCreationStep - Create project

## Message Protocol

Wizard uses Backend Call on Continue pattern:
- Selection handlers update UI state immediately (no backend call)
- Backend operations happen when Continue button clicked
- Loading overlay shown during backend operations
EOF
```

3. **Migrate Dashboard Feature**

```bash
# Move dashboard entry point
git mv src/webviews/project-dashboard.tsx webview-ui/src/dashboard/index.tsx

# Move dashboard subdirectory if it exists
if [ -d "src/webviews/project-dashboard" ]; then
  git mv src/webviews/project-dashboard webview-ui/src/dashboard/components
fi

# Verify structure
ls -la webview-ui/src/dashboard/
```

4. **Create Dashboard README**

```bash
cat > webview-ui/src/dashboard/README.md << 'EOF'
# Dashboard Feature

Project dashboard webview with controls and status.

## Structure

- `index.tsx` - Webpack entry point + main component
- `components/` - Dashboard-specific components (if any)

## Features

- Project lifecycle controls (Start/Stop)
- Mesh deployment status (asynchronous check)
- Logs toggle (smart channel switching)
- Component browser (file tree)

## UX Patterns

- Smart Logs toggle remembers last active channel
- Asynchronous mesh status doesn't block UI render
- Focus retention for in-place actions (Logs, Start/Stop)
- Focus trap for keyboard navigation
EOF
```

5. **Migrate Configure Feature**

```bash
# Move configure entry point
git mv src/webviews/configure.tsx webview-ui/src/configure/index.tsx

# Move configure subdirectory if it exists
if [ -d "src/webviews/configure" ]; then
  git mv src/webviews/configure webview-ui/src/configure/components
fi

# Verify structure
ls -la webview-ui/src/configure/
```

6. **Create Configure README**

```bash
cat > webview-ui/src/configure/README.md << 'EOF'
# Configure Feature

Configuration screen webview for editing component settings.

## Structure

- `index.tsx` - Webpack entry point + main component
- `components/` - Configure-specific components (if any)

## Features

- Component configuration editor
- .env file updates
- Save and apply changes
- Validation feedback
EOF
```

7. **Handle Welcome Screen (Feature UI Integration)**

```bash
# Welcome screen stays in src/features/welcome/ui/ (it's feature-specific)
# No migration needed for welcome screen

# Document decision
cat >> .rptc/plans/webview-architecture-restructure/migration-notes.md << 'EOF'
# Migration Notes

## Welcome Screen Decision

The welcome screen is kept in `src/features/welcome/ui/` because:
1. It's feature-specific UI (part of welcome feature)
2. It integrates with feature backend logic
3. Existing feature UI structure works well

The welcome screen will continue to import from webview-ui/src/shared/ for shared components.
EOF
```

8. **Verify Complete webview-ui Structure**

```bash
# Expected structure after Step 5
tree webview-ui/src/ -L 2

# Should show:
# webview-ui/src/
# ├── wizard/
# │   ├── index.tsx
# │   ├── WizardApp.tsx
# │   ├── vscodeApi.ts
# │   ├── components/
# │   └── steps/
# ├── dashboard/
# │   ├── index.tsx
# │   └── components/ (if exists)
# ├── configure/
# │   ├── index.tsx
# │   └── components/ (if exists)
# └── shared/
#     ├── components/
#     ├── hooks/
#     ├── contexts/
#     ├── styles/
#     ├── utils/
#     └── types/
```

9. **Clean Up Old webviews Directory**

```bash
# Check what remains in src/webviews/
ls -la src/webviews/

# Expected remaining files:
# - index.html (used by webpack, might need migration in Step 7)
# - welcome.tsx, welcome/ (feature-specific, stays in src/features/welcome/ui/)

# If only index.html remains:
if [ -f "src/webviews/index.html" ]; then
  # Move to webview-ui/ for webpack
  git mv src/webviews/index.html webview-ui/src/index.html
fi

# Remove empty directories
find src/webviews -type d -empty -delete

# If src/webviews/ is now completely empty:
# DO NOT DELETE YET - wait for Step 9 cleanup
```

**REFACTOR Phase** (Improve while keeping tests green)

1. **Standardize Entry Point Structure**

Each feature entry point should follow consistent pattern:

```typescript
// webview-ui/src/wizard/index.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { WizardApp } from './WizardApp';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);

root.render(
  <Provider theme={defaultTheme} colorScheme="dark">
    <WizardApp />
  </Provider>
);
```

2. **Verify Feature Isolation**

```bash
# Each feature should be self-contained (no cross-feature imports)
# Check for imports between features

# Wizard shouldn't import from dashboard
grep -r "from.*dashboard" webview-ui/src/wizard/

# Dashboard shouldn't import from wizard
grep -r "from.*wizard" webview-ui/src/dashboard/

# Configure shouldn't import from wizard or dashboard
grep -r "from.*wizard\|from.*dashboard" webview-ui/src/configure/

# All should return no results (or only shared imports)
```

3. **Create Feature Bundle Size Budget**

```bash
cat > webview-ui/bundle-budget.md << 'EOF'
# Bundle Size Budget

## Target Sizes (Compressed)

- **wizard-bundle.js:** <500KB (complex wizard with many steps)
- **dashboard-bundle.js:** <300KB (simpler dashboard controls)
- **configure-bundle.js:** <200KB (basic configuration screen)

## Verification

After webpack build, check bundle sizes:

```bash
ls -lh dist/webview/*.js
```

If any bundle exceeds budget:
1. Analyze with webpack-bundle-analyzer
2. Check for duplicate dependencies
3. Consider code splitting for large components
EOF
```

4. **Commit Feature Migrations**

```bash
# Commit feature migrations
git commit -m "refactor(webview): Migrate feature-specific webview code

Moved webview code to feature-based organization:
- Wizard → webview-ui/src/wizard/
- Dashboard → webview-ui/src/dashboard/
- Configure → webview-ui/src/configure/

Each feature is now self-contained with its own webpack entry point.

Preserved git history via git mv.

Part of webview architecture restructure (Step 5)."
```

**Expected Outcome:**

- Wizard code in webview-ui/src/wizard/ (20+ files)
- Dashboard code in webview-ui/src/dashboard/ (5+ files)
- Configure code in webview-ui/src/configure/ (5+ files)
- Welcome screen remains in src/features/welcome/ui/ (feature-specific)
- src/webviews/ directory mostly empty (except index.html)
- Feature isolation verified (no cross-feature imports)

**Acceptance Criteria:**

- [ ] Wizard files moved to webview-ui/src/wizard/
- [ ] Dashboard files moved to webview-ui/src/dashboard/
- [ ] Configure files moved to webview-ui/src/configure/
- [ ] Welcome screen kept in src/features/welcome/ui/ (documented decision)
- [ ] Entry point structure standardized for all features
- [ ] Feature isolation verified (no cross-feature imports)
- [ ] Bundle size budget documented
- [ ] Git history preserved for all moved files
- [ ] src/webviews/ directory cleaned up (index.html moved)

**Estimated Time:** 2-3 hours
