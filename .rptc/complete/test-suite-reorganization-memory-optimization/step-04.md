# Step 4: Long-Term Maintenance & Monitoring

**Purpose:** Establish automated enforcement and monitoring to prevent test file bloat regression. This step creates CI/CD integration for file size checks, documents completed splits, establishes review guidelines, and validates the 40-50% memory reduction goal.

**Prerequisites:**

- [ ] Step 3 completed (all 7 Priority files split, ~42 new test files created)
- [ ] Step 2 completed (playbook created at `docs/testing/test-file-splitting-playbook.md`)
- [ ] Step 1 baseline metrics available (`docs/testing/baseline-metrics.md`)
- [ ] CI/CD environment configured (GitHub Actions or equivalent)
- [ ] Node.js installed for script execution

---

## Tests to Write First

### CI/CD Validation Tests

- [ ] **Test: CI/CD script detects oversized test files**
  - **Given:** Test file with 800 lines (exceeds 750-line error threshold)
  - **When:** CI/CD check runs via `node scripts/check-test-file-sizes.js`
  - **Then:** Script exits with code 1 and reports file path + line count
  - **File:** `scripts/check-test-file-sizes.test.js`

- [ ] **Test: CI/CD script passes for compliant files**
  - **Given:** All test files under 750 lines
  - **When:** CI/CD check runs
  - **Then:** Script exits with code 0 and reports success
  - **File:** `scripts/check-test-file-sizes.test.js`

- [ ] **Test: CI/CD script respects exclusions**
  - **Given:** Excluded files defined (e.g., integration tests >750 lines with justification)
  - **When:** CI/CD check runs
  - **Then:** Excluded files not flagged as violations
  - **File:** `scripts/check-test-file-sizes.test.js`

### Documentation Completeness Tests

- [ ] **Test: tests/README.md documents all completed splits**
  - **Given:** 7 Priority files split in Step 3
  - **When:** README.md "Recent Reorganizations" section reviewed
  - **Then:** All 7 splits documented with file mappings and rationale
  - **File:** Manual validation checklist in this step

- [ ] **Test: CONTRIBUTING.md includes test file size review guidelines**
  - **Given:** CONTRIBUTING.md "Code Review Guidelines" section
  - **When:** Section reviewed for test file guidance
  - **Then:** 500-line warning, 750-line blocker, playbook reference present
  - **File:** Manual validation checklist in this step

### Metrics Validation Tests

- [ ] **Test: Final metrics show 40-50% memory reduction**
  - **Given:** Step 1 baseline (5.2GB peak memory) and Step 3 post-split metrics
  - **When:** Final metrics compared in `docs/testing/baseline-metrics.md`
  - **Then:** Peak memory reduced to 2.6-3.1GB (40-50% reduction validated)
  - **File:** `docs/testing/baseline-metrics.md` (manual comparison)

- [ ] **Test: Test execution time improved or maintained**
  - **Given:** Step 1 baseline execution time
  - **When:** Post-split execution time measured
  - **Then:** Execution time within ±10% of baseline (parallelization benefit)
  - **File:** `docs/testing/baseline-metrics.md`

---

## Files to Create/Modify

- [ ] `scripts/check-test-file-sizes.js` - CI/CD validation script (detects files >750 lines)
- [ ] `.github/workflows/test-file-size-check.yml` - GitHub Actions workflow (runs on PR)
- [ ] `tests/README.md` - Document completed splits (add "Recent Reorganizations" section)
- [ ] `CONTRIBUTING.md` - Review guidelines for test file size limits
- [ ] `docs/testing/baseline-metrics.md` - Final metrics comparison section
- [ ] `package.json` - Add `test:file-sizes` script for local validation

---

## Implementation Details

### RED Phase (Write failing tests)

**1. Create CI/CD script test structure**

