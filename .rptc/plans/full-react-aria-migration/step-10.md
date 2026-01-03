# Step 10: Validate & Document

## Overview

**Purpose**: Complete the React Aria migration by performing final validation, verifying the original goal (zero `!important` declarations), measuring bundle improvements, and updating all documentation to reflect the new architecture.

**Prerequisites**:
- [ ] Steps 1-9 complete (all components migrated, Spectrum removed)
- [ ] All tests passing
- [ ] Build compiles successfully
- [ ] No `@adobe/react-spectrum` imports in codebase

**Estimated Time**: 2-3 hours

---

## Tests to Write First

### 10.1 CSS !important Verification Tests

```typescript
// tests/core/ui/styles/importantDeclarations.test.ts

import * as fs from 'fs';
import * as path from 'path';

describe('CSS !important Verification', () => {
    const ariaComponentsDir = path.join(
        __dirname,
        '../../../../src/core/ui/components/aria'
    );

    describe('React Aria Component Styles', () => {
        it('should have zero !important declarations in aria component CSS', () => {
            const cssFiles = findCssFiles(ariaComponentsDir);

            const violations: string[] = [];

            for (const file of cssFiles) {
                const content = fs.readFileSync(file, 'utf-8');
                const lines = content.split('\n');

                lines.forEach((line, index) => {
                    if (line.includes('!important')) {
                        violations.push(
                            `${path.relative(ariaComponentsDir, file)}:${index + 1}: ${line.trim()}`
                        );
                    }
                });
            }

            expect(violations).toEqual([]);
        });

        it('should have zero !important in CSS Modules', () => {
            const moduleCssFiles = findCssFiles(ariaComponentsDir).filter(
                f => f.endsWith('.module.css')
            );

            const violations: string[] = [];

            for (const file of moduleCssFiles) {
                const content = fs.readFileSync(file, 'utf-8');
                if (content.includes('!important')) {
                    const matches = content.match(/!important/g);
                    violations.push(
                        `${path.basename(file)}: ${matches?.length || 0} !important declarations`
                    );
                }
            }

            expect(violations).toEqual([]);
        });
    });

    describe('Overall Codebase !important Reduction', () => {
        it('should have significantly fewer !important declarations than before migration', () => {
            const stylesDir = path.join(
                __dirname,
                '../../../../src/core/ui/styles'
            );

            const cssFiles = findCssFiles(stylesDir);
            let importantCount = 0;

            for (const file of cssFiles) {
                const content = fs.readFileSync(file, 'utf-8');
                const matches = content.match(/!important/g);
                importantCount += matches?.length || 0;
            }

            // Pre-migration: 525 !important declarations
            // Target: <50 (90% reduction) - remaining may be in utilities for legitimate overrides
            expect(importantCount).toBeLessThan(50);
        });
    });
});

function findCssFiles(dir: string): string[] {
    const files: string[] = [];

    if (!fs.existsSync(dir)) {
        return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...findCssFiles(fullPath));
        } else if (entry.name.endsWith('.css')) {
            files.push(fullPath);
        }
    }

    return files;
}
```

**File**: `tests/core/ui/styles/importantDeclarations.test.ts`

### 10.2 UNSAFE_className Elimination Tests

```typescript
// tests/integration/unsafeClassName.test.ts

describe('UNSAFE_className Elimination', () => {
    it('should have zero UNSAFE_className occurrences in source code', () => {
        const { execSync } = require('child_process');

        try {
            const result = execSync(
                'grep -rn "UNSAFE_className" src/ --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l',
                { encoding: 'utf-8' }
            );
            const count = parseInt(result.trim(), 10);

            // Pre-migration: 292 occurrences
            // Target: 0
            expect(count).toBe(0);
        } catch (error) {
            // grep returns exit code 1 when no matches - this is success
            expect(true).toBe(true);
        }
    });

    it('should have zero UNSAFE_style occurrences', () => {
        const { execSync } = require('child_process');

        try {
            const result = execSync(
                'grep -rn "UNSAFE_style" src/ --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l',
                { encoding: 'utf-8' }
            );
            const count = parseInt(result.trim(), 10);

            expect(count).toBe(0);
        } catch (error) {
            expect(true).toBe(true);
        }
    });
});
```

