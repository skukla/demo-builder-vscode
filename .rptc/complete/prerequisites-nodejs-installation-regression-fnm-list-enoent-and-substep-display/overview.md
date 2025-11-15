# Overview: Prerequisites Node.js Installation Regression

## Status Tracking

- [x] Planned
- [x] Step 1: Fix fnm list Shell Option in Handler Files
- [x] Step 2: Add Milestone Fields to UnifiedProgress Type
- [x] Step 3: Update PrerequisitesStep UI to Render Substeps
- [x] Efficiency Review
- [x] Security Review
- [x] Complete

**Created:** 2025-01-10
**Last Updated:** 2025-11-11

---

## Executive Summary

**Feature:** Fix fnm list ENOENT errors and missing substep display in Prerequisites Node.js installation

**Purpose:**
After successful installation of Node.js versions via fnm (Fast Node Manager), the Prerequisites step incorrectly shows installed versions as NOT installed, accompanied by `spawn fnm list ENOENT` errors in debug logs. Additionally, the unified progress bar fails to display substeps for each Node version being installed, reducing user visibility into the installation process.

This bug impacts user trust in the Prerequisites system and creates confusion when Node.js versions are correctly installed but display as failed.

**Business Value:**
- Restores user confidence in Prerequisites installation status
- Improves UX transparency during multi-version Node installations
- Eliminates confusing error messages in debug logs
- Ensures accurate state representation after successful installations

**Approach:**
1. Add `{ shell: true }` option to all fnm list command executions (4 files)
2. Extend UnifiedProgress type definition with milestone tracking fields
3. Update Prerequisites UI to render milestone substeps

**Estimated Complexity:** LOW
- Clear root cause identified
- Straightforward fix (shell option addition)
- Limited scope (6 files modified)
- Well-defined testing strategy

**Estimated Timeline:** 1-2 hours
- Step 1: 30 minutes (4 file edits + tests)
- Step 2: 15 minutes (type definition + tests)
- Step 3: 30 minutes (UI update + tests)
- Manual testing: 15-30 minutes

**Key Risks:**
1. **Shell Context Variability** (Medium/Low) - Different shells may behave differently
2. **Partial Installation Handling** (Low/Low) - Edge case where some Node versions already installed
3. **Backwards Compatibility** (Low/Low) - Ensuring optional milestone fields don't break existing code

---

## Test Strategy Summary

### Testing Approach

**Framework:** Jest with @testing-library/react
**Coverage Goal:** 85% overall (bug fix must maintain existing coverage)
**Test Philosophy:** Real fnm execution (no mocking), focus on final state verification

### Test Distribution

- **Unit Tests (60%):** Shell option verification in 4 handler files, type definition tests
- **Integration Tests (30%):** Full Node installation flow with multiple versions
- **Component Tests (10%):** UI milestone substep rendering

### Key Test Scenarios

#### Happy Path Tests
1. **Single Node Version Installation**: fnm list executes successfully with shell option
2. **Multiple Node Version Installation**: Substeps displayed correctly (1/2, 2/2)
3. **Status Verification**: Installed versions show as installed after completion

#### Edge Case Tests
1. **Partial Installation**: Some Node versions already installed via fnm
2. **fnm Not in PATH**: Command fails gracefully without shell context (baseline)
3. **fnm Not Installed**: Prerequisite marked as failed appropriately

#### Error Condition Tests
1. **fnm Installation Failure**: Error handling doesn't crash extension
2. **Shell Context Unavailable**: Fallback behavior maintains stability
3. **Type Safety**: Missing milestone fields don't break UI rendering

### Coverage Goals

**Overall Target:** 85% (maintain existing coverage)

**Critical Paths:** 100% coverage required
- fnm list command execution with shell option
- Milestone field population in progress updates
- UI rendering with/without milestone data