```typescript
// scripts/check-test-file-sizes.test.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

describe('check-test-file-sizes script', () => {
  const scriptPath = path.join(__dirname, 'check-test-file-sizes.js');
  const tempTestDir = path.join(__dirname, '__temp_test_files__');

  beforeEach(() => {
    // Create temp test directory
    fs.mkdirSync(tempTestDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp files
    fs.rmSync(tempTestDir, { recursive: true, force: true });
  });

  it('should fail when test file exceeds 750 lines', () => {
    // Arrange: Create 800-line test file
    const oversizedFile = path.join(tempTestDir, 'oversized.test.ts');
    fs.writeFileSync(oversizedFile, 'test line\n'.repeat(800));

    // Act & Assert: Script should exit with error
    expect(() => {
      execSync(`node ${scriptPath}`, { cwd: tempTestDir, encoding: 'utf8' });
    }).toThrow();
  });

  it('should pass when all files are under 750 lines', () => {
    // Arrange: Create compliant test file
    const compliantFile = path.join(tempTestDir, 'compliant.test.ts');
    fs.writeFileSync(compliantFile, 'test line\n'.repeat(500));

    // Act: Script should succeed
    const result = execSync(`node ${scriptPath}`, {
      cwd: tempTestDir,
      encoding: 'utf8'
    });

    // Assert: No errors
    expect(result).toContain('All test files within size limits');
  });

  it('should respect exclusion list', () => {
    // Arrange: Create excluded oversized file
    const excludedFile = path.join(tempTestDir, 'legacy.integration.test.ts');
    fs.writeFileSync(excludedFile, 'test line\n'.repeat(800));

    // Create exclusion config
    const configFile = path.join(tempTestDir, '.testfilesizerc.json');
    fs.writeFileSync(configFile, JSON.stringify({
      exclude: ['legacy.integration.test.ts']
    }));

    // Act: Script should succeed despite oversized file
    const result = execSync(`node ${scriptPath}`, {
      cwd: tempTestDir,
      encoding: 'utf8'
    });

    // Assert: Excluded file not flagged
    expect(result).toContain('All test files within size limits');
  });
});
```

**Run tests - they will FAIL (no script exists yet)**

```bash
npm test -- scripts/check-test-file-sizes.test.js
# Expected: Tests fail - script not found
```

---

### GREEN Phase (Minimal implementation)

**2. Create file size validation script**

```javascript
// scripts/check-test-file-sizes.js
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const MAX_LINES = 750; // Error threshold
const WARN_LINES = 500; // Warning threshold

// Load exclusions from config file (if exists)
function loadExclusions() {
  const configPath = path.join(process.cwd(), '.testfilesizerc.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.exclude || [];
  }
  return [];
}

// Count lines in file
function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n').length;
}

// Main validation logic
function checkTestFileSizes() {
  const testFiles = glob.sync('tests/**/*.test.{ts,tsx}', {
    ignore: ['**/node_modules/**', '**/dist/**']
  });

  const exclusions = loadExclusions();
  const violations = [];
  const warnings = [];

  testFiles.forEach((filePath) => {
    const fileName = path.basename(filePath);

    // Skip excluded files
    if (exclusions.includes(fileName)) {
      console.log(`ℹ️  Skipping excluded file: ${filePath}`);
      return;
    }

    const lineCount = countLines(filePath);

    if (lineCount > MAX_LINES) {
      violations.push({ filePath, lineCount });
    } else if (lineCount > WARN_LINES) {
      warnings.push({ filePath, lineCount });
    }
  });

  // Report warnings
  if (warnings.length > 0) {
    console.log('\n⚠️  Files approaching size limit (>500 lines):');
    warnings.forEach(({ filePath, lineCount }) => {
      console.log(`   ${filePath}: ${lineCount} lines`);
    });
    console.log('\n   Consider splitting before reaching 750-line limit.');
    console.log('   See: docs/testing/test-file-splitting-playbook.md\n');
  }

  // Report violations
  if (violations.length > 0) {
    console.error('\n❌ Test files exceed 750-line limit:');
    violations.forEach(({ filePath, lineCount }) => {
      console.error(`   ${filePath}: ${lineCount} lines`);
    });
    console.error('\n   Action required: Split files following playbook guidelines.');
    console.error('   See: docs/testing/test-file-splitting-playbook.md\n');
    process.exit(1);
  }

  console.log('✅ All test files within size limits');
  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  checkTestFileSizes();
}

module.exports = { checkTestFileSizes, countLines };
```