**File**: `tests/integration/unsafeClassName.test.ts`

### 10.3 Bundle Size Verification Tests

```typescript
// tests/integration/bundleSize.test.ts

import * as fs from 'fs';
import * as path from 'path';

describe('Bundle Size Verification', () => {
    const distDir = path.join(__dirname, '../../../dist/webview');

    // Pre-migration baseline (approximate):
    // - wizard.js: ~900KB (with Spectrum ~400KB + Spectrum CSS ~300KB bundled)
    // Post-migration target:
    // - wizard.js: <400KB (React Aria ~80KB + custom CSS ~50KB)

    describe('Webview Bundles', () => {
        it('should have wizard bundle under 400KB', () => {
            const wizardPath = path.join(distDir, 'wizard.js');

            if (fs.existsSync(wizardPath)) {
                const stats = fs.statSync(wizardPath);
                const sizeKB = stats.size / 1024;

                expect(sizeKB).toBeLessThan(400);
            } else {
                // Build not run yet - skip
                console.warn('wizard.js not found - run build first');
            }
        });

        it('should have dashboard bundle under 200KB', () => {
            const dashboardPath = path.join(distDir, 'dashboard.js');

            if (fs.existsSync(dashboardPath)) {
                const stats = fs.statSync(dashboardPath);
                const sizeKB = stats.size / 1024;

                expect(sizeKB).toBeLessThan(200);
            }
        });

        it('should have sidebar bundle under 100KB', () => {
            const sidebarPath = path.join(distDir, 'sidebar.js');

            if (fs.existsSync(sidebarPath)) {
                const stats = fs.statSync(sidebarPath);
                const sizeKB = stats.size / 1024;

                expect(sizeKB).toBeLessThan(100);
            }
        });
    });

    describe('Bundle Size Comparison', () => {
        it('should document bundle size improvements', () => {
            const bundles = ['wizard.js', 'dashboard.js', 'sidebar.js'];
            const sizes: Record<string, number> = {};

            for (const bundle of bundles) {
                const bundlePath = path.join(distDir, bundle);
                if (fs.existsSync(bundlePath)) {
                    const stats = fs.statSync(bundlePath);
                    sizes[bundle] = Math.round(stats.size / 1024);
                }
            }

            // Log for documentation
            console.log('Post-Migration Bundle Sizes:');
            for (const [name, size] of Object.entries(sizes)) {
                console.log(`  ${name}: ${size}KB`);
            }

            // Total should be significantly less than pre-migration (~1.2MB)
            const totalKB = Object.values(sizes).reduce((a, b) => a + b, 0);
            expect(totalKB).toBeLessThan(700); // Target: <700KB total (was ~1.2MB)
        });
    });
});
```

**File**: `tests/integration/bundleSize.test.ts`

### 10.4 Documentation Verification Tests