**Component Breakdown:**
- `installHandler.ts`: 90% (critical installation logic)
- `PrerequisitesManager.ts`: 90% (core prerequisite management)
- `shared.ts`: 85% (shared utilities)
- `continueHandler.ts`: 85% (flow continuation logic)
- `webview.ts` (types): 100% (type safety critical)
- `PrerequisitesStep.tsx`: 85% (UI component)

---

## Acceptance Criteria

**Definition of Done:**

- [ ] **Functionality:** All fnm list commands execute with `{ shell: true }` option
- [ ] **Functionality:** UnifiedProgress type includes `currentMilestoneIndex` and `totalMilestones` fields
- [ ] **Functionality:** Prerequisites UI displays substeps during Node version installations
- [ ] **Testing:** All unit tests passing (4 handler files + type definition)
- [ ] **Testing:** Integration tests passing (full installation flow)
- [ ] **Testing:** UI component tests passing (milestone rendering)
- [ ] **Testing:** Coverage maintained at ≥85%
- [ ] **Manual Testing:** Node.js 20 and 24 installation shows correct status after completion
- [ ] **Manual Testing:** Substeps visible during installation ("Installing Node.js 20" → "Installing Node.js 24")
- [ ] **Manual Testing:** No `spawn fnm list ENOENT` errors in debug logs
- [ ] **Code Quality:** Passes linter, no debug code, follows project style guide
- [ ] **Backwards Compatibility:** Existing Prerequisites functionality unchanged
- [ ] **Documentation:** Code comments updated where shell option added

**Bug-Specific Verification:**

- [ ] **Primary Bug Fixed:** Installed Node versions display as installed (not NOT installed)
- [ ] **Primary Bug Fixed:** Debug logs show no ENOENT errors for fnm list
- [ ] **Secondary Issue Fixed:** Progress bar shows "Step 1/2: Installing Node.js 20", "Step 2/2: Installing Node.js 24"
- [ ] **Edge Case Verified:** Partial installations (e.g., Node 20 already installed) handled correctly
- [ ] **Regression Prevention:** All 4 locations using fnm list updated consistently

---

## Risk Assessment

### Risk 1: Shell Context Variability Across Platforms

- **Category:** Technical
- **Likelihood:** Medium
- **Impact:** Low
- **Priority:** Medium
- **Description:**
  The `{ shell: true }` option uses `/bin/sh` on Unix and `cmd.exe` on Windows. Different shell environments may initialize fnm differently (e.g., .zshrc vs .bashrc vs .bash_profile). While the current codebase targets macOS (darwin), future Windows/Linux support could be affected.

- **Mitigation:**
  1. Test on multiple shell environments (zsh, bash) during manual testing
  2. Document shell requirement in code comments
  3. Monitor debug logs for shell-related failures
  4. Consider explicit shell path in future (e.g., `shell: '/bin/zsh'`) if issues arise

- **Contingency Plan:**
  If shell variability causes issues, implement shell detection logic and use appropriate initialization commands before fnm list execution.

### Risk 2: Performance Impact of Shell Spawning

- **Category:** Performance
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low
- **Description:**
  Adding `{ shell: true }` spawns a shell process for each fnm list command. With 4 locations calling fnm list, this could introduce minor latency. However, fnm list is already fast (<100ms), and shell overhead is minimal.

- **Mitigation:**
  1. Use existing caching mechanisms in PrerequisitesManager (5-minute TTL already in place)
  2. Verify no duplicate fnm list calls in same execution path
  3. Monitor execution time in tests

- **Contingency Plan:**
  If performance degrades, consolidate fnm list calls or cache results more aggressively.

### Risk 3: Backwards Compatibility with Missing Milestone Fields

- **Category:** Technical
- **Likelihood:** Low
- **Impact:** Low
- **Priority:** Low
- **Description:**
  Adding optional `currentMilestoneIndex` and `totalMilestones` fields to UnifiedProgress could break existing code that doesn't populate these fields. UI must handle absence gracefully.

- **Mitigation:**
  1. Make fields optional with `?` in TypeScript
  2. UI defaults to non-milestone display if fields missing
  3. Test UI with and without milestone data
  4. Verify all existing progress updates still work