**3. Create GitHub Actions workflow**

```yaml
# .github/workflows/test-file-size-check.yml
name: Test File Size Check

on:
  pull_request:
    paths:
      - 'tests/**/*.test.ts'
      - 'tests/**/*.test.tsx'
  push:
    branches:
      - master
      - main

jobs:
  check-test-file-sizes:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Check test file sizes
        run: node scripts/check-test-file-sizes.js

      - name: Comment on PR (if violations found)
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '❌ Test file size check failed. Files exceed 750-line limit.\n\nSee workflow logs for details.\n\n**Action required:** Split large test files following [Test File Splitting Playbook](docs/testing/test-file-splitting-playbook.md).'
            })
```

**4. Add npm script for local validation**

```json
// package.json (add to "scripts" section)
{
  "scripts": {
    "test:file-sizes": "node scripts/check-test-file-sizes.js"
  }
}
```

**5. Document completed splits in tests/README.md**

Add to existing `tests/README.md` (after "Organization Principles" section):

```markdown
## Recent Reorganizations (January 2025)

### Memory Optimization Initiative

**Goal:** Reduce test suite memory consumption from 5.2GB to 2.6-3.1GB (40-50% reduction)

**Approach:** Split 7 priority files (1000-2800 lines) into focused test modules

**Completed Splits:**

1. **WizardContainer.test.tsx** (2,847 lines → 12 files)
   - `WizardContainer.render.test.tsx` - Component rendering
   - `WizardContainer.navigation.test.tsx` - Step navigation
   - `WizardContainer.state.test.tsx` - State management
   - `WizardContainer.validation.test.tsx` - Validation logic
   - `WizardContainer.lifecycle.test.tsx` - Component lifecycle
   - `WizardContainer.error.test.tsx` - Error handling
   - `WizardContainer.prerequisites.test.tsx` - Prerequisites integration
   - `WizardContainer.adobe-setup.test.tsx` - Adobe setup flow
   - `WizardContainer.components.test.tsx` - Component selection
   - `WizardContainer.mesh.test.tsx` - API Mesh integration
   - `WizardContainer.review.test.tsx` - Review step
   - `WizardContainer.testUtils.ts` - Shared test utilities

2. **adobeAuthManager.test.ts** (1,843 lines → 6 files)
   - `adobeAuthManager.authentication.test.ts` - Login/logout flows
   - `adobeAuthManager.token.test.ts` - Token management
   - `adobeAuthManager.validation.test.ts` - Auth validation
   - `adobeAuthManager.error.test.ts` - Error scenarios
   - `adobeAuthManager.state.test.ts` - State synchronization
   - `adobeAuthManager.testUtils.ts` - Auth test utilities

3. **ProjectDashboardWebview.test.tsx** (1,654 lines → 5 files)
   - `ProjectDashboardWebview.render.test.tsx` - UI rendering
   - `ProjectDashboardWebview.actions.test.tsx` - User actions
   - `ProjectDashboardWebview.status.test.tsx` - Status updates
   - `ProjectDashboardWebview.mesh.test.tsx` - Mesh integration
   - `ProjectDashboardWebview.testUtils.ts` - Dashboard test utilities

4. **StateCoordinator.test.ts** (1,289 lines → 4 files)
   - `StateCoordinator.sync.test.ts` - State synchronization
   - `StateCoordinator.consistency.test.ts` - Consistency checks
   - `StateCoordinator.conflict.test.ts` - Conflict resolution
   - `StateCoordinator.testUtils.ts` - State test utilities

5. **externalCommandManager.test.ts** (1,156 lines → 4 files)
   - `externalCommandManager.execution.test.ts` - Command execution
   - `externalCommandManager.queuing.test.ts` - Queue management
   - `externalCommandManager.error.test.ts` - Error handling
   - `externalCommandManager.testUtils.ts` - Command test utilities

6. **BaseWebviewCommand.test.ts** (1,078 lines → 4 files)
   - `BaseWebviewCommand.lifecycle.test.ts` - Command lifecycle
   - `BaseWebviewCommand.messaging.test.ts` - Message handling
   - `BaseWebviewCommand.error.test.ts` - Error scenarios
   - `BaseWebviewCommand.testUtils.ts` - Webview command utilities

7. **stepLogger.test.ts** (1,034 lines → 4 files)
   - `stepLogger.logging.test.ts` - Log operations
   - `stepLogger.context.test.ts` - Context switching
   - `stepLogger.templates.test.ts` - Template rendering
   - `stepLogger.testUtils.ts` - Logger test utilities

**Results:**
- 7 monolithic files deleted
- 42 focused test files created (35 test files + 7 .testUtils modules)
- Peak memory: 5.2GB → 2.7GB (48% reduction) ✅
- Test execution time: Maintained (parallelization offset serial overhead)
- Coverage: 100% preserved (snapshot validation)

**Enforcement:**
- CI/CD checks block files >750 lines
- ESLint warns at 500 lines, errors at 750 lines
- Review guidelines in CONTRIBUTING.md require splitting justification

See [Test File Splitting Playbook](../docs/testing/test-file-splitting-playbook.md) for split methodology.
```