```typescript
// tests/documentation/cssArchitecture.test.ts

import * as fs from 'fs';
import * as path from 'path';

describe('Documentation Verification', () => {
    describe('CLAUDE.md Updates', () => {
        it('should update root CLAUDE.md to reflect React Aria architecture', () => {
            const claudeMd = path.join(
                __dirname,
                '../../../CLAUDE.md'
            );

            const content = fs.readFileSync(claudeMd, 'utf-8');

            // Should NOT reference Spectrum as current architecture
            expect(content).not.toMatch(/React-based UI using Adobe Spectrum/);
            expect(content).not.toMatch(/Adobe Spectrum Integration/);

            // SHOULD reference React Aria
            expect(content).toMatch(/React Aria/i);
        });

        it('should update CSS Architecture section', () => {
            const claudeMd = path.join(
                __dirname,
                '../../../CLAUDE.md'
            );

            const content = fs.readFileSync(claudeMd, 'utf-8');

            // Should NOT reference 5-layer cascade with spectrum
            expect(content).not.toMatch(/@layer.*spectrum/);

            // SHOULD reference 4-layer cascade
            expect(content).toMatch(/@layer.*reset.*vscode-theme.*components.*utilities/);
        });
    });

    describe('src/core/ui/styles/CLAUDE.md Updates', () => {
        it('should update styles CLAUDE.md to remove Spectrum references', () => {
            const stylesClaudeMd = path.join(
                __dirname,
                '../../../src/core/ui/styles/CLAUDE.md'
            );

            const content = fs.readFileSync(stylesClaudeMd, 'utf-8');

            // Should NOT reference Spectrum directory
            expect(content).not.toMatch(/spectrum\/.*index\.css/);
            expect(content).not.toMatch(/spectrum\/.*buttons\.css/);

            // Should NOT list 5 layers
            expect(content).not.toMatch(/5.*[Ll]ayer/);

            // SHOULD list 4 layers
            expect(content).toMatch(/4.*[Ll]ayer/);
        });

        it('should document React Aria component styling approach', () => {
            const stylesClaudeMd = path.join(
                __dirname,
                '../../../src/core/ui/styles/CLAUDE.md'
            );

            const content = fs.readFileSync(stylesClaudeMd, 'utf-8');

            // SHOULD reference React Aria styling approach
            expect(content).toMatch(/React Aria/i);
            expect(content).toMatch(/CSS Modules/i);
        });
    });
});
```

**File**: `tests/documentation/cssArchitecture.test.ts`

### 10.5 @layer Cascade Verification Tests

```typescript
// tests/core/ui/styles/layerCascade.test.ts

import * as fs from 'fs';
import * as path from 'path';

describe('@layer Cascade Verification', () => {
    const indexCssPath = path.join(
        __dirname,
        '../../../../src/core/ui/styles/index.css'
    );

    it('should have 4-layer cascade declaration', () => {
        const content = fs.readFileSync(indexCssPath, 'utf-8');

        // Extract @layer declaration
        const layerMatch = content.match(/@layer\s+([^;]+);/);
        expect(layerMatch).not.toBeNull();

        const layers = layerMatch![1].split(',').map(l => l.trim());

        // Should have exactly 4 layers (spectrum removed)
        expect(layers).toEqual([
            'reset',
            'vscode-theme',
            'components',
            'utilities'
        ]);
    });

    it('should NOT import spectrum directory', () => {
        const content = fs.readFileSync(indexCssPath, 'utf-8');

        expect(content).not.toMatch(/@import.*['"]\.\/spectrum/);
        expect(content).not.toMatch(/spectrum\.css/);
    });

    it('should have utilities as highest priority layer', () => {
        const content = fs.readFileSync(indexCssPath, 'utf-8');

        // utilities should be last in the layer order declaration
        const layerMatch = content.match(/@layer\s+([^;]+);/);
        const layers = layerMatch![1].split(',').map(l => l.trim());

        expect(layers[layers.length - 1]).toBe('utilities');
    });
});
```

**File**: `tests/core/ui/styles/layerCascade.test.ts`

---

## Implementation Details

### Phase 1: Final Validation

#### 1.1 Run !important Audit

**Command**:
```bash
# Count !important in new React Aria CSS
find src/core/ui/components/aria -name "*.css" -exec grep -l "!important" {} \;

# Count total !important in styles directory (should be <50)
grep -r "!important" src/core/ui/styles/ --include="*.css" | wc -l

# Verify Spectrum overrides removed
ls -la src/core/ui/styles/spectrum/ 2>/dev/null || echo "Spectrum directory removed - SUCCESS"
```

**Expected Results**:
- Zero `!important` in `src/core/ui/components/aria/`
- Less than 50 `!important` total in `src/core/ui/styles/` (utilities only)
- Spectrum directory no longer exists

#### 1.2 Run UNSAFE_className Audit

**Command**:
```bash
# Should return 0
grep -rn "UNSAFE_className" src/ --include="*.tsx" --include="*.ts" | wc -l

# Verify specific patterns eliminated
grep -rn "UNSAFE_className" src/core/ui/components/ --include="*.tsx" 2>/dev/null || echo "No UNSAFE_className in core components - SUCCESS"
grep -rn "UNSAFE_className" src/features/ --include="*.tsx" 2>/dev/null || echo "No UNSAFE_className in features - SUCCESS"
```

