# Step 4: Audit Medium/Low Priority Gaps

## Purpose

Address remaining coverage gaps for user-facing and internal utility code. While these are lower priority than security and data integrity, achieving 80%+ coverage ensures comprehensive test protection.

## Prerequisites

- [ ] Step 1 complete (coverage analysis done)
- [ ] Step 2 complete (security gaps addressed)
- [ ] Step 3 complete (data integrity gaps addressed)
- [ ] Medium/low priority files identified from coverage report
- [ ] All existing tests still passing

---

## Code Areas by Priority

### Medium Priority (User-Facing)

**UI Step Handlers:**
- `src/features/*/ui/steps/*.ts`
- `src/features/*/ui/hooks/*.ts`

**Error Formatters:**
- `src/features/mesh/utils/errorFormatter.ts`
- `src/features/authentication/services/authenticationErrorFormatter.ts`

**Progress/Feedback Utilities:**
- `src/core/utils/progressUnifier/*.ts`
- `src/core/ui/hooks/*.ts`

### Low Priority (Internal)

**Helper Functions:**
- `src/core/utils/timeFormatting.ts`
- `src/core/utils/promiseUtils.ts`
- `src/core/utils/quickPickUtils.ts`
- `src/core/ui/utils/stringHelpers.ts`
- `src/core/ui/utils/titleHelpers.ts`

**Logging Utilities:**
- `src/core/logging/logger.ts`
- `src/core/logging/errorLogger.ts`

**Internal Transformers:**
- `src/features/*/services/*Mapper*.ts`
- `src/features/*/services/*Transform*.ts`

---

## Tasks

### 4.1 UI Step Handler Coverage

**Target:** 80%+ coverage for UI handlers

- [ ] Review wizard step handlers
  - [ ] WelcomeStep handlers
  - [ ] ProjectCreationStep handlers
  - [ ] ReviewStep handlers
  - [ ] PrerequisitesStep handlers

- [ ] Review authentication UI handlers
  - [ ] AdobeAuthStep handlers
  - [ ] AdobeProjectStep handlers
  - [ ] AdobeWorkspaceStep handlers

- [ ] Review component selection handlers
  - [ ] ComponentSelectionStep handlers
  - [ ] Configuration handlers

**Tests to Write:**

- [ ] Test: Step handler updates state correctly
  - **Given:** Step in specific state
  - **When:** User action triggers handler
  - **Then:** State updated appropriately
  - **File:** `tests/features/*/ui/steps/*-handlers.test.tsx`

- [ ] Test: Step handler validates input
  - **Given:** Invalid user input
  - **When:** Handler processes input
  - **Then:** Validation error displayed
  - **File:** `tests/features/*/ui/steps/*-validation.test.tsx`

### 4.2 Error Formatter Coverage

**Target:** 80%+ coverage for error formatting

- [ ] Review `errorFormatter.ts` coverage
  - [ ] Test all error code mappings
  - [ ] Test fallback messages
  - [ ] Test error context preservation
  - [ ] Test user-friendly formatting

- [ ] Review `authenticationErrorFormatter.ts` coverage
  - [ ] Test auth-specific errors
  - [ ] Test token errors
  - [ ] Test network errors

**Tests to Write:**

- [ ] Test: All error codes mapped to user messages
  - **Given:** Each defined error code
  - **When:** Error formatted
  - **Then:** User-friendly message returned (not raw code)
  - **File:** `tests/features/mesh/utils/errorFormatter-codes.test.ts`

- [ ] Test: Unknown errors have fallback
  - **Given:** Undefined error code
  - **When:** Error formatted
  - **Then:** Generic fallback message shown
  - **File:** `tests/features/mesh/utils/errorFormatter-fallback.test.ts`

- [ ] Test: Error context preserved
  - **Given:** Error with additional context (file, line, etc.)
  - **When:** Error formatted
  - **Then:** Context included in formatted output
  - **File:** `tests/features/mesh/utils/errorFormatter-context.test.ts`

### 4.3 Progress Utilities Coverage

**Target:** 80%+ coverage for progress tracking

- [ ] Review `ProgressUnifier.ts` coverage
  - [ ] Test progress calculation
  - [ ] Test milestone tracking
  - [ ] Test progress strategies

- [ ] Review progress strategies coverage
  - [ ] ImmediateProgressStrategy
  - [ ] ExactProgressStrategy
  - [ ] SyntheticProgressStrategy
  - [ ] MilestoneProgressStrategy

**Tests to Write:**

- [ ] Test: Progress updates within bounds
  - **Given:** Progress updates at various points
  - **When:** Progress calculated
  - **Then:** Value always 0-100, never negative or >100
  - **File:** `tests/core/utils/progressUnifier/ProgressUnifier-bounds.test.ts`

- [ ] Test: Each strategy calculates correctly
  - **Given:** Strategy-specific inputs
  - **When:** Progress calculated
  - **Then:** Strategy-appropriate output
  - **File:** `tests/core/utils/progressUnifier/strategies/*.test.ts`

### 4.4 Helper Function Coverage

**Target:** 80%+ coverage for utilities

- [ ] Review `timeFormatting.ts` coverage
  - [ ] Test duration formatting
  - [ ] Test elapsed time display
  - [ ] Test edge cases (0, negative, large values)

- [ ] Review `promiseUtils.ts` coverage
  - [ ] Test timeout wrappers
  - [ ] Test retry utilities
  - [ ] Test promise combination

- [ ] Review string/title helpers
  - [ ] Test string transformations
  - [ ] Test title case conversion
  - [ ] Test truncation