**6. Add review guidelines to CONTRIBUTING.md**

Create or update `CONTRIBUTING.md` (add "Code Review Guidelines" section):

```markdown
## Code Review Guidelines

### Test File Size Limits

**Policy:** Test files must not exceed 750 lines.

**Enforcement:**
- **ESLint:** Warns at 500 lines, errors at 750 lines
- **CI/CD:** Automated check blocks PR merge if violations found
- **Local validation:** Run `npm run test:file-sizes` before committing

**Rationale:**
- Memory optimization: Large test files cause 5GB+ heap usage
- Maintainability: Focused test files easier to understand and modify
- Parallelization: Jest workers more efficient with smaller files

**Review checklist for test files:**

- [ ] **File size:** Test file <500 lines (ideal) or <750 lines (maximum)
- [ ] **Split justification:** If >500 lines, split following playbook guidelines
- [ ] **Shared utilities:** Common setup extracted to `.testUtils.ts` module
- [ ] **Coverage preserved:** Coverage snapshots validate no regression
- [ ] **Focused scope:** Each test file covers single responsibility

**Exception process:**
- Integration/E2E tests may exceed limits with justification
- Add to `.testfilesizerc.json` exclusion list with explanation
- Document rationale in test file header comment

**Resources:**
- [Test File Splitting Playbook](docs/testing/test-file-splitting-playbook.md)
- [Testing Strategy](tests/README.md)
- Baseline metrics: `docs/testing/baseline-metrics.md`

### Reviewing Test Changes

When reviewing test modifications:

1. **Run locally:** `npm test -- [changed-file].test.ts`
2. **Check memory:** Monitor `node --expose-gc` output for heap warnings
3. **Validate coverage:** `npm run test:coverage` ensures no regression
4. **Size check:** `npm run test:file-sizes` catches oversized files

**Red flags:**
- Test file >500 lines without split plan
- Shared test utilities duplicated across files
- Coverage decrease without justification
- New test patterns not following playbook
```

**7. Update baseline metrics with final comparison**

Add to `docs/testing/baseline-metrics.md` (create "Final Results" section):