**Expected Results**:
- Zero occurrences (pre-migration: 292)

#### 1.3 Run Full Test Suite

**Command**:
```bash
# Full test suite
npm test

# Verify no test regressions
npm run test:coverage
```

**Expected Results**:
- All tests passing
- Coverage maintained at 80%+

---

### Phase 2: Performance Verification

#### 2.1 Bundle Size Analysis

**Command**:
```bash
# Build production bundles
npm run compile:webview

# Analyze bundle sizes
ls -lh dist/webview/*.js

# Compare with pre-migration baseline
echo "Pre-migration baseline:"
echo "  wizard.js: ~900KB"
echo "  dashboard.js: ~350KB"
echo "  sidebar.js: ~150KB"
echo "  Total: ~1.4MB"
echo ""
echo "Post-migration actual:"
ls -lh dist/webview/*.js
```

**Document Results**:
Create a file `.rptc/plans/full-react-aria-migration/bundle-size-report.md`:
```markdown
# Bundle Size Report

## Pre-Migration (Spectrum)
| Bundle | Size |
|--------|------|
| wizard.js | ~900KB |
| dashboard.js | ~350KB |
| sidebar.js | ~150KB |
| **Total** | **~1.4MB** |

## Post-Migration (React Aria)
| Bundle | Size | Change |
|--------|------|--------|
| wizard.js | XXX KB | -XX% |
| dashboard.js | XXX KB | -XX% |
| sidebar.js | XXX KB | -XX% |
| **Total** | **XXX KB** | **-XX%** |

## Analysis
- React Aria: ~80KB (vs Spectrum ~400KB)
- Custom CSS: ~50KB (vs Spectrum CSS ~300KB)
- Expected reduction: 50-60% smaller bundles
```

#### 2.2 Load Time Testing (Manual)

**Manual Verification**:
1. Open VS Code with extension
2. Run "Demo Builder: Create Project" command
3. Observe wizard load time (should be <1 second)
4. Navigate through all wizard steps
5. Verify smooth transitions

---

### Phase 3: Documentation Updates

#### 3.1 Update Root CLAUDE.md

**File**: `CLAUDE.md`

**Section: Key Components - Wizard System**

**Before**:
```markdown
### 1. **Wizard System**
- Multi-step project creation wizard
- React-based UI using Adobe Spectrum
- Maintains state across steps
- Width constraint solution: Replace Spectrum Flex with div for layouts
```

**After**:
```markdown
### 1. **Wizard System**
- Multi-step project creation wizard
- React-based UI using React Aria Components
- Maintains state across steps
- CSS Modules for component styling
```

**Section: Critical Design Decisions - Adobe Spectrum Integration**

**Before**:
```markdown
### Adobe Spectrum Integration
- **Issue**: Flex component constrains width to 450px
- **Solution**: Use standard HTML div with flex styles for critical layouts
- **Details**: See `src/webviews/CLAUDE.md`
```

**After**:
```markdown
### React Aria Integration (v2.0.0+)
- **Approach**: React Aria Components provide accessible primitives, styled with CSS Modules
- **Benefits**: Zero inline styles, full CSS control, 50%+ smaller bundles
- **Accessibility**: Built-in ARIA support equivalent to Spectrum
- **Details**: See `src/core/ui/components/aria/README.md`
```

**Section: CSS Architecture (Hybrid Pattern)**

**Before**:
```markdown
### CSS Architecture (Hybrid Pattern)
...
- **@layer Cascade**: 5-layer hierarchy for explicit specificity control:
  - `reset` - Browser resets (lowest priority)
  - `vscode-theme` - VS Code theme integration
  - `spectrum` - Adobe Spectrum overrides
  - `components` - Semantic component styles
  - `utilities` - Utility classes (highest priority)
...
```

