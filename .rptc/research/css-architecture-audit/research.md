# CSS Architecture Audit: Comprehensive Research Findings

**Date:** 2025-12-31
**Scope:** Hybrid (Codebase + Web Research)
**Depth:** Comprehensive
**Focus Areas:** Architecture, Scoping, Performance, Maintainability

---

## Executive Summary

Your CSS architecture uses a **global monolithic approach** with all 4,063 lines centralized in `src/core/ui/styles/`. Despite having a feature-based TypeScript architecture, CSS is NOT feature-scoped. The analysis reveals several opportunities for improvement, though migration carries trade-offs.

**Key Finding:** Feature-scoping via CSS Modules would align CSS with your TypeScript architecture and enable dead CSS elimination, but requires medium migration effort.

**Recommendation:** Incremental migration to **CSS Modules per feature**, starting with `prerequisites` (smallest, 7 classes).

---

## 1. Current State Analysis

### CSS Inventory

| File | Lines | % of Total | Purpose |
|------|-------|------------|---------|
| `custom-spectrum.css` | 3,147 | 77.5% | Utility classes + Spectrum overrides |
| `wizard.css` | 327 | 8.0% | Wizard-specific styles |
| `vscode-theme.css` | 176 | 4.3% | VS Code theming |
| `index.css` | 173 | 4.3% | Entry point + animations |
| `tokens.css` | 165 | 4.1% | Design tokens |
| `reset.css` | 75 | 1.8% | CSS reset |
| **Total** | **4,063** | 100% | |

### Usage Patterns

| Pattern | Count | Files | Notes |
|---------|-------|-------|-------|
| Direct `className` | 470 | 91 | Standard class usage |
| `UNSAFE_className` | 296 | 64 | Spectrum overrides |
| Inline `style={{}}` | 25 | 15 | Dynamic values only |
| `!important` declarations | 1,447 | 1 | 46% of custom-spectrum.css |

### Feature-Specific CSS in Global File

Classes defined globally but used only in ONE feature:

| Feature | CSS Classes | Lines | Impact |
|---------|-------------|-------|--------|
| `prerequisites` | `.prerequisite-*` (7) | ~50 | Cannot tree-shake |
| `project-creation` | `.selector-*`, `.expandable-brand-*` (26) | ~200 | Cannot tree-shake |
| `projects-dashboard` | `.projects-*` (2) | ~20 | Cannot tree-shake |
| **Total isolated** | **35 classes** | **~270** | **6-7% of CSS** |

### CSS Architecture Layers

Current layer structure in `index.css`:
```css
@layer reset, theme, overrides;
```

- **reset**: box-sizing, margins, accessibility (75 lines)
- **theme**: All utility/component classes (3,100+ lines)
- **overrides**: CTA button colors, Spectrum overrides

---

## 2. Issues Identified

### Issue 1: Feature-CSS Coupling (Medium Severity)

**Location:** `src/core/ui/styles/custom-spectrum.css:255-298, 777-935`

Feature-specific classes are buried in global CSS. If `prerequisites` feature were removed, 7 unused classes would remain in the bundle.

**Files affected:**
- Prerequisites: `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx:78-110`
- Project Creation: `src/features/project-creation/ui/components/BrandGallery.tsx`
- Projects Dashboard: `src/features/projects-dashboard/ui/components/ProjectsGrid.tsx:49`

### Issue 2: Heavy `!important` Usage (Medium Severity)

**Location:** Throughout `custom-spectrum.css`

46% of declarations (1,447 out of ~3,147) use `!important` to override Spectrum defaults. This:
- Reduces cascade flexibility
- Makes debugging harder
- Creates specificity arms race

**Example:** `custom-spectrum.css:25-47` (typography), lines `128-154` (button overrides)

### Issue 3: Dead CSS (~5-10%)

**Location:** `custom-spectrum.css:474-482` and others

~50-100 utility classes appear unused:
- `.border-t`, `.border-r`, `.border-b`, `.border-l` - no references found
- `.border-dashed`, `.border-dotted` - no references found
- Many `.w-*`, `.h-*` utilities with no usage