- **Contingency Plan:**
  If breakage detected, add explicit default values (`currentMilestoneIndex: 1, totalMilestiles: 1`) for non-milestone operations.

### Risk 4: fnm Not Installed or Not in PATH

- **Category:** Technical/User Environment
- **Likelihood:** Medium (user error)
- **Impact:** Low
- **Priority:** Low
- **Description:**
  Even with `{ shell: true }`, if fnm is not installed or not properly initialized in shell RC files, commands will still fail. This is not a regression but worth documenting.

- **Mitigation:**
  1. Existing prerequisite check for fnm handles this case
  2. Clear error messages guide user to install fnm
  3. No change to existing error handling flow

- **Contingency Plan:**
  N/A - This is expected behavior, not a bug.

### Risk 5: Test Flakiness with Real fnm Execution

- **Category:** Testing
- **Likelihood:** Medium
- **Impact:** Medium
- **Priority:** Medium
- **Description:**
  Using real fnm execution (not mocked) in tests introduces environmental dependencies. Tests may fail if:
  - fnm not installed in CI environment
  - Different Node versions available
  - Network issues downloading Node versions

- **Mitigation:**
  1. Skip tests if fnm not available (jest.skipIf)
  2. Use fnm install with specific Node versions in test setup
  3. Document test environment requirements in test files
  4. Consider separate "integration" test suite for CI vs local

- **Contingency Plan:**
  If CI failures occur, create mock-based unit tests for regression prevention and real execution tests for local verification only.

---

## Dependencies

### External Dependencies

**fnm (Fast Node Manager)**
- **Purpose:** Multi-version Node.js management
- **Risk Level:** Low
- **Required Version:** Any (current stable)
- **Installation:** Already prerequisite in extension
- **Shell Initialization:** Must be initialized in user's shell RC file (.zshrc, .bashrc)

**Shell Environment**
- **Purpose:** Execute fnm commands with PATH and aliases
- **Risk Level:** Low
- **Platform:** macOS (darwin) - primary target
- **Future Consideration:** Windows/Linux support requires shell compatibility testing

### Internal Dependencies

**Existing Prerequisites System**
- **Component:** `ProgressUnifier` (src/shared/utils/ProgressUnifier.ts)
- **Current Behavior:** Sends progress updates with step information
- **Required Enhancement:** Already sends `currentMilestoneIndex` and `totalMilestones` (backend ready)
- **Impact:** Low - backend already supports milestone tracking

**Webview Communication**
- **Component:** `WebviewCommunicationManager` (src/shared/communication/WebviewCommunicationManager.ts)
- **Current Behavior:** Sends UnifiedProgress messages to UI
- **Required Change:** None - type definition update is transparent
- **Impact:** None - backwards compatible

**Prerequisites UI**
- **Component:** `PrerequisitesStep.tsx` (src/features/prerequisites/ui/steps/)
- **Current Behavior:** Displays progress bar with step name
- **Required Change:** Parse and display milestone information
- **Impact:** Low - UI enhancement only

### Modified Components

**installHandler.ts**
- **Current Dependents:** Prerequisites installation flow
- **Impact:** Low
- **Breaking Changes:** No
- **Migration Required:** No

**PrerequisitesManager.ts**
- **Current Dependents:** All prerequisite operations
- **Impact:** Low
- **Breaking Changes:** No
- **Migration Required:** No

**shared.ts** (handlers)
- **Current Dependents:** Multiple handlers use shared utilities
- **Impact:** Low
- **Breaking Changes:** No
- **Migration Required:** No

**continueHandler.ts**
- **Current Dependents:** Prerequisite flow continuation
- **Impact:** Low
- **Breaking Changes:** No
- **Migration Required:** No

**webview.ts** (types)
- **Current Dependents:** All webview communication code
- **Impact:** Low (optional fields)
- **Breaking Changes:** No (backwards compatible)
- **Migration Required:** No