**After**:
```markdown
### CSS Architecture (Hybrid Pattern)
- **Philosophy**: Semantic component classes + utility classes for layout/spacing
- **Directory Structure**: Modular organization in `src/core/ui/styles/`
  - `utilities/` - Utility classes with highest cascade priority (layout, spacing, colors, typography, animations)
  - `components/` - Semantic component styles (cards, common, dashboard, timeline)
  - `aria/` - React Aria component CSS Modules (in `src/core/ui/components/aria/`)
- **@layer Cascade**: 4-layer hierarchy for explicit specificity control:
  - `reset` - Browser resets (lowest priority)
  - `vscode-theme` - VS Code theme integration
  - `components` - Semantic component styles
  - `utilities` - Utility classes (highest priority)
- **No !important Needed**: @layer cascade ensures utilities override component styles naturally
- **CSS Modules**: Feature-scoped for complex UIs, React Aria components use co-located CSS Modules
- **Details**: See `src/core/ui/styles/CLAUDE.md`
```

#### 3.2 Update src/core/ui/styles/CLAUDE.md

**File**: `src/core/ui/styles/CLAUDE.md`

**Complete Rewrite**:
```markdown
# CSS Architecture

## Overview

The `styles/` directory contains the CSS architecture for the Demo Builder webviews. This follows a **hybrid approach** combining semantic component classes with utility classes, designed around React Aria Components.

## Philosophy

**Hybrid Pattern**: Semantic classes for components + utility classes for layout/spacing.

**Zero !important**: The @layer cascade ensures proper specificity ordering without `!important` declarations.

**React Aria Components**: All interactive components use React Aria with CSS Modules for styling.

## Directory Structure

```
styles/
|-- index.css                    # Master entry point with @layer declarations
|-- reset.css                    # Browser resets
|-- tokens.css                   # Design tokens (CSS variables)
|-- vscode-theme.css             # VS Code theme integration (--vscode-* vars)
|-- wizard.css                   # Wizard-specific styles
|
|-- utilities/                   # Low-specificity, reusable utilities
|   |-- index.css               # Barrel import
|   |-- typography.css          # Font sizes, weights, alignment
|   |-- layout.css              # Flexbox, grid, display, overflow
|   |-- spacing.css             # Padding, margin, gap
|   |-- colors.css              # Text/background colors
|   |-- borders.css             # Border styles, radius
|   +-- animations.css          # Centralized @keyframes definitions
|
+-- components/                  # Semantic component styles
    |-- index.css               # Barrel import
    |-- cards.css               # Card layouts
    |-- common.css              # Containers, loading, empty states
    |-- dashboard.css           # Dashboard-specific styles
    +-- timeline.css            # Timeline navigation
```

**React Aria Components** have co-located CSS Modules:
```
src/core/ui/components/aria/
|-- Button/
|   |-- Button.tsx
|   +-- Button.module.css
|-- TextField/
|   |-- TextField.tsx
|   +-- TextField.module.css
+-- [other components...]
```

## @layer Cascade System

The CSS uses `@layer` for explicit cascade control with 4 layers:

```css
@layer reset, vscode-theme, components, utilities;
```

**Layer Order** (lowest to highest priority):
1. `reset` - Browser resets (index.css)
2. `vscode-theme` - VS Code theme integration (tokens.css, vscode-theme.css)
3. `components` - Semantic component styles (components/*.css)
4. `utilities` - Utility classes with highest priority (utilities/*.css)

This cascade order ensures utilities always override component styles without needing `!important`.

## React Aria Styling

**Approach**: React Aria components are unstyled by default. We style them with:
1. **CSS Modules**: Co-located with each component (e.g., `Button.module.css`)
2. **className prop**: Standard React pattern (no `UNSAFE_className` needed)
3. **CSS Custom Properties**: Theme integration via `--vscode-*` variables

**Example**:
```tsx
// Button.tsx
import styles from './Button.module.css';
import { Button as AriaButton } from 'react-aria-components';

export function Button({ variant = 'primary', ...props }) {
    return (
        <AriaButton
            className={`${styles.button} ${styles[variant]}`}
            {...props}
        />
    );
}
```

```css
/* Button.module.css */
.button {
    padding: var(--spacing-2) var(--spacing-4);
    border-radius: var(--radius-md);
    cursor: pointer;
}

.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
}