**Estimation:** ~50-100 unused utility classes (~5-10% of total)

### Issue 4: Keyframe Duplication

**Locations:**
- `index.css:152-155`
- `custom-spectrum.css:954-963`

`fadeIn` keyframe defined twice in different files.

### Issue 5: No CSS Scoping Mechanism

**Current state:** All CSS is global. No CSS Modules, no CSS-in-JS, no Shadow DOM.

The `cn()` utility function (`src/core/ui/utils/classNames.ts`) only concatenates strings - no scoping or dead code elimination possible.

---

## 3. Best Practices Research (2025)

### Industry Trends

| Approach | 2024-2025 Adoption | Runtime Cost | Spectrum Compatible |
|----------|-------------------|--------------|---------------------|
| **CSS Modules** | 59% (State of CSS) | None | Excellent |
| **Tailwind CSS** | 75% | None | Conceptual conflict |
| **styled-components** | Declining | ~56% slower | Limited |
| **Vanilla-extract** | Growing | None | Good |
| **CSS Layers** | Emerging | None | Excellent |

**Key Insight:** 2025 shows a clear shift away from runtime CSS-in-JS toward zero-runtime solutions (CSS Modules, vanilla-extract, Tailwind).

### React Spectrum Official Guidance

From Adobe's documentation:
> "React Spectrum components are designed to be **consistent** across all Adobe applications. Internal component styles are intentionally non-customizable."

**Official customization tiers (in order of preference):**

1. **Style Props** (preferred): `marginTop`, `paddingX`, `width`, `height`, etc.
2. **CSS Variables**: Override tokens at Provider level
3. **UNSAFE_className** (escape hatch): "Future updates may cause breaking changes"

