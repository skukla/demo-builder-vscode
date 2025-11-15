# Step 4: Update documentation and clarity

**Purpose:** Add JSDoc comments explaining component-driven model, enhance debug logging for version detection, ensure all code clearly communicates that components drive Node version requirements

**Prerequisites:**

- [ ] Step 1 completed (installHandler bug fixed)
- [ ] Step 2 completed (infrastructure version removed)
- [ ] Step 3 completed (semver satisfaction added)

**Tests to Write First:**

- [ ] Test: Debug logging captures version detection information
  - **Given:** PrerequisitesManager checking Node versions
  - **When:** Version check executed for specific Node version
  - **Then:** Debug logger contains version detection details
  - **File:** `tests/features/prerequisites/services/PrerequisitesManager.test.ts`

- [ ] Test: Comments accurately reflect component-driven model
  - **Given:** PrerequisitesManager with JSDoc comments
  - **When:** Reading public API documentation
  - **Then:** No references to infrastructure version concept
  - **File:** Manual code review (documentation test)

**Files to Create/Modify:**

- [ ] `src/features/prerequisites/services/PrerequisitesManager.ts` - Add comprehensive JSDoc
- [ ] `src/features/prerequisites/handlers/installHandler.ts` - Add explanatory comments
- [ ] `src/features/prerequisites/handlers/shared.ts` - Add debug logging for version detection
- [ ] `templates/CLAUDE.md` - Update if contains infrastructure references

**Implementation Details:**

1. **RED Phase** (Write failing tests)
   ```typescript
   // Test debug logging for version detection
   describe('Version detection logging', () => {
     it('should log when detecting component-required Node versions', () => {
       const debugSpy = jest.spyOn(debugLogger, 'debug');
       // Call getRequiredNodeVersions
       expect(debugSpy).toHaveBeenCalledWith(
         expect.stringContaining('Component requires Node')
       );
     });
   });
   ```

2. **GREEN Phase** (Minimal implementation)
   - Add JSDoc to PrerequisitesManager explaining component-driven approach
   - Add debug logging in shared.ts for version detection
   - Update installHandler comments about adobe-cli adaptation
   - Ensure no infrastructure terminology remains

3. **REFACTOR Phase** (Improve quality)
   - Review all comments for clarity
   - Ensure debug messages provide actionable information
   - Verify consistent terminology throughout

**Expected Outcome:**

- Clear documentation of component-driven Node version model
- Debug logging helps troubleshoot version detection
- No confusion about infrastructure versions
- Code is self-documenting for future maintainers

**Acceptance Criteria:**

- [ ] All JSDoc comments explain component-driven approach
- [ ] Debug logging added for version detection and satisfaction
- [ ] No references to "infrastructure version" in comments/docs
- [ ] Tests pass for documentation accuracy

**Estimated Time:** 1 hour

---

### JSDoc Templates to Add:

**PrerequisitesManager class:**
```typescript
/**
 * Prerequisites Manager - Component-Driven Version Management
 *
 * This manager checks and installs prerequisites based on component requirements.
 * Node.js versions are determined by the components selected by the user:
 * - Each component can specify its required Node version
 * - Multiple Node versions can be installed side-by-side via fnm
 * - Adobe CLI and other tools adapt to the Node version they run under
 *
 * There is NO infrastructure-dictated Node version. Components drive all version requirements.
 */
```

**getRequiredNodeVersions method:**
```typescript
/**
 * Get all Node.js versions required by selected components
 *
 * @param selectedComponents - User's component selections
 * @returns Array of Node major versions (e.g., ['18', '20', '24'])
 *
 * @example
 * // If user selects:
 * // - frontend: needs Node 18
 * // - backend: needs Node 20
 * // - mesh: needs Node 24
 * // Returns: ['18', '20', '24']
 */
```

**Debug logging to add in shared.ts:**
```typescript
context.debugLogger.debug('[Prerequisites] Detected component Node requirements:', {
  frontend: frontendNodeVersion,
  backend: backendNodeVersion,
  dependencies: dependencyNodeVersions,
  totalVersions: uniqueVersions.length,
  versions: uniqueVersions
});
```

**installHandler.ts comment:**
```typescript
// Adobe CLI and other per-node-version tools adapt to the Node version
// they're installed under. This is a component-driven approach where
// the tools conform to what components need, not the other way around.
```

---

### Implementation Notes:

This step focuses on clarity and maintainability after the functional changes in Steps 1-3. The goal is to ensure future developers understand the component-driven philosophy and can troubleshoot version detection issues via debug logging.