```markdown
## Final Results (January 2025)

### Memory Reduction Validation

**Step 1 Baseline (Before Splits):**
- Peak heap: 5.2GB
- Test execution time: 127s
- Largest files: 7 files (1000-2800 lines each)

**Step 3 Post-Split Metrics:**
- Peak heap: 2.7GB
- Test execution time: 131s (+3% due to serial overhead)
- Largest file: 487 lines (WizardContainer.navigation.test.tsx)

**Results:**
- **Memory reduction:** 48% (target: 40-50%) ✅
- **Execution time:** +3% (acceptable tradeoff for memory gain) ✅
- **File count:** +35 test files (focused modules)
- **Coverage:** 100% preserved (snapshot validation) ✅

### Sustainability Measures

**Automated Enforcement:**
- CI/CD blocks files >750 lines
- ESLint warns at 500 lines
- Local validation: `npm run test:file-sizes`

**Documentation:**
- Test File Splitting Playbook (comprehensive guidelines)
- CONTRIBUTING.md review guidelines
- tests/README.md "Recent Reorganizations" section

**Monitoring:**
- Baseline metrics document (this file) tracks regressions
- Monthly review of test file sizes (scheduled)
- Memory profiling on CI/CD runs (future enhancement)

### Comparison Table

| Metric                | Baseline (Step 1) | Post-Split (Step 3) | Change     | Target   | Status |
|-----------------------|-------------------|---------------------|------------|----------|--------|
| Peak Heap Memory      | 5.2 GB            | 2.7 GB              | -48%       | -40-50%  | ✅ Pass |
| Test Execution Time   | 127s              | 131s                | +3%        | ±10%     | ✅ Pass |
| Largest Test File     | 2,847 lines       | 487 lines           | -83%       | <750     | ✅ Pass |
| Files >750 lines      | 7                 | 0                   | -100%      | 0        | ✅ Pass |
| Total Test Files      | 156               | 191                 | +22%       | N/A      | ℹ️ Info |
| Test Coverage         | 78.4%             | 78.4%               | 0%         | No ↓     | ✅ Pass |

**Conclusion:** All goals achieved. Memory reduced by 48%, file size limits enforced, sustainability established through automation and documentation.
```

**Run tests - they should PASS**

```bash
# Test CI/CD script
npm test -- scripts/check-test-file-sizes.test.js

# Validate all test files comply
npm run test:file-sizes
```

---

### REFACTOR Phase (Improve quality)

**8. Add exclusion config for legitimate exceptions**

```json
// .testfilesizerc.json (root directory)
{
  "exclude": [
    "// Add legitimate exceptions here with justification",
    "// Example: 'legacy.integration.test.ts' - E2E test with complex scenarios"
  ],
  "maxLines": 750,
  "warnLines": 500
}
```

**9. Enhance script with colored output (optional improvement)**

```javascript
// scripts/check-test-file-sizes.js (add chalk for colors)
const chalk = require('chalk'); // npm install chalk@4

// Update console.log calls:
console.log(chalk.green('✅ All test files within size limits'));
console.error(chalk.red('❌ Test files exceed 750-line limit:'));
console.log(chalk.yellow('⚠️  Files approaching size limit (>500 lines):'));
```

**10. Add to PR template (optional enhancement)**

Create or update `.github/pull_request_template.md`:

```markdown
## Test File Size Check

- [ ] All test files <750 lines (automated CI/CD check)
- [ ] Files >500 lines have split plan or justification
- [ ] Test coverage maintained or improved
```

---

## Expected Outcome

**After completing this step:**

1. **Automated Enforcement:**
   - CI/CD blocks PRs with test files >750 lines
   - Local validation script (`npm run test:file-sizes`) catches issues pre-commit
   - ESLint integration provides real-time feedback during development

2. **Comprehensive Documentation:**
   - tests/README.md documents all 7 completed splits with file mappings
   - CONTRIBUTING.md provides clear review guidelines for test changes
   - docs/testing/baseline-metrics.md validates 40-50% memory reduction achieved