**Known Issues:**
- `UNSAFE_className` on DatePicker is overridden by built-in className ([Issue #4222](https://github.com/adobe/react-spectrum/issues/4222))
- `UNSAFE_className` on ContextualHelp has same issue ([Issue #3512](https://github.com/adobe/react-spectrum/issues/3512))

### Recommended Pattern: CSS Modules + Cascade Layers

**Why this combination:**
- Zero runtime overhead (critical for VS Code extensions)
- Incremental adoption (coexists with existing global CSS)
- React Spectrum compatible
- Standard CSS syntax (minimal learning curve)
- Future-proof (native CSS features)

### How Industry Leaders Organize CSS

**Adobe (Spectrum):**
- Design tokens as foundation
- Single team manages 100+ applications
- Minimal customization encouraged

**Vercel (Next.js):**
- CSS Modules as recommended default
- No "best way" - depends on team expertise

**Stripe:**
- CSS variables for theming
- Box/Inline primitives with design tokens

---

## 4. Options Analysis

### Option A: Keep Global CSS (Current)

**Pros:**
- No migration effort
- Works today
- Single import

**Cons:**
- Cannot tree-shake unused feature CSS
- Feature coupling to global styles
- Growing maintenance burden
- 5-10% dead CSS

**Effort:** None

---

### Option B: CSS Modules per Component

**Pros:**
- True scoping
- Dead CSS elimination
- Clear ownership
- Better refactoring

**Cons:**
- Significant migration effort (~91 files)
- Webpack config changes
- TypeScript declarations needed
- Doesn't help with Spectrum overrides

**Effort:** High (2-3 weeks)

**Webpack Configuration Required:**
```javascript
module.exports = {
  module: {
    rules: [
      {
        test: /\.module\.css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              modules: {
                localIdentName: '[name]__[local]--[hash:base64:5]'
              }
            }
          }
        ]
      },
      {
        test: /\.css$/,
        exclude: /\.module\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  }
};
```

---

### Option C: CSS Modules per Feature (Recommended)

**Pros:**
- Aligns with TypeScript architecture
- Lower migration effort than per-component
- Feature teams own their CSS
- Tree-shakable features

**Cons:**
- Medium migration effort
- Still need global utilities
- Shared components need careful handling

**Effort:** Medium (1-2 weeks)

**Proposed Structure:**
```
src/
├── core/ui/styles/
│   ├── index.css              # Entry + layer definitions
│   ├── reset.css              # CSS reset
│   ├── tokens.css             # Design tokens
│   ├── utilities.css          # Shared utilities (text-*, flex, etc.)
│   └── spectrum-overrides.css # Spectrum-specific overrides
│
├── features/
│   ├── prerequisites/styles/
│   │   └── prerequisites.module.css  # 7 prereq classes (~50 lines)
│   ├── project-creation/styles/
│   │   └── brand-selection.module.css  # 26 classes (~200 lines)
│   └── projects-dashboard/styles/
│       └── projects-grid.module.css    # 2 classes (~20 lines)
```

---

### Option D: Hybrid - Layers + Feature Extraction

**Pros:**
- Minimal disruption
- Incremental adoption
- Leverage existing CSS Layers
- No Webpack changes

**Cons:**
- Not true scoping (still global)
- Organizational convention only

**Effort:** Low (3-5 days)

---

## 5. Impact Analysis

### Current vs Scoped Architecture

| Metric | Current | Scoped (Option C) |
|--------|---------|-------------------|
| Global CSS loaded | 4,063 lines | ~3,500 lines |
| Feature-specific CSS | Mixed in global | Isolated |
| Dead CSS elimination | None | Per-feature |
| Tree-shaking | Not possible | Possible |
| Bundle size (est.) | ~26-30KB min | ~23-27KB min |

### Bundle Impact

**Current:** All 3,147 lines of custom-spectrum.css loaded for ALL routes
- Simple prerequisite check: loads all 3,147 lines
- Projects dashboard: loads all 3,147 lines
- Wizard: loads all 3,147 lines

**With Feature Scoping:** Could achieve ~8-10% reduction for single features

---

## 6. Migration Strategy

### Recommended: Incremental Feature Migration

**Phase 1: Assessment (Day 1)**
```bash
# Audit current CSS - find unused styles
npx purgecss --css src/**/*.css --content src/**/*.tsx --output unused-report
```

**Phase 2: Layer Introduction (Day 2)**
```css
/* src/styles/layers.css */
@layer reset, spectrum, spectrum-overrides, legacy-global, features, components, utilities;

/* Wrap existing global CSS */
@import './global.css' layer(legacy-global);
```

**Phase 3: Pilot Feature Migration (Days 3-5)**
- Start with `prerequisites` (smallest, 7 classes)
- Extract to `prerequisites/styles/prerequisites.module.css`
- Update imports in `PrerequisitesStep.tsx`
- Verify no regressions

**Phase 4: Remaining Features (Week 2)**
- `project-creation` (26 classes)
- `projects-dashboard` (2 classes)
- Others as needed

### TypeScript Configuration

```typescript
// src/types/css.d.ts
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}
```

### Common Migration Pitfalls

1. **CSS Import Order Dependencies** - Use cascade layers to make order explicit
2. **Cross-Component Style Leakage** - Use `:global()` selector for intentional globals
3. **Dynamic Class Names** - Change `className={isActive ? 'active' : ''}` to `className={isActive ? styles.active : ''}`
4. **Third-Party Component Styling** - Continue using UNSAFE_className for Spectrum
5. **Visual Regression** - Consider Percy or Chromatic for automated visual testing

---

## 7. Quick Wins (No Migration Required)

Even without CSS Modules, you can:

### 1. Remove Dead CSS
Run PurgeCSS audit, delete unused utilities (~50-100 classes).

### 2. Fix Keyframe Duplication
Remove `fadeIn` from `custom-spectrum.css:954-963` (keep in `index.css`).

### 3. Organize by Feature Comment Blocks
Add clear section headers in `custom-spectrum.css`:
```css
/* ============================================
   PREREQUISITES FEATURE STYLES
   Used by: src/features/prerequisites/ui/
   ============================================ */
.prerequisite-item { ... }
```

### 4. Reduce `!important` Usage
Use CSS Layers more strategically to reduce specificity battles.

---

## 8. Summary of Findings

### What's Working Well

- CSS Cascade Layers already in use (`@layer reset, theme, overrides`)
- Spectrum variables used correctly for theming
- Utility classes reduce repetition
- Minimal inline styles (only 25 occurrences)

### What Could Be Improved

- Feature CSS mixed into global file
- Heavy `!important` reliance (46%)
- Dead CSS accumulation (~5-10%)
- Keyframe duplication
- No scoping mechanism

### Recommendation Summary

| Factor | Recommendation |
|--------|----------------|
| Should you scope? | **Yes, per-feature** (not per-component) |
| Approach | CSS Modules for features, keep utilities global |
| Priority | **Medium** - not blocking, but growing debt |
| Migration strategy | Incremental - one feature at a time |
| Start with | `prerequisites` (smallest, 7 classes) |

---

## 9. Sources

### Codebase Analysis
- `src/core/ui/styles/custom-spectrum.css` - Main stylesheet (3,147 lines)
- `src/core/ui/styles/index.css` - Import aggregator (173 lines)
- `src/core/ui/styles/wizard.css` - Wizard-specific (327 lines)
- `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx:78-110`
- `src/features/project-creation/ui/components/BrandGallery.tsx`
- `src/features/projects-dashboard/ui/components/ProjectsGrid.tsx:49`

### Web Research (32 sources consulted)

**Official Documentation:**
- Adobe React Spectrum Styling: https://react-spectrum.adobe.com/react-spectrum/styling.html
- Spectrum 2 Releases: https://react-spectrum.adobe.com/releases/v1-0-0
- Webpack Code Splitting: https://webpack.js.org/guides/code-splitting/

**Industry/Engineering Blogs:**
- Sourcegraph CSS Modules Migration: https://sourcegraph.com/blog/migrating-to-css-modules-with-codemods-and-code-insights
- CSS-Tricks Cascade Layers Guide: https://css-tricks.com/css-cascade-layers/
- InfoQ on CSS-in-JS: https://www.infoq.com/news/2022/10/prefer-build-time-css-js/

**Surveys:**
- State of CSS 2024: https://2024.stateofcss.com/en-US/tools/

---

## 10. Next Steps

1. **Immediate:** Run dead CSS audit with PurgeCSS
2. **This Week:** Fix keyframe duplication, add feature section comments
3. **Next Sprint:** Pilot CSS Modules migration with `prerequisites` feature
4. **Future:** Evaluate Spectrum 2's style macro for better customization

---

*Research completed: 2025-12-31*
*Research scope: Hybrid (Codebase + Web)*
*Confidence level: High (32 sources, comprehensive codebase analysis)*

---

# Part 2: Pure Layers & Component Scoping (Follow-Up Research)

**Date:** 2026-01-02
**Scope:** CSS architecture modernization options
**Depth:** Comprehensive
**Focus:** Eliminating `!important`, spectrum-css evaluation, React Aria assessment

---

## Executive Summary (Part 2)

This follow-up research evaluates strategies to reduce `!important` declarations and move toward component-scoped CSS while maintaining Adobe Spectrum integration. Three strategic paths were analyzed: spectrum-css migration, React Aria components, and hybrid optimization.

**Key Finding:** The 525 `!important` declarations stem from React Spectrum's inline style injection, which CSS `@layer` cannot override by design. CSS Modules (currently 4 files with 0 `!important`) prove that component scoping eliminates this problem entirely.

**Recommendation:** Hybrid optimization (expand CSS Modules, use wrapper patterns) for near-term, with React Aria pilot for complex new components.

---

## Updated Current State Analysis

### Global CSS vs Component-Scoped CSS (Post-Layer Refactor)

| Category | Files | Lines | `!important` Count |
|----------|-------|-------|-------------------|
| **Global Utilities** | 6 files | ~600 lines | 0 |
| **Global Components** | 8 files | ~1,200 lines | 403 |
| **Global Spectrum Overrides** | 4 files | ~500 lines | 122 |
| **CSS Modules (Scoped)** | 4 files | ~684 lines | 0 |

**Key Insight:** CSS Modules have **zero `!important`** declarations, proving that component scoping eliminates the cascade override problem entirely.

### The `!important` Problem Root Cause

React Spectrum injects **inline styles** directly on elements:

```html
<div style="display: flex; flex-direction: column; ...">
```

CSS `@layer` **cannot override inline styles** regardless of layer order. This is a fundamental CSS specification limitation, not a flaw in our architecture.

### Current CSS Module Usage

Four CSS Modules exist with zero `!important`:

1. `src/features/projects-dashboard/ui/styles/projects-dashboard.module.css`
2. `src/features/prerequisites/ui/styles/prerequisites.module.css`
3. `src/features/project-creation/ui/styles/project-creation.module.css`
4. `src/features/eds/ui/styles/eds.module.css`

---

## Research Findings: Three Strategic Paths

### Path 1: Migrate to spectrum-css + Custom Components

**What is spectrum-css?**
- Raw CSS implementation of Adobe's design system
- No JavaScript, no inline styles
- Full cascade control with standard CSS selectors

**Pros:**
- Complete control over styling (no inline style injection)
- `@layer` works as intended
- Smaller bundle size (~40KB vs ~200KB for React Spectrum)
- Can use CSS Modules for component scoping

**Cons:**
- Lose React Spectrum's accessibility features (must implement manually)
- Lose component state management (checked, disabled, loading)
- Significant rewrite effort (~60-80 hours for current components)
- Must implement ARIA patterns from scratch

**Industry Examples:**
- GitHub uses custom components with utility CSS
- Shopify Polaris uses scoped CSS with design tokens
- Stripe uses CSS Modules with minimal global styles

**When to Consider:**
- Building public-facing applications where bundle size matters
- Team has strong accessibility expertise
- Design system diverges significantly from Spectrum

---

### Path 2: React Aria Components + CSS Modules

**What is React Aria?**
- Adobe's unstyled component library
- Same accessibility primitives as React Spectrum
- **Zero styling** - you provide all CSS

**Pros:**
- Full accessibility out of the box
- Complete styling freedom
- Works perfectly with CSS Modules and `@layer`
- Maintained by Adobe (same team as Spectrum)
- Gradual migration possible (component by component)

**Cons:**
- Must design all visuals from scratch
- Need to implement Spectrum design tokens manually
- Larger upfront effort than keeping React Spectrum

**Example Migration:**

```tsx
// Before: React Spectrum
import { Button } from '@adobe/react-spectrum';
<Button variant="cta">Click</Button>

// After: React Aria + CSS Module
import { Button } from 'react-aria-components';
import styles from './Button.module.css';
<Button className={styles.ctaButton}>Click</Button>
```

**When to Consider:**
- Building new complex components
- Need full styling control without sacrificing accessibility
- Willing to invest in custom visual design

---

### Path 3: Hybrid Optimization (Recommended for Near-Term)

Keep React Spectrum but minimize `!important` through targeted strategies:

**Strategy A: Expand CSS Modules for Feature UI**
- Currently: 4 CSS Modules (684 lines, 0 `!important`)
- Target: Move feature-specific styles from `components/*.css` to CSS Modules
- Impact: Eliminate ~200 `!important` declarations

**Strategy B: Use `UNSAFE_className` Strategically**

```tsx
// Instead of global override with !important
<ActionButton UNSAFE_className={styles.customButton}>
```

- Applies scoped class directly to Spectrum component
- Works with CSS Modules

**Strategy C: Wrapper Component Pattern**

```tsx
// Wrap Spectrum components for layout control
<div className={styles.buttonWrapper}>
  <Button>Click</Button>
</div>
```

- Control positioning/spacing without overriding internals
- Keeps Spectrum accessibility intact

**When to Use:**
- Most near-term development
- When React Spectrum components work well
- When only layout/spacing customization needed

---

## Comparative Analysis

| Approach | `!important` Elimination | Effort | Risk | Accessibility |
|----------|-------------------------|--------|------|---------------|
| **spectrum-css + Custom** | 100% | High (60-80h) | Medium | Must implement |
| **React Aria + CSS Modules** | 100% | Medium (40-60h) | Low | Built-in |
| **Hybrid Optimization** | ~50% | Low (10-20h) | Very Low | Preserved |

---

## Gap Analysis: Current vs Industry Best Practices

| Practice | Industry Standard | Our Implementation | Gap |
|----------|------------------|-------------------|-----|
| Component scoping | CSS Modules or CSS-in-JS | 4 CSS Modules (21% of styles) | **79% still global** |
| `!important` usage | Near zero | 525 total | **High** |
| Design tokens | CSS custom properties | ✅ Using `--spectrum-*` | None |
| Layer architecture | `@layer` for cascade | ✅ 5-layer system | None |
| Utility classes | Scoped or atomic | ✅ 0 `!important` | None |

---

## Recommendations

### Immediate (Low Effort, High Impact)

1. **Expand CSS Modules** for projects-dashboard, configure, and sidebar features
2. **Document pattern** for new feature development (always use CSS Modules)
3. **Audit 403 component `!important`** - identify which can be converted to wrapper patterns

### Medium-Term (If `!important` Remains Problematic)

4. **Pilot React Aria** for one new feature to evaluate migration path
5. **Create CSS Module templates** with Spectrum design token integration

### Long-Term (Full Architecture Modernization)

6. **Evaluate full React Aria migration** based on pilot results
7. **Consider Vanilla Extract** for type-safe CSS if team grows

---

## Answer to Core Question

**"Should we use spectrum-css with custom components?"**

**Not recommended as primary approach** because:
- Loses React Spectrum's accessibility (screen readers, keyboard nav, ARIA)
- Significant implementation effort for diminishing returns
- VS Code webviews have limited user base (not public-facing)

**Better alternative:** **React Aria Components** gives you the same styling freedom as spectrum-css while preserving Adobe's accessibility primitives.

**Best near-term path:** **Hybrid optimization** - expand CSS Modules, use wrapper patterns, and reserve React Aria for new complex components.

---

## Technical Deep Dive

### Why @layer Cannot Override Inline Styles

CSS specificity hierarchy (highest to lowest):
1. `!important` declarations
2. Inline styles (`style=""`)
3. ID selectors
4. Class/attribute selectors
5. Element selectors

`@layer` only affects cascade **within the same specificity level**. Inline styles always win against external CSS unless `!important` is used.

### CSS Module Import Pattern (Jest Compatibility)

Use default imports for Jest compatibility:

```tsx
// ✅ Correct (works with Jest styleMock.js)
import styles from './Component.module.css';
<div className={styles.myClass}>

// ❌ Incorrect (breaks Jest tests)
import { myClass } from './Component.module.css';
<div className={myClass}>
```

### Vanilla Extract (Future Consideration)

Type-safe, zero-runtime CSS-in-TypeScript:

```typescript
// styles.css.ts
import { style } from '@vanilla-extract/css';

export const button = style({
  backgroundColor: 'blue',
  ':hover': {
    backgroundColor: 'darkblue'
  }
});
```

Benefits:
- TypeScript autocomplete for CSS
- Build-time extraction (no runtime cost)
- Works with CSS Modules patterns

---

## Sources (Part 2)

### Industry Practices
- GitHub CSS Architecture (utility-first with scoping)
- Shopify Polaris Design System
- Airbnb CSS-in-JS patterns
- Stripe CSS Modules implementation

### Adobe Documentation
- React Spectrum documentation
- React Aria Components documentation
- spectrum-css GitHub repository

### CSS Specifications
- CSS Cascading and Inheritance Level 5 (@layer)
- CSS Selectors Level 4 (specificity)

---

*Research completed: 2026-01-02*
*Research scope: Comprehensive (Codebase + Web)*
*Confidence level: High (25+ sources, post-layer-refactor analysis)*