**PrerequisitesStep.tsx**
- **Current Dependents:** Wizard UI
- **Impact:** Low
- **Breaking Changes:** No
- **Migration Required:** No

**Circular Dependency Risks:** None identified

---

## File Reference Map

### Implementation Files (To Modify)

**Prerequisites Handlers:**

1. **`src/features/prerequisites/handlers/installHandler.ts`** (line 102)
   - Current: Executes `fnm list` without shell option
   - Change: Add `{ shell: true }` to spawn options
   - Purpose: Install prerequisites including Node.js versions
   - Impact: Fixes ENOENT errors during installation flow

2. **`src/features/prerequisites/handlers/continueHandler.ts`** (line 120)
   - Current: Executes `fnm list` without shell option
   - Change: Add `{ shell: true }` to spawn options
   - Purpose: Continue button handler for prerequisites step
   - Impact: Fixes ENOENT errors when continuing from prerequisites

3. **`src/features/prerequisites/handlers/shared.ts`** (line 124)
   - Current: Executes `fnm list` without shell option
   - Change: Add `{ shell: true }` to spawn options
   - Purpose: Shared utilities for prerequisite handlers
   - Impact: Fixes ENOENT errors in shared verification logic

**Prerequisites Services:**

4. **`src/features/prerequisites/services/PrerequisitesManager.ts`** (line 423)
   - Current: Executes `fnm list` without shell option
   - Change: Add `{ shell: true }` to spawn options
   - Purpose: Core prerequisite management service
   - Impact: Fixes ENOENT errors during prerequisite checks

**Type Definitions:**

5. **`src/types/webview.ts`** (lines 131-144)
   - Current: UnifiedProgress.command interface without milestone fields
   - Change: Add `currentMilestoneIndex?: number` and `totalMilestones?: number`
   - Purpose: Type definitions for webview communication
   - Impact: Enables milestone tracking in progress updates

**UI Components:**

6. **`src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`** (lines 423-455)
   - Current: Displays progress without milestone information
   - Change: Parse milestone fields and display "Step X/Y: {name} (Milestone M/N)"
   - Purpose: Prerequisites step UI component
   - Impact: Shows substeps for multi-version Node installations

### Test Files (To Create/Modify)

**Unit Tests:**

1. **`tests/features/prerequisites/handlers/installHandler.test.ts`**
   - Tests: fnm list execution with shell option
   - Coverage: Shell option presence, command success/failure

2. **`tests/features/prerequisites/handlers/continueHandler.test.ts`**
   - Tests: fnm list execution with shell option
   - Coverage: Shell option presence, command success/failure

3. **`tests/features/prerequisites/handlers/shared.test.ts`**
   - Tests: fnm list execution with shell option
   - Coverage: Shell option presence, command success/failure

4. **`tests/features/prerequisites/services/PrerequisitesManager.test.ts`**
   - Tests: fnm list execution with shell option, caching behavior
   - Coverage: Shell option presence, cache hits/misses, TTL expiration

5. **`tests/types/webview.test.ts`** (may create if needed)
   - Tests: UnifiedProgress type validation
   - Coverage: Optional milestone fields, backwards compatibility

**Component Tests:**

6. **`tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`**
   - Tests: Milestone substep rendering
   - Coverage: With/without milestone data, formatting, edge cases

**Integration Tests:**

7. **`tests/integration/prerequisites/nodejs-installation.test.ts`** (may create)
   - Tests: Full Node.js installation flow with multiple versions
   - Coverage: End-to-end installation, status verification, substep progression

**Total Files:** 6 modified + up to 7 test files

---

## Coordination Notes

### Cross-Feature Considerations

**Prerequisites System**
- This is an internal bug fix within the Prerequisites feature
- No external API changes
- No impact on other features (Components, Authentication, Mesh, etc.)

**Progress System**
- ProgressUnifier already supports milestone tracking (backend ready)
- Type definition update is additive (backwards compatible)
- Other features using ProgressUnifier unaffected (optional fields)