.cta {
    background: var(--color-tangerine);
    color: white;
}
```

## Pattern Guidelines

### When to Use Semantic/Functional Classes

Use for component styling:
- `.wizard-step`, `.form-field-group`
- States and variants: `.wizard-step--active`
- Testable hooks for automation
- Design system integration

### When to Use Utility Classes

Use for layout and spacing:
- Spacing between components: `.mb-4`, `.gap-3`
- One-off layout adjustments: `.flex`, `.items-center`
- Context-specific overrides

### When to Use CSS Modules

Use for React Aria components:
- Interactive components (Button, TextField, Dialog)
- Complex components with multiple variants
- Components needing scoped styles

## CSS Modules (Feature-Scoped)

Feature-scoped CSS Modules are used for complex UIs:

```
features/prerequisites/ui/styles/prerequisites.module.css
features/project-creation/ui/styles/project-creation.module.css
```

**Naming Convention**: Use camelCase for module class names.

## Animation Keyframes

**Canonical Location:** `utilities/animations.css`

Common keyframes are centralized there:
- `spin` - Loading spinners
- `pulse` - Status indicators
- `fadeIn` - Element appearance
- `fadeInUp` - Subtle entrance effects

**Exceptions (acceptable):**
1. **Component-specific animations** in their CSS Modules
2. **VS Code providers** (inline styles required by VS Code API)

## VS Code Webview Requirements

- Use `--vscode-*` CSS variables for theme compatibility
- Content Security Policy requires external CSS files (no inline `<style>`)
- Test with light, dark, and high-contrast themes

## Usage Distribution (Post-Migration)

```
CSS Modules (React Aria): ~40%  (component styling)
Utility Classes:          ~35%  (global, reusable, single-concern)
Semantic Components:      ~20%  (page-level, contextual)
Inline Styles:            <5%   (dynamic values only)
```

## Adding New Styles

1. **React Aria component?** -> Create CSS Module in component directory
2. **Utility class needed?** -> Add to appropriate `utilities/*.css`
3. **Component styling?** -> Add to `components/*.css`
4. **Feature-specific complex UI?** -> Create CSS Module in feature directory
5. **New keyframe animation?** -> Add to `utilities/animations.css`

## Migration Notes (From Spectrum)

The codebase migrated from Adobe Spectrum to React Aria in v2.0.0:

**Before (Spectrum)**:
- 5-layer cascade: `reset, vscode-theme, spectrum, components, utilities`
- 525 `!important` declarations to override inline styles
- 292 `UNSAFE_className` props
- ~1.4MB bundle size

**After (React Aria)**:
- 4-layer cascade: `reset, vscode-theme, components, utilities`
- Zero `!important` in new code
- Standard `className` props
- ~600KB bundle size (50%+ reduction)

## Related Documentation

- React Aria Components: `src/core/ui/components/aria/README.md`
- Core UI: `src/core/ui/CLAUDE.md`
- Migration Plan: `.rptc/plans/full-react-aria-migration/`
```

#### 3.3 Create React Aria Components README

**File**: `src/core/ui/components/aria/README.md`

```markdown
# React Aria Components

## Overview

This directory contains React Aria-based components that replace the former Adobe Spectrum components. These components provide the same accessibility features but with full CSS control via CSS Modules.

## Available Components

### Primitives
- `Text` - Typography component
- `Heading` - Heading levels (h1-h6)
- `Flex` - Flexbox layout container
- `View` - Generic container (replaces Spectrum View)
- `Divider` - Visual separator

### Interactive
- `Button` - Standard button with variants (primary, secondary, cta)
- `ActionButton` - Icon buttons and toolbar actions
- `Spinner` - Loading indicator (replaces ProgressCircle)

### Forms
- `TextField` - Text input with label and validation
- `SearchField` - Search input with clear button

### Overlays
- `Dialog` - Modal dialogs
- `Menu` - Dropdown menus

## Usage Pattern

```tsx
import { Button, TextField, Flex } from '@/core/ui/components';

function MyForm() {
    return (
        <Flex direction="column" gap="size-200">
            <TextField
                label="Project Name"
                value={name}
                onChange={setName}
            />
            <Button variant="cta" onPress={handleSubmit}>
                Create Project
            </Button>
        </Flex>
    );
}
```

## Styling Approach

Each component uses a co-located CSS Module:

```
Button/
|-- Button.tsx          # Component logic
|-- Button.module.css   # Component styles
+-- index.ts            # Public export
```

**Benefits**:
- Scoped styles (no class name collisions)
- Standard `className` prop (no `UNSAFE_className`)
- Full control over specificity
- No inline styles to override

## Accessibility

React Aria provides built-in accessibility:
- Proper ARIA attributes
- Keyboard navigation
- Focus management
- Screen reader support

These are equivalent to Adobe Spectrum's accessibility features.

## Migration from Spectrum

| Spectrum | React Aria |
|----------|------------|
| `<Button UNSAFE_className="x">` | `<Button className="x">` |
| `<TextField UNSAFE_className="x">` | `<TextField className="x">` |
| `<Flex UNSAFE_className="x">` | `<Flex className="x">` |
| `<ProgressCircle>` | `<Spinner>` |
| `<Provider theme={...}>` | Not needed (CSS handles theming) |

## Design Tokens

Components use CSS custom properties for theming:

```css
/* Inherited from VS Code theme */
--vscode-button-background
--vscode-button-foreground
--vscode-input-background
--vscode-focusBorder

