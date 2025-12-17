# Step 1: Create Design Token System

## Purpose

Create `tokens.css` with three-tier CSS variable architecture that centralizes all color definitions. This foundation enables systematic replacement of 50+ hard-coded color values across the codebase while maintaining visual consistency.

**Why First:** All subsequent steps depend on these tokens existing. Components cannot reference semantic variables until this file is created.

---

## Prerequisites

- [ ] Node.js and npm installed
- [ ] Project builds successfully (`npm run build`)
- [ ] Understanding of CSS custom properties syntax

---

## Tests to Write First

Since this is a CSS-only step, tests focus on token existence and value correctness.

### Unit Tests

- [ ] **Test: Primitive color tokens are defined**
  - **Given:** `tokens.css` is loaded
  - **When:** Querying CSS custom properties on `:root`
  - **Then:** All primitive tokens (`--db-color-*`) have valid color values
  - **File:** `tests/core/ui/styles/tokens.test.ts`

- [ ] **Test: Semantic tokens reference primitives**
  - **Given:** `tokens.css` is loaded
  - **When:** Inspecting semantic token values
  - **Then:** Each semantic token uses `var(--db-color-*)` syntax
  - **File:** `tests/core/ui/styles/tokens.test.ts`

- [ ] **Test: Status color tokens exist for all statuses**
  - **Given:** `tokens.css` is loaded
  - **When:** Checking for status tokens
  - **Then:** Tokens exist for success, error, warning, info, neutral
  - **File:** `tests/core/ui/styles/tokens.test.ts`

- [ ] **Test: Brand tangerine tokens are defined**
  - **Given:** `tokens.css` is loaded
  - **When:** Checking brand tokens
  - **Then:** `--db-brand-primary`, `--db-brand-primary-hover`, `--db-brand-primary-active` exist with tangerine values
  - **File:** `tests/core/ui/styles/tokens.test.ts`

### Visual Regression (Manual)

- [ ] **Test: Tokens load without CSS errors**
  - **Given:** Webview is open
  - **When:** Browser DevTools console is checked
  - **Then:** No CSS parsing errors related to tokens.css

---

## Files to Create/Modify

### New File

- [ ] `src/core/ui/styles/tokens.css` - Three-tier design token definitions (~200 lines)

---

## Implementation Details

### RED Phase (Write failing tests)

Create test file that validates token existence:

```typescript
// tests/core/ui/styles/tokens.test.ts
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Design Token System', () => {
  let tokensCSS: string;

  beforeAll(() => {
    tokensCSS = readFileSync(
      resolve(__dirname, '../../../../src/core/ui/styles/tokens.css'),
      'utf-8'
    );
  });

  describe('Primitive Tokens', () => {
    it('defines gray scale primitives', () => {
      expect(tokensCSS).toContain('--db-color-gray-50:');
      expect(tokensCSS).toContain('--db-color-gray-900:');
    });

    it('defines status color primitives', () => {
      expect(tokensCSS).toContain('--db-color-green-500:');
      expect(tokensCSS).toContain('--db-color-red-500:');
      expect(tokensCSS).toContain('--db-color-amber-500:');
      expect(tokensCSS).toContain('--db-color-blue-500:');
    });

    it('defines tangerine brand primitives', () => {
      expect(tokensCSS).toContain('--db-color-tangerine-500:');
      expect(tokensCSS).toContain('#f97316');
    });
  });

  describe('Semantic Tokens', () => {
    it('defines status semantic tokens', () => {
      expect(tokensCSS).toContain('--db-status-success:');
      expect(tokensCSS).toContain('--db-status-error:');
      expect(tokensCSS).toContain('--db-status-warning:');
      expect(tokensCSS).toContain('--db-status-info:');
    });

    it('defines brand semantic tokens', () => {
      expect(tokensCSS).toContain('--db-brand-primary:');
      expect(tokensCSS).toContain('--db-brand-primary-hover:');
    });
  });

  describe('Layer Declaration', () => {
    it('wraps tokens in @layer theme', () => {
      expect(tokensCSS).toContain('@layer theme');
    });
  });
});
```

### GREEN Phase (Minimal implementation)