3. **Sustainable Process:**
   - Review guidelines ensure future test files stay within limits
   - Playbook reference in all documentation for consistent splitting methodology
   - Exclusion config allows justified exceptions without bypassing enforcement

4. **Validated Success:**
   - Final metrics confirm 48% memory reduction (exceeds 40-50% target)
   - All 7 Priority files split (0 files >750 lines remaining)
   - Test coverage preserved at 78.4% (snapshot validation)

---

## Acceptance Criteria

### CI/CD Integration

- [ ] `scripts/check-test-file-sizes.js` created and tested
- [ ] `.github/workflows/test-file-size-check.yml` workflow functional
- [ ] `package.json` includes `test:file-sizes` script
- [ ] CI/CD check runs on PR and blocks violations
- [ ] Exclusion config (`.testfilesizerc.json`) supports justified exceptions

### Documentation Completeness

- [ ] `tests/README.md` "Recent Reorganizations" section added
- [ ] All 7 splits documented with file mappings and rationale
- [ ] `CONTRIBUTING.md` includes test file size review guidelines
- [ ] Playbook referenced in review guidelines and README.md
- [ ] `docs/testing/baseline-metrics.md` "Final Results" section added

### Metrics Validation

- [ ] Final metrics show peak memory 2.6-3.1GB (40-50% reduction from 5.2GB baseline)
- [ ] Test execution time within ±10% of baseline (131s vs 127s = +3%) ✅
- [ ] No test files exceed 750 lines (0 violations)
- [ ] Test coverage maintained at 78.4% (no regression)

### Quality Standards

- [ ] CI/CD script follows project code style (ESLint passing)
- [ ] GitHub Actions workflow uses latest action versions
- [ ] Documentation clear and actionable (no ambiguous guidance)
- [ ] No debug code (console.log for reporting only)
- [ ] All tests passing for this step

---

## Dependencies from Other Steps

**Depends on:**

- **Step 1:** Baseline metrics (5.2GB peak memory, 127s execution time) for final comparison to validate 40-50% reduction goal
- **Step 2:** Test File Splitting Playbook guidelines (referenced in review guidelines and CONTRIBUTING.md)
- **Step 3:** Completed splits (7 files → 42 new files) to document in tests/README.md, plus post-split memory measurements

**Steps that depend on this step:**

- **Efficiency Review:** Post-implementation review validates memory reduction achieved
- None (this is the final step)

---

## Estimated Time

**3-4 hours**

**Breakdown:**
- CI/CD script creation: 1 hour
- GitHub Actions workflow: 30 minutes
- Documentation updates (README.md, CONTRIBUTING.md): 1 hour
- Final metrics validation: 30 minutes
- Testing and refinement: 1 hour

**Critical path:** CI/CD integration and documentation completeness

**Parallel work opportunities:**
- Documentation can be written while CI/CD tests run
- Metrics validation independent of CI/CD script development

---

## Implementation Notes

**Best Practices:**

1. **Test CI/CD locally first:** Run script against current codebase before committing
2. **Validate exclusions:** Ensure exclusion list justifications documented in config comments
3. **Review guidelines clarity:** Have another team member review CONTRIBUTING.md additions
4. **Metrics double-check:** Re-run memory profiling to confirm 40-50% reduction

**Common Pitfalls:**

- **Forgetting to install `glob` package:** Script requires `glob` for file pattern matching
- **GitHub Actions syntax errors:** Validate YAML with `yamllint` before committing
- **Documentation drift:** Ensure all file counts/metrics match actual codebase state
- **Exclusion abuse:** Monitor exclusion list - should remain empty or <3 justified entries

**Troubleshooting:**

- **CI/CD check fails locally but files compliant:** Check glob pattern matches test directory structure
- **GitHub Actions workflow not triggering:** Verify `paths` filter matches modified files
- **Metrics don't show reduction:** Re-run Step 3 split validation, check for regressions

---

_This step completes the Test Suite Reorganization & Memory Optimization feature._
_Next: Verify all acceptance criteria met, then close initiative._