/* Custom design tokens */
--color-tangerine: #ff6600;
--spacing-1: 4px;
--spacing-2: 8px;
--radius-sm: 4px;
--radius-md: 6px;
```

## Adding New Components

1. Create component directory: `ComponentName/`
2. Add `ComponentName.tsx` with React Aria base
3. Add `ComponentName.module.css` for styles
4. Add `index.ts` exporting component
5. Add to barrel export in `../index.ts`
6. Add tests in `tests/core/ui/components/aria/`
```

---

### Phase 4: Manual Verification Checklist

#### 4.1 Visual Testing Checklist

**Wizard Flow**:
- [ ] Welcome step renders correctly
- [ ] Navigation buttons work (Next, Back, Cancel)
- [ ] Timeline shows correct active step
- [ ] Form inputs accept text and validate
- [ ] Loading states display spinners
- [ ] Error states show appropriate messages
- [ ] Review step shows all selections
- [ ] Creation step shows progress

**Dashboard**:
- [ ] Project cards render correctly
- [ ] Action buttons (Start, Stop, Configure) work
- [ ] Status indicators update properly
- [ ] Component browser opens and displays files

**Sidebar**:
- [ ] Sidebar renders in VS Code sidebar
- [ ] Navigation items are clickable
- [ ] Loading states work

**Theme Compatibility**:
- [ ] Test with VS Code Dark theme
- [ ] Test with VS Code Light theme
- [ ] Test with VS Code High Contrast theme

#### 4.2 Accessibility Testing

- [ ] Tab navigation works through all interactive elements
- [ ] Focus indicators visible on all focusable elements
- [ ] Screen reader announces button labels
- [ ] Screen reader announces form field labels
- [ ] Escape key closes dialogs
- [ ] Enter key submits forms

---

## Files to Create/Modify

### Files to Create

- [ ] `tests/core/ui/styles/importantDeclarations.test.ts` - !important verification
- [ ] `tests/integration/unsafeClassName.test.ts` - UNSAFE_className elimination test
- [ ] `tests/integration/bundleSize.test.ts` - Bundle size verification
- [ ] `tests/documentation/cssArchitecture.test.ts` - Documentation verification
- [ ] `tests/core/ui/styles/layerCascade.test.ts` - @layer verification
- [ ] `src/core/ui/components/aria/README.md` - React Aria components documentation
- [ ] `.rptc/plans/full-react-aria-migration/bundle-size-report.md` - Bundle size comparison

### Files to Modify

- [ ] `CLAUDE.md` - Update Wizard System, CSS Architecture sections
- [ ] `src/core/ui/styles/CLAUDE.md` - Complete rewrite for React Aria architecture

---

## Acceptance Criteria

### Primary Goals (Original Migration Objective)

- [ ] Zero `!important` declarations in `src/core/ui/components/aria/`
- [ ] Less than 50 `!important` total in `src/core/ui/styles/` (90% reduction from 525)
- [ ] Zero `UNSAFE_className` occurrences (eliminated all 292)
- [ ] `@adobe/react-spectrum` not in package.json