Create `src/core/ui/styles/tokens.css`:

```css
/* ============================================
   DESIGN TOKEN SYSTEM
   Three-tier architecture: Primitives -> Semantic -> Component
   Namespace: --db-* (Demo Builder)
   ============================================ */

@layer theme {
  :root {
    /* =========================================
       LAYER 1: PRIMITIVE TOKENS
       Raw color values - DO NOT use directly in components
       ========================================= */

    /* Gray Scale (matches Spectrum dark theme) */
    --db-color-gray-50: #fafafa;
    --db-color-gray-75: #f5f5f5;
    --db-color-gray-100: #e8e8e8;
    --db-color-gray-200: #d1d1d1;
    --db-color-gray-300: #b3b3b3;
    --db-color-gray-400: #8c8c8c;
    --db-color-gray-500: #6b7280;
    --db-color-gray-600: #525252;
    --db-color-gray-700: #3f3f3f;
    --db-color-gray-800: #292929;
    --db-color-gray-900: #1a1a1a;

    /* Status Colors */
    --db-color-green-100: rgba(16, 185, 129, 0.1);
    --db-color-green-500: #10b981;
    --db-color-green-600: #059669;

    --db-color-red-100: rgba(239, 68, 68, 0.1);
    --db-color-red-500: #ef4444;
    --db-color-red-600: #dc2626;

    --db-color-amber-100: rgba(245, 158, 11, 0.1);
    --db-color-amber-500: #f59e0b;
    --db-color-amber-600: #d97706;

    --db-color-blue-100: rgba(59, 130, 246, 0.1);
    --db-color-blue-500: #3b82f6;
    --db-color-blue-600: #2563eb;

    /* Tip/Info Colors */
    --db-color-info-bg: rgba(20, 115, 230, 0.08);
    --db-color-info-border: rgba(20, 115, 230, 0.2);
    --db-color-success-bg: rgba(75, 175, 79, 0.08);
    --db-color-success-border: rgba(75, 175, 79, 0.2);

    /* Brand Colors - Tangerine Orange */
    --db-color-tangerine-400: #fb923c;
    --db-color-tangerine-500: #f97316;
    --db-color-tangerine-600: #ea580c;
    --db-color-tangerine-700: #c2410c;

    /* Terminal Colors */
    --db-color-terminal-bg: #0d0d0d;
    --db-color-terminal-fg: #d4d4d4;
    --db-color-terminal-command: #569cd6;
    --db-color-terminal-success: #4ec9b0;
    --db-color-terminal-error: #f48771;
    --db-color-terminal-warning: #dcdcaa;

    /* Overlay Colors */
    --db-color-overlay-dark: rgba(0, 0, 0, 0.3);
    --db-color-overlay-shadow: rgba(0, 0, 0, 0.15);

    /* =========================================
       LAYER 2: SEMANTIC TOKENS
       Purpose-based tokens - USE THESE in components
       ========================================= */

    /* Surface Colors */
    --db-surface-background: var(--db-color-gray-900);
    --db-surface-foreground: var(--db-color-gray-50);
    --db-surface-secondary: var(--db-color-gray-800);
    --db-surface-tertiary: var(--db-color-gray-700);

    /* Text Colors */
    --db-text-primary: var(--db-color-gray-50);
    --db-text-secondary: var(--db-color-gray-300);
    --db-text-muted: var(--db-color-gray-500);

    /* Border Colors */
    --db-border-default: var(--db-color-gray-600);
    --db-border-subtle: var(--db-color-gray-700);

    /* Status Semantic Tokens */
    --db-status-success: var(--db-color-green-500);
    --db-status-success-bg: var(--db-color-green-100);
    --db-status-error: var(--db-color-red-500);
    --db-status-error-bg: var(--db-color-red-100);
    --db-status-warning: var(--db-color-amber-500);
    --db-status-warning-bg: var(--db-color-amber-100);
    --db-status-info: var(--db-color-blue-500);
    --db-status-info-bg: var(--db-color-blue-100);
    --db-status-neutral: var(--db-color-gray-500);
    --db-status-neutral-bg: rgba(107, 114, 128, 0.1);

    /* Brand Tokens */
    --db-brand-primary: var(--db-color-tangerine-500);
    --db-brand-primary-hover: var(--db-color-tangerine-600);
    --db-brand-primary-active: var(--db-color-tangerine-700);

    /* Tip Component Tokens */
    --db-tip-info-bg: var(--db-color-info-bg);
    --db-tip-info-border: var(--db-color-info-border);
    --db-tip-success-bg: var(--db-color-success-bg);
    --db-tip-success-border: var(--db-color-success-border);

    /* Terminal Tokens */
    --db-terminal-background: var(--db-color-terminal-bg);
    --db-terminal-foreground: var(--db-color-terminal-fg);
    --db-terminal-command: var(--db-color-terminal-command);
    --db-terminal-success: var(--db-color-terminal-success);
    --db-terminal-error: var(--db-color-terminal-error);
    --db-terminal-warning: var(--db-color-terminal-warning);

    /* Overlay Tokens */
    --db-overlay-background: var(--db-color-overlay-dark);
    --db-overlay-shadow: var(--db-color-overlay-shadow);

    /* =========================================
       LAYER 3: COMPONENT TOKENS
       Component-specific tokens (defined in components)
       ========================================= */

    /* StatusDot */
    --db-status-dot-success: var(--db-status-success);
    --db-status-dot-error: var(--db-status-error);
    --db-status-dot-warning: var(--db-status-warning);
    --db-status-dot-info: var(--db-status-info);
    --db-status-dot-neutral: var(--db-status-neutral);

    /* Badge */
    --db-badge-success-bg: var(--db-status-success-bg);
    --db-badge-success-text: var(--db-status-success);
    --db-badge-error-bg: var(--db-status-error-bg);
    --db-badge-error-text: var(--db-status-error);
    --db-badge-warning-bg: var(--db-status-warning-bg);
    --db-badge-warning-text: var(--db-status-warning);
    --db-badge-info-bg: var(--db-status-info-bg);
    --db-badge-info-text: var(--db-status-info);
    --db-badge-neutral-bg: var(--db-status-neutral-bg);
    --db-badge-neutral-text: var(--db-status-neutral);

    /* CTA Button */
    --db-cta-background: var(--db-brand-primary);
    --db-cta-background-hover: var(--db-brand-primary-hover);
    --db-cta-background-active: var(--db-brand-primary-active);
    --db-cta-text: var(--db-color-gray-50);

    /* Code/NumberedInstructions */
    --db-code-background: var(--db-surface-background);
    --db-code-border: rgba(255, 255, 255, 0.25);

    /* LoadingOverlay */
    --db-loading-overlay-bg: var(--db-overlay-background);
    --db-loading-overlay-shadow: var(--db-overlay-shadow);
    --db-loading-text: var(--db-color-gray-50);
  }
}
```