**Webview Communication**
- UnifiedProgress type change is backwards compatible
- Existing progress updates work without milestone fields
- No migration required for other webview components

### Testing Coordination

**Environment Requirements**
- fnm must be installed for real execution tests
- Tests may be skipped in CI if fnm unavailable
- Document test environment setup in test files

**Test Isolation**
- Unit tests focus on shell option presence
- Integration tests verify end-to-end flow
- Component tests verify UI rendering
- No mocking of fnm execution (per user requirement)

### Documentation Updates

**Code Comments**
- Add comments explaining `{ shell: true }` requirement
- Document why shell context is needed for fnm
- Note shell initialization dependency (.zshrc, .bashrc)

**No User-Facing Documentation Required**
- Bug fix restores expected behavior
- No new features or user actions
- Internal implementation detail

---

## Implementation Constraints

### File Size Constraints
- Standard limit: <500 lines per file
- All modified files well under limit
- No new large files created

### Complexity Constraints
- Function complexity: <50 lines, cyclomatic complexity <10
- Changes are 1-2 line additions (shell option)
- UI update is simple string formatting

### Dependency Constraints

**PROHIBITED:**
- Do NOT mock fnm execution (per user requirement)
- Do NOT change existing error handling flows
- Do NOT introduce new external dependencies

**REQUIRED:**
- Use existing spawn utilities from shared/command-execution
- Follow existing TypeScript strict mode patterns
- Maintain existing caching mechanisms in PrerequisitesManager

### Platform Constraints
- Primary target: macOS (darwin)
- Shell requirement: `/bin/sh` compatibility
- Future consideration: Windows/Linux support (not in scope)

### Performance Constraints
- fnm list execution: <100ms typical
- Shell spawn overhead: <50ms additional
- No regression in prerequisite check performance (maintain 5-minute cache TTL)
- Total prerequisite check: <10s timeout (existing constraint)

---

## Assumptions

**IMPORTANT:** Verify these assumptions before implementation:

- [ ] **Assumption 1: fnm initialized in shell RC files**
  - **Source:** ASSUMED based on fnm installation documentation
  - **Impact if Wrong:** Commands may still fail even with `{ shell: true }`
  - **Verification:** Check user's .zshrc or .bashrc for fnm init script

- [ ] **Assumption 2: ProgressUnifier already sends milestone fields**
  - **Source:** FROM research document analysis
  - **Impact if Wrong:** Backend changes needed (not just type definition)
  - **Verification:** Inspect ProgressUnifier.ts for milestone tracking code

- [ ] **Assumption 3: All 4 locations need shell option**
  - **Source:** FROM research document (fnm list ENOENT in 4 files)
  - **Impact if Wrong:** May fix some locations but not all
  - **Verification:** Search codebase for all fnm list executions

- [ ] **Assumption 4: No Windows/Linux testing required**
  - **Source:** FROM project context (macOS primary target)
  - **Impact if Wrong:** Shell compatibility issues on other platforms
  - **Verification:** Check .context/project-overview.md for platform support

- [ ] **Assumption 5: Real fnm execution acceptable in tests**
  - **Source:** FROM user requirement (no mocking)
  - **Impact if Wrong:** Tests may be flaky or fail in CI
  - **Verification:** Confirm with PM/user that test environment has fnm

---

## Next Actions

**After Overview Approval:**

1. **For Developer:** Review overview and approve plan structure
2. **Next Phase:** Generate individual step files (step-01.md, step-02.md, step-03.md)
3. **Final Review:** Cohesiveness validation across all plan files
4. **Execution:** Run `/rptc:tdd "@prerequisites-nodejs-installation-regression-fnm-list-enoent-and-substep-display/"` to begin TDD implementation

**First Step Preview:**
Step 1 will add `{ shell: true }` option to fnm list commands in 4 handler files, starting with comprehensive test design for shell option verification.

---

_Overview created by Master Feature Planner (Overview Generator Sub-Agent)_
_Status: ✅ Ready for Step Generation_
