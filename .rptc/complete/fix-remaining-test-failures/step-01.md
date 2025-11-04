# Step 1: Fix jest-dom Setup for React Tests

## Summary
Configure TypeScript to recognize jest-dom custom matchers (`toBeInTheDocument`, `toHaveClass`, `toHaveStyle`) by creating a type declaration file that imports jest-dom type extensions.

## Purpose
The setup file `tests/setup/react.ts` imports `@testing-library/jest-dom` which adds matchers at runtime, but TypeScript doesn't recognize these extended types, causing compilation errors like "Property 'toBeInTheDocument' does not exist on type 'JestMatchers<HTMLElement>'". This step adds the TypeScript declarations to enable type-safe usage of jest-dom matchers in all React component tests (~20 affected files).

## Prerequisites
- [x] Jest 29.x and @testing-library/jest-dom@^6.9.1 installed (confirmed in package.json)
- [x] React test configuration with jsdom environment active (confirmed in jest.config.js)
- [x] Setup file `tests/setup/react.ts` exists and imports jest-dom

## Tests to Write First (TDD - RED Phase)

### Test Scenario 1: Verify jest-dom Matchers Compile Successfully
- [x] **Test Description:** Confirm TypeScript accepts `toBeInTheDocument`, `toHaveClass`, and `toHaveStyle` matchers without compilation errors
- [x] **Test File:** `tests/webviews/components/atoms/Badge.test.tsx` (existing test)
- [x] **Assertions:** TypeScript compilation succeeds with `tsc --noEmit` for test files using jest-dom matchers

### Test Scenario 2: Verify Matchers Work at Runtime
- [x] **Test Description:** Run a representative test to ensure jest-dom matchers execute correctly
- [x] **Test File:** `tests/webviews/components/atoms/Badge.test.tsx` (existing test)
- [x] **Assertions:** Test passes with assertions like `expect(element).toBeInTheDocument()`

### Test Scenario 3: Verify Type Intellisense in IDE
- [x] **Test Description:** IDE (VS Code) provides autocomplete for jest-dom matchers when typing `expect(element).to...`
- [x] **Test File:** Any React component test file
- [x] **Assertions:** TypeScript language server recognizes extended matcher types

## Files to Create/Modify

### New Files

#### File: tests/setup/jest-dom.d.ts
**Purpose:** TypeScript declaration file to import jest-dom custom matcher types into Jest's global namespace
**Content:**
```typescript
// Type declarations for @testing-library/jest-dom
// This extends Jest's Matchers interface with jest-dom custom matchers
import '@testing-library/jest-dom';
```

### Modified Files
None (this is a pure TypeScript configuration fix)

## Implementation Details (GREEN Phase)

### RED: Current Failing State
**TypeScript Error:**
```
tests/webviews/components/atoms/Badge.test.tsx:9:52 - error TS2339:
Property 'toBeInTheDocument' does not exist on type 'JestMatchers<HTMLElement>'.
```

**Affected Test Files (20):**
- `tests/webviews/components/atoms/*.test.tsx` (6 files)
- `tests/webviews/components/molecules/*.test.tsx` (6 files)
- `tests/webviews/components/organisms/*.test.tsx` (2 files)
- `tests/webview-ui/shared/components/feedback/LoadingDisplay.test.tsx`
- `tests/features/components/ui/steps/*.test.tsx` (2 files)

### GREEN: Implementation Steps

1. **Create TypeScript declaration file**
   - Create `tests/setup/jest-dom.d.ts` with single import statement
   - This file automatically loads during TypeScript compilation
   - No changes to jest.config.js needed (setup file already imports runtime library)

2. **Verify TypeScript compilation**
   - Run: `npm test -- tests/webviews/components/atoms/Badge.test.tsx --no-coverage`
   - Expected: No TypeScript compilation errors for jest-dom matchers
   - If errors persist, check `tsconfig.json` includes `tests/**/*` in type resolution

3. **Run representative tests**
   - Run: `npm test -- tests/webviews/components/atoms/Badge.test.tsx --no-coverage`
   - Expected: Tests execute and matchers work correctly
   - Run: `npm test -- tests/webviews/components/molecules/EmptyState.test.tsx --no-coverage`
   - Expected: Additional confirmation that matchers work across different test files

4. **Verify in IDE**
   - Open any React test file in VS Code
   - Type `expect(screen.getByText('test')).to` and trigger autocomplete
   - Expected: Autocomplete suggestions include `toBeInTheDocument`, `toHaveClass`, etc.

### REFACTOR: Cleanup and Optimization
- Add comment in `tests/setup/jest-dom.d.ts` explaining purpose
- Document pattern in `tests/README.md` (if exists) for future reference
- No code duplication to clean up (single declaration file)

## Expected Outcome
- TypeScript compilation succeeds for all React component tests
- IDE provides IntelliSense for jest-dom custom matchers
- All jest-dom matchers (`toBeInTheDocument`, `toHaveClass`, `toHaveStyle`, `toHaveTextContent`, etc.) work without TypeScript errors
- ~20 test files now compile and can be executed

## Acceptance Criteria
- [x] Type declaration file `tests/setup/jest-dom.d.ts` created with jest-dom import
- [x] TypeScript compilation succeeds: `npm test -- tests/webviews/components/atoms/Badge.test.tsx` runs without TS errors
- [x] At least 3 representative test files pass: Badge.test.tsx, EmptyState.test.tsx, Icon.test.tsx
- [x] VS Code IntelliSense shows jest-dom matchers in autocomplete
- [x] No new TypeScript errors introduced in other test files
- [x] Setup file `tests/setup/react.ts` remains unchanged (runtime import still works)

## Dependencies from Other Steps
**Depends on:** None (this is Step 1 - foundational test infrastructure fix)

**Blocks:**
- React component tests in Step 6 (depends on jest-dom matchers working)
- Component test files (~20 files) cannot execute without TypeScript recognizing jest-dom matchers
- Note: Steps 2-5 are independent of Step 1 (non-React test fixes)

## Estimated Time
10-15 minutes

**Breakdown:**
- Create declaration file: 2 minutes
- Run verification tests: 5 minutes
- Verify IDE IntelliSense: 2 minutes
- Document changes: 3 minutes
- Final validation: 3 minutes

---

## Reference
- SOP: `testing-guide.md` Section 3 (Testing Frameworks - Jest/React Testing Library setup)
- Package: `@testing-library/jest-dom@^6.9.1` (installed, see package.json line 166)
- Jest Config: `jest.config.js` lines 59 (setupFilesAfterEnv includes react.ts)