### REFACTOR Phase

1. Verify no duplicate token definitions
2. Ensure consistent naming convention (`--db-[category]-[variant]`)
3. Add comments for each section
4. Validate all colors match existing hard-coded values from research

---

## Expected Outcome

- `tokens.css` file exists with ~200 lines
- All 50+ hard-coded color values have corresponding tokens
- Tests pass validating token existence
- CSS loads without errors in webview

---

## Acceptance Criteria

- [ ] All tests passing for this step
- [ ] Token file uses `--db-` namespace prefix consistently
- [ ] Three-tier architecture implemented (primitives, semantic, component)
- [ ] `@layer theme` wrapper present
- [ ] Tangerine brand colors (#f97316, #ea580c, #c2410c) defined
- [ ] All status colors (success, error, warning, info, neutral) defined
- [ ] Terminal colors defined
- [ ] No CSS parsing errors when loaded

---

## Dependencies from Other Steps

- **None** - This is the foundation step

**Dependent Steps:**
- Step 3 (@layer declarations) depends on tokens.css existing
- Steps 4-5 (component migration) depend on tokens.css existing

---

## Estimated Time

**2-3 hours**

- Test setup: 30 minutes
- Token file creation: 1-1.5 hours
- Validation and refactoring: 30 minutes
- Documentation: 30 minutes