### Performance Goals

- [ ] Bundle size reduced by 40%+ (target: <700KB total vs ~1.4MB)
- [ ] wizard.js under 400KB (was ~900KB)
- [ ] Load time maintained or improved

### Documentation Goals

- [ ] Root `CLAUDE.md` updated with React Aria references
- [ ] `src/core/ui/styles/CLAUDE.md` rewritten for 4-layer architecture
- [ ] `src/core/ui/components/aria/README.md` created with usage docs
- [ ] Bundle size report documented

### Testing Goals

- [ ] All existing tests passing (no regressions)
- [ ] New validation tests passing
- [ ] 80%+ coverage maintained

### Visual/Accessibility Goals

- [ ] All wizard steps render correctly
- [ ] Dashboard and sidebar functional
- [ ] Works with Dark, Light, High Contrast themes
- [ ] Keyboard navigation functional
- [ ] Screen reader compatible

---

## Expected Outcome

After this step:
1. **Zero !important in React Aria CSS** - The original goal achieved
2. **292 UNSAFE_className eliminated** - Clean React patterns
3. **50%+ bundle size reduction** - Faster load times
4. **4-layer CSS architecture** - Simplified cascade (spectrum layer removed)
5. **Updated documentation** - Future developers understand new architecture
6. **Comprehensive tests** - Validation automated for CI/CD

---

## Definition of Done

The React Aria migration is complete when:

1. **Verification Tests Pass**:
   ```bash
   npm test -- tests/core/ui/styles/importantDeclarations.test.ts
   npm test -- tests/integration/unsafeClassName.test.ts
   npm test -- tests/integration/bundleSize.test.ts
   npm test -- tests/documentation/cssArchitecture.test.ts
   ```

2. **Full Test Suite Passes**:
   ```bash
   npm test
   ```

3. **Manual Verification Complete**:
   - All checklist items verified
   - Visual testing passed
   - Accessibility testing passed

4. **Documentation Updated**:
   - CLAUDE.md reflects new architecture
   - src/core/ui/styles/CLAUDE.md rewritten
   - README.md created for React Aria components
   - Bundle size report documented

5. **Metrics Achieved**:
   - Zero !important in new CSS
   - Zero UNSAFE_className
   - Bundle size <700KB total
   - All tests passing

---

## Rollback Instructions

If this step needs to be reverted:

1. **Revert documentation:** `git checkout CLAUDE.md src/core/ui/styles/CLAUDE.md`
2. **Delete validation tests:** `rm tests/core/ui/styles/importantDeclarations.test.ts tests/core/ui/styles/bundleSize.test.ts`
3. **Verify:** `npm run build && npm test`

**Rollback Impact:** Low - only affects documentation and validation tests.

**Note:** This is validation-only step; core functionality unchanged.

---

## Notes

### Measuring Success

The migration success is measured by:

| Metric | Pre-Migration | Post-Migration | Goal |
|--------|---------------|----------------|------|
| !important declarations | 525 | <50 | 90% reduction |
| UNSAFE_className | 292 | 0 | 100% elimination |
| Bundle size | ~1.4MB | <700KB | 50% reduction |
| CSS layers | 5 | 4 | spectrum removed |
| @adobe/react-spectrum | installed | removed | dependency gone |

### Documentation Importance

Updated documentation is critical because:
1. Future developers need to understand the new architecture
2. The CLAUDE.md is read by AI assistants and affects code generation
3. Incorrect documentation leads to pattern drift back toward Spectrum patterns

### Continuous Validation

The tests created in this step serve as regression guards:
- CI/CD will catch !important additions
- Bundle size tests prevent bloat
- Documentation tests ensure CLAUDE.md stays current

### What Not to Do

- Do NOT add `!important` to fix styling issues (use @layer correctly)
- Do NOT use `UNSAFE_*` props (they don't exist in React Aria)
- Do NOT import from `@adobe/react-spectrum` (it's uninstalled)
- Do NOT add the spectrum layer back (use components layer)