**Tests to Write:**

- [ ] Test: Time formatting handles edge cases
  - **Given:** Edge case durations (0, 1ms, 1 hour, 1 day)
  - **When:** Duration formatted
  - **Then:** Human-readable output
  - **File:** `tests/core/utils/timeFormatting-edges.test.ts`

- [ ] Test: Promise timeout works correctly
  - **Given:** Promise with timeout
  - **When:** Promise takes longer than timeout
  - **Then:** Timeout error thrown
  - **File:** `tests/core/utils/promiseUtils-timeout.test.ts`

- [ ] Test: String helpers handle empty/null
  - **Given:** Empty, null, undefined inputs
  - **When:** Helper function called
  - **Then:** Graceful handling, no crashes
  - **File:** `tests/core/ui/utils/stringHelpers-null.test.ts`

### 4.5 Logging Utility Coverage

**Target:** 80%+ coverage for logging

- [ ] Review `logger.ts` coverage
  - [ ] Test log level filtering
  - [ ] Test log formatting
  - [ ] Test channel output

- [ ] Review `errorLogger.ts` coverage
  - [ ] Test error serialization
  - [ ] Test stack trace handling
  - [ ] Test circular reference handling

**Tests to Write:**

- [ ] Test: Log level respects configuration
  - **Given:** Log level set to 'warn'
  - **When:** Debug message logged
  - **Then:** Message not output
  - **File:** `tests/core/logging/logger-levels.test.ts`

- [ ] Test: Error logging handles complex errors
  - **Given:** Error with circular references
  - **When:** Error logged
  - **Then:** No crash, circular refs handled
  - **File:** `tests/core/logging/errorLogger-circular.test.ts`

### 4.6 Transformer/Mapper Coverage

**Target:** 80%+ coverage for data transformers

- [ ] Review entity mappers
  - [ ] `entityMappers.ts`
  - [ ] `adobeEntityMapper.ts`

- [ ] Review component transformers
  - [ ] `componentTransforms.ts`
  - [ ] `serviceGroupTransforms.ts`

**Tests to Write:**

- [ ] Test: Mapper handles missing fields
  - **Given:** Input with missing optional fields
  - **When:** Mapper transforms data
  - **Then:** Defaults applied, no crash
  - **File:** `tests/features/*/services/*Mapper-defaults.test.ts`

- [ ] Test: Transformer preserves data integrity
  - **Given:** Valid input data
  - **When:** Transform applied
  - **Then:** Output matches expected structure
  - **File:** `tests/features/*/services/*Transform-structure.test.ts`

---

## Implementation Details

### RED Phase (Write failing tests)

For utility functions, use property-based testing where appropriate:

```typescript
describe('Utility: [function]', () => {
  describe('edge cases', () => {
    it.each([
      [null, expectedForNull],
      [undefined, expectedForUndefined],
      ['', expectedForEmpty],
      ['  ', expectedForWhitespace],
    ])('should handle %s correctly', (input, expected) => {
      expect(utilFunction(input)).toEqual(expected);
    });
  });
});
```

### GREEN Phase (Make tests pass)

- Most utilities should already work
- Add null/undefined handling if missing
- Fix edge case bugs discovered

### REFACTOR Phase

- Consolidate edge case tests using `it.each`
- Extract common test data
- Improve test organization

---

## Expected Outcome

After completing this step:
- All user-facing code at 80%+ coverage
- Error formatters fully tested for all codes
- Progress utilities verified for edge cases
- Helper functions tested for null/edge handling
- Logging utilities coverage improved
- Transformers tested for data integrity

---

## Acceptance Criteria

- [ ] `src/features/*/ui/steps/*.ts` at 80%+ coverage
- [ ] `src/features/*/utils/errorFormatter.ts` at 80%+ coverage
- [ ] `src/core/utils/progressUnifier/*.ts` at 80%+ coverage
- [ ] `src/core/utils/*.ts` at 80%+ coverage
- [ ] `src/core/logging/*.ts` at 80%+ coverage
- [ ] All medium/low priority tests passing
- [ ] Overall codebase at 80%+ coverage

---

## Final Coverage Validation

After completing all gaps:

- [ ] Run full coverage report: `npm run test:coverage`
- [ ] Verify all thresholds met:
  - Statements: >= 80%
  - Branches: >= 80%
  - Functions: >= 80%
  - Lines: >= 80%
- [ ] Document any files still below threshold with justification

---

## Coverage Gaps Justification Template

For files that cannot reach 80%:

```markdown
## File: [path/to/file.ts]

**Current Coverage:** __%

**Reason for Gap:**
- [e.g., "VS Code API integration code, requires E2E testing"]
- [e.g., "Error paths only reachable in production conditions"]

**Mitigation:**
- [e.g., "Covered by integration tests in separate suite"]
- [e.g., "Manual testing documented in QA checklist"]

**Future Work:**
- [e.g., "Extract testable logic, ticket #123"]
```

---

## Time Estimate

**Estimated:** 2-3 hours

- UI step handlers: 30-45 minutes
- Error formatters: 20-30 minutes
- Progress utilities: 20-30 minutes
- Helper functions: 30-45 minutes
- Logging utilities: 15-20 minutes
- Transformers/mappers: 20-30 minutes
- Final validation: 15-20 minutes

---

## Notes

- Utility tests can use `it.each` for comprehensive edge case coverage
- Focus on covering branches, not just lines
- Low-priority tests still valuable for regression prevention
- Document any coverage gaps that cannot be reasonably closed
- Consider test maintainability - don't over-test stable utilities
