# Step 2: Create CSS Reset

## Purpose

Create `reset.css` with `@layer reset` to neutralize VS Code default styles without breaking Adobe Spectrum. The reset layer has lower precedence than the theme layer, providing a clean baseline.

**Why Second:** Provides baseline CSS reset. The `@layer reset, theme, overrides` declaration in Step 3 ensures reset has lowest cascade priority regardless of import order.

---

## Prerequisites

- [ ] Understanding of CSS @layer cascade
- [ ] Project builds successfully

---

## Tests to Write First

### Unit Tests

- [ ] **Test: Reset uses @layer reset wrapper**
  - **Given:** `reset.css` is loaded
  - **When:** Inspecting file contents
  - **Then:** Contains `@layer reset` declaration
  - **File:** `tests/core/ui/styles/reset.test.ts`

- [ ] **Test: Reset includes box-sizing rule**
  - **Given:** `reset.css` is loaded
  - **When:** Checking CSS rules
  - **Then:** Contains `box-sizing: border-box` rule
  - **File:** `tests/core/ui/styles/reset.test.ts`

- [ ] **Test: Reset does NOT use all:initial**
  - **Given:** `reset.css` is loaded
  - **When:** Checking for aggressive resets
  - **Then:** Does NOT contain `all: initial` or `all: unset`
  - **File:** `tests/core/ui/styles/reset.test.ts`

---

## Files to Create/Modify

### New File

- [ ] `src/core/ui/styles/reset.css` - CSS reset with @layer wrapper (~40 lines)

---

## Implementation Details

### RED Phase (Write failing tests)

```typescript
// tests/core/ui/styles/reset.test.ts
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CSS Reset', () => {
  let resetCSS: string;

  beforeAll(() => {
    resetCSS = readFileSync(
      resolve(__dirname, '../../../../src/core/ui/styles/reset.css'),
      'utf-8'
    );
  });

  it('uses @layer reset wrapper', () => {
    expect(resetCSS).toContain('@layer reset');
  });

  it('includes box-sizing border-box', () => {
    expect(resetCSS).toContain('box-sizing: border-box');
  });

  it('does NOT use all:initial (too aggressive)', () => {
    expect(resetCSS).not.toMatch(/all\s*:\s*initial/);
    expect(resetCSS).not.toMatch(/all\s*:\s*unset/);
  });

  it('resets margin and padding on body/html', () => {
    expect(resetCSS).toContain('margin: 0');
    expect(resetCSS).toContain('padding: 0');
  });
});
```

### GREEN Phase (Minimal implementation)

Create `src/core/ui/styles/reset.css`:

```css
/* ============================================
   CSS RESET
   Neutralizes VS Code defaults without breaking Spectrum
   IMPORTANT: Import BEFORE tokens.css
   ============================================ */

@layer reset {
  /* Universal box-sizing */
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  /* Remove default margins */
  html,
  body,
  h1, h2, h3, h4, h5, h6,
  p,
  ul, ol, li,
  figure,
  blockquote {
    margin: 0;
    padding: 0;
  }

  /* Prevent font size inflation on mobile */
  html {
    -moz-text-size-adjust: none;
    -webkit-text-size-adjust: none;
    text-size-adjust: none;
  }

  /* Remove list styles (Spectrum provides its own) */
  ul, ol {
    list-style: none;
  }

  /* Improve media defaults */
  img, picture, video, canvas, svg {
    display: block;
    max-width: 100%;
  }

  /* Inherit fonts for form controls */
  input, button, textarea, select {
    font: inherit;
  }

  /* Reduce motion for accessibility */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
}
```

### REFACTOR Phase

1. Verify no rules conflict with Spectrum components
2. Ensure accessibility features preserved
3. Keep reset minimal - only what's needed

---

## Expected Outcome

- `reset.css` exists with ~40 lines
- CSS layer declared for proper cascade ordering
- VS Code defaults neutralized
- Spectrum components unaffected

---

## Acceptance Criteria

- [ ] All tests passing for this step
- [ ] `@layer reset` wrapper present
- [ ] No `all: initial` or `all: unset` used
- [ ] Box-sizing reset included
- [ ] Margin/padding reset for common elements
- [ ] Spectrum components still render correctly

---

## Dependencies from Other Steps

- **Depends On:** None (can be done in parallel with Step 1)
- **Required By:** Step 3 (layer order declaration references this file)

---

## Estimated Time

**1-2 hours**
