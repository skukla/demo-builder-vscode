# Step 1: Install React Aria & Infrastructure

## Purpose

Set up React Aria Components package and establish the component directory structure with barrel exports for the incremental migration. This foundation step creates the scaffolding for all subsequent component development.

## Prerequisites

- [x] Node.js and npm available
- [x] Project builds successfully (`npm run build`)
- [x] Existing tests passing (`npm test`)

## Tests to Write First (RED Phase)

### Test File: `tests/core/ui/components/reactAriaSetup.test.ts`

- [ ] Test: react-aria-components package is importable
  - **Given:** Package installed in node_modules
  - **When:** Import `{ Button }` from `react-aria-components`
  - **Then:** No import errors, Button is a valid React component

- [ ] Test: barrel exports are structured correctly
  - **Given:** `src/core/ui/components/primitives/index.ts` exists
  - **When:** Import from `@/core/ui/components/primitives`
  - **Then:** Module resolves without errors (even if empty)

- [ ] Test: CSS Modules work with new component structure
  - **Given:** A test `.module.css` file in primitives directory
  - **When:** Imported in a test component
  - **Then:** Class names are scoped (contain hash pattern)

## Files to Create/Modify

### New Files

- [ ] `src/core/ui/components/aria/index.ts` - Master barrel for React Aria wrappers
- [ ] `src/core/ui/components/aria/primitives/index.ts` - Text, Heading, View, Divider
- [ ] `src/core/ui/components/aria/interactive/index.ts` - Button, ActionButton, ProgressCircle
- [ ] `src/core/ui/components/aria/forms/index.ts` - TextField, SearchField
- [ ] `src/core/ui/components/aria/overlays/index.ts` - Dialog, Menu

### Modified Files

- [ ] `package.json` - Add `react-aria-components` dependency

## Implementation Details (GREEN Phase)

### Sub-step 1.1: Install react-aria-components

```bash
npm install react-aria-components
```

**Note:** React Aria Components is Adobe's unstyled accessible component library. It provides the same accessibility features as React Spectrum but allows full CSS control.

### Sub-step 1.2: Create aria component directory structure

The new React Aria wrappers live under `aria/` to coexist with existing Spectrum-based components during migration:

```
src/core/ui/components/
├── aria/                  # NEW: React Aria wrappers
│   ├── index.ts           # Master barrel
│   ├── primitives/
│   │   └── index.ts       # Text, Heading, View, Divider
│   ├── interactive/
│   │   └── index.ts       # Button, ActionButton, ProgressCircle
│   ├── forms/
│   │   └── index.ts       # TextField, SearchField
│   └── overlays/
│       └── index.ts       # Dialog, Menu
├── feedback/              # EXISTING (unchanged)
├── forms/                 # EXISTING Spectrum-based (unchanged)
├── layout/                # EXISTING (unchanged)
└── ...
```

### Sub-step 1.3: Create barrel exports (empty stubs)

Each `index.ts` starts as an empty barrel, ready for components:

```typescript
// src/core/ui/components/aria/index.ts
/**
 * React Aria Component Wrappers
 *
 * Unstyled accessible components replacing React Spectrum.
 * Each component uses CSS Modules for styling (zero !important).
 */

export * from './primitives';
export * from './interactive';
export * from './forms';
export * from './overlays';
```

```typescript
// src/core/ui/components/aria/primitives/index.ts
/**
 * Primitive Components
 *
 * Basic building blocks: Text, Heading, View, Divider
 * Added in Step 2.
 */

// Components exported as they are created
```

### Sub-step 1.4: Verify installation

```bash
npm ls react-aria-components
npm run build
npm test
```

## Expected Outcome

After this step:

- `react-aria-components` is listed in package.json dependencies
- New `aria/` directory structure exists under `src/core/ui/components/`
- All barrel files created with empty exports (ready for components)
- Build passes with no errors (`npm run build`)
- All existing tests still pass (`npm test`)

## Acceptance Criteria

- [x] `npm ls react-aria-components` shows package installed (v1.14.0)
- [x] Directory `src/core/ui/components/aria/` exists with subdirectories
- [x] All 5 barrel files created (`aria/index.ts` + 4 subdirectory indexes)
- [x] Build passes (`npm run build`)
- [x] All existing tests pass (`npm test`)
- [x] New test file passes with basic import verification (10 tests)

## Dependencies from Other Steps

None - this is the foundation step.

## Estimated Complexity

**Low** - Package installation and file scaffolding only. No logic implementation.

**Time Estimate:** 1-2 hours

---

## Rollback Instructions

If this step needs to be reverted:

1. **Remove package:** `npm uninstall react-aria-components`
2. **Delete directories:** `rm -rf src/core/ui/components/aria/`
3. **Verify:** `npm run build && npm test` - all should pass (no dependencies exist yet)

**Rollback Impact:** None - this is infrastructure only, no consumers yet.

---

## Notes for TDD Sub-Agent

- The `aria/` subdirectory pattern allows coexistence with existing Spectrum components
- Existing `forms/` directory contains Spectrum-based components (FormField, ConfigSection)
- New React Aria form components will live in `aria/forms/`
- CSS Modules already configured in webpack.config.js (lines 62-74)
- Test path alias `@/core/ui/components` is available via tsconfig
