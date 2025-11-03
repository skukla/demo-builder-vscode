# Step 0: Research Phase - Test Maintenance and Security Best Practices

## Summary

Research and document industry-standard tools, patterns, and best practices for test maintenance (dead test detection, synchronization) and security validation (token redaction, path safety) to establish implementation standards for all subsequent fix steps.

## Purpose

**Why this step is critical:**
- Prevents perpetuating anti-patterns during fixes (e.g., keeping dead tests, weak redaction)
- Establishes objective criteria for security validation (not guesswork)
- Identifies automation tools to prevent regression after fixes complete
- Creates reusable patterns for 41 failing test suites across 6 categories

**Impact on subsequent steps:**
- Steps 1-5 will apply security patterns discovered here
- Step 6 verification will use dead test detection tools identified here
- All test fixes will follow synchronization strategies defined here

## Prerequisites

- [x] Access to npm registry for tool research
- [x] Web access for OWASP/NIST security guidelines
- [x] SOPs loaded: `testing-guide.md`, `security-and-performance.md`, `architecture-patterns.md`
- [x] Review `.rptc/research/fix-remaining-test-failures-phase2.md` (Phase 1 analysis)

## Research Questions to Answer (RED Phase)

This research step defines "tests" as research validation criteria:

### Research Area 1: Dead Test Detection Tools

- [x] **Research Question:** What tools detect unused/dead test files in Jest projects?
  - **Given:** Jest 29.x codebase with 1000+ test files
  - **When:** Tests exist but are never executed or import non-existent code
  - **Then:** Tool identifies and reports dead tests
  - **Evaluation Criteria:** NPM popularity, Jest 29 compatibility, CI integration support
  - **Expected Findings:** 2-3 candidate tools (e.g., `jest-dead-test-finder`, coverage-based detection)

### Research Area 2: Test Synchronization Strategies

- [x] **Research Question:** How to keep tests synchronized with implementation changes?
  - **Given:** Refactoring moves/renames files frequently
  - **When:** Implementation structure changes (file paths, exports, function signatures)
  - **Then:** Strategy prevents orphaned tests and broken imports
  - **Evaluation Criteria:** Automation potential, TypeScript integration, minimal overhead
  - **Expected Findings:** Path alias strategies, module resolution patterns, pre-commit hooks

### Research Area 3: Token Redaction Security Patterns

- [x] **Research Question:** What are industry-standard patterns for token/credential redaction in tests?
  - **Given:** Tests that mock authentication flows with tokens
  - **When:** Test assertions check for token presence/validity
  - **Then:** Pattern validates redaction without exposing real credentials
  - **Evaluation Criteria:** OWASP compliance, false-positive prevention, audit trail
  - **Expected Findings:** Regex patterns, partial masking strategies, test data factories

### Research Area 4: Path Safety Validation

- [x] **Research Question:** How to validate file path handling prevents security vulnerabilities?
  - **Given:** Tests that validate file system operations
  - **When:** User-supplied paths are processed (e.g., project creation, file watching)
  - **Then:** Validation prevents directory traversal, symlink attacks, absolute path injection
  - **Evaluation Criteria:** OWASP Path Traversal prevention, Node.js best practices, test coverage
  - **Expected Findings:** Path normalization patterns, allowlist strategies, test case examples

## Files to Create/Modify

### Research Output

- [x] `.rptc/plans/fix-remaining-test-failures-phase2/research-findings.md`
  - **Purpose:** Document all research findings for reference in Steps 1-6
  - **Sections:** Tool evaluation, security patterns, synchronization strategies, recommendations

**Note:** This is the only file created in Step 0 (research documentation, not implementation)

## Implementation Details

### RED Phase: Define Research Scope

**Research Parameters:**

1. **Tool Research Constraints:**
   - Must support Jest 29.x
   - Must integrate with TypeScript
   - Must have active maintenance (commits in last 6 months)
   - Should support CI/CD integration

2. **Security Pattern Constraints:**
   - Must align with OWASP guidelines
   - Must be testable (no "trust me" patterns)
   - Must not require production secrets in tests
   - Should support both unit and integration test contexts

3. **Synchronization Strategy Constraints:**
   - Must work with existing path aliases (`@commands/*`, `@features/*`, etc.)
   - Must not break VSCode IntelliSense
   - Must support refactoring tools (rename, move)
   - Should provide fast failure feedback (<1s for broken imports)

### GREEN Phase: Execute Research

**Research Execution Plan:**

**1. Dead Test Detection Tools (45 minutes)**
```bash
# Evaluate NPM packages
npm search "jest dead test"
npm search "jest unused"
npm search "jest coverage analysis"

# Check specific candidates:
# - jest-dead-test-finder
# - jest-coverage-badges (indirect approach)
# - manual scripts using `jest --listTests` + AST analysis
```

**Research Questions:**
- How does tool detect dead tests? (Import analysis? Coverage? AST parsing?)
- Does it handle dynamic imports?
- Can it differentiate "intentionally skipped" vs "dead"?
- What's the false positive rate?

**2. Test Synchronization Strategies (45 minutes)**

**Sources to Research:**
- Jest documentation on module resolution
- TypeScript path mapping best practices
- VSCode extension testing guides
- Existing project `.context/testing-strategy.md`

**Specific Investigations:**
- How do path aliases affect test discoverability?
- What happens when aliased modules are renamed?
- Best practices for `jest.config.js` path mapping
- Pre-commit hooks for import validation

**3. Token Redaction Patterns (45 minutes)**

**Security Standards to Review:**
- OWASP Authentication Testing Guide
- NIST SP 800-63B (Digital Identity Guidelines)
- CWE-522 (Insufficiently Protected Credentials)

**Pattern Examples to Find:**
```typescript
// Example pattern research:
// 1. Full redaction: "access_token": "***"
// 2. Partial masking: "Bearer eyJ...abc" → "Bearer eyJ...***"
// 3. Deterministic fake: Real token structure, fake signature
```

**Test Coverage Research:**
- How to assert redaction occurred without checking exact output?
- How to validate "looks like a token" vs "is a real token"?
- Factory patterns for test credentials

**4. Path Safety Validation (45 minutes)**

**Security Standards to Review:**
- OWASP Path Traversal Prevention Cheat Sheet
- CWE-22 (Improper Limitation of Pathname to Restricted Directory)
- Node.js Security Best Practices (path module)

**Attack Vectors to Research:**
```typescript
// Example attack vectors to test against:
// 1. Directory traversal: "../../etc/passwd"
// 2. Absolute path injection: "/etc/passwd"
// 3. Symlink exploitation: "link -> /sensitive"
// 4. Null byte injection: "safe.txt\0../../evil"
```

**Validation Patterns:**
- Path normalization (`path.normalize`, `path.resolve`)
- Allowlist/denylist strategies
- Boundary checking (ensure path stays within project root)
- Test examples from real-world vulnerabilities

### REFACTOR Phase: Synthesize Findings

**Consolidate Research into Recommendations:**

1. **Tool Recommendations:**
   - Primary tool selection for dead test detection
   - Configuration examples for CI integration
   - Fallback strategies if no perfect tool exists

2. **Security Patterns:**
   - Standard redaction pattern for this project
   - Test assertion templates
   - Path validation utility function specifications

3. **Synchronization Strategy:**
   - Path alias best practices
   - Import validation approach (pre-commit vs CI)
   - Refactoring checklist

4. **Implementation Standards for Steps 1-6:**
   - Security test template (copy-paste ready)
   - Path validation test template
   - Import synchronization checklist

**Output Structure:**
```markdown
# Research Findings: Test Maintenance and Security

## 1. Dead Test Detection
- **Recommended Tool:** [tool name]
- **Rationale:** [why chosen]
- **Integration:** [how to use]
- **Alternatives:** [fallback options]

## 2. Test Synchronization
- **Strategy:** [chosen approach]
- **Implementation:** [specific steps]
- **Verification:** [how to validate]

## 3. Token Redaction Patterns
- **Standard Pattern:** [code example]
- **Test Template:** [reusable test]
- **Rationale:** [why this pattern]

## 4. Path Safety Validation
- **Validation Function:** [specification]
- **Test Cases:** [attack vectors to test]
- **Integration Points:** [where to apply]

## 5. Recommendations for Steps 1-6
- [ ] Use [security pattern] for all auth tests
- [ ] Apply [path validation] to file system tests
- [ ] Run [dead test tool] after fixes
- [ ] Follow [import checklist] during refactoring
```

## Expected Outcome

**After completing this step:**

1. **Research Document Created:**
   - Comprehensive `.rptc/plans/fix-remaining-test-failures-phase2/research-findings.md`
   - 4 research areas fully documented with actionable recommendations

2. **Tool Recommendations Ready:**
   - Specific NPM packages identified for dead test detection
   - Installation and configuration instructions prepared

3. **Security Patterns Documented:**
   - Token redaction pattern with code examples
   - Path safety validation function specification
   - Test templates ready for Steps 1-5

4. **Synchronization Strategy Defined:**
   - Path alias best practices documented
   - Import validation approach chosen
   - Refactoring checklist created

5. **Implementation Standards Established:**
   - Copy-paste ready templates for security tests
   - Clear criteria for "what makes a test secure"
   - Objective validation methods (not subjective review)

**Artifacts:**
- `research-findings.md` (3-5 pages, well-structured)
- No code changes (research only)
- No test changes (research only)

## Acceptance Criteria

### Research Completeness

- [x] All 4 research areas investigated (dead tests, sync, token redaction, path safety)
- [x] At least 2 candidate tools identified for dead test detection
- [x] Security patterns cite OWASP or NIST standards (not arbitrary rules)
- [x] Path safety validation covers all 4 attack vectors (traversal, absolute, symlink, null byte)
- [x] Test synchronization strategy addresses existing path aliases (`@commands/*`, `@features/*`, etc.)

### Documentation Quality

- [x] `research-findings.md` created with all sections complete
- [x] Each recommendation includes rationale (why, not just what)
- [x] Code examples provided for reusable patterns (token redaction, path validation)
- [x] Tool recommendations include NPM package names and versions
- [x] Integration steps clearly documented (how to use findings in Steps 1-6)

### Actionability

- [x] Security test templates are copy-paste ready (no placeholders like "TODO: implement")
- [x] Tool installation commands provided (exact npm/yarn commands)
- [x] Clear decision criteria for when to apply each pattern
- [x] No ambiguous guidance (e.g., "validate paths carefully" → specific function spec)

### SOP Alignment

- [x] Findings align with `testing-guide.md` (SOP) TDD methodology
- [x] Security patterns align with `security-and-performance.md` (SOP)
- [x] No contradictions with existing project conventions (`.context/testing-strategy.md`)

### Efficiency

- [x] Research document <5 pages (focused, not exhaustive)
- [x] References external docs rather than embedding (e.g., link to OWASP instead of copying)
- [x] Findings directly applicable to Steps 1-6 (no theoretical deep dives)

## Dependencies from Other Steps

**Prerequisites:** None (this is Step 0 - first step in sequence)

**Dependents:** All subsequent steps (1-6) depend on this research
- Step 1 (Security Tests): Uses token redaction and path safety patterns
- Step 2 (Auth Tests): Uses token redaction patterns
- Step 3 (Prerequisites Tests): Uses path safety patterns
- Step 4 (React Component Tests): Uses test synchronization strategies
- Step 5 (Miscellaneous Tests): Uses all patterns
- Step 6 (Verification): Uses dead test detection tools

**Critical Path:** This step MUST complete before Steps 1-5 begin
- Security patterns define implementation standards for all test fixes
- Without research, Steps 1-5 risk perpetuating anti-patterns
- Dead test tool selection affects Step 6 verification approach

## Estimated Time

**Total Research Time:** 3-4 hours

**Breakdown:**
- Dead test detection tools: 45 minutes
- Test synchronization strategies: 45 minutes
- Token redaction patterns: 45 minutes
- Path safety validation: 45 minutes
- Synthesis and documentation: 60-90 minutes

**Why this estimate:**
- NPM tool research is fast (15-20 min per area)
- Security standard review requires careful reading (OWASP, NIST)
- Synthesis requires thoughtful consolidation (not just copy-paste)
- Documentation quality matters (Steps 1-6 depend on clarity)

**Parallelization:** Not applicable (single researcher, sequential investigation)

**Risk Buffer:** +30 minutes for unexpected findings or tool evaluation complexity

---

**Next Step After Completion:** Step 1 - Fix Security Test Failures (6 suites)
**Command to Execute This Step:** `/rptc:tdd "@fix-remaining-test-failures-phase2/step-00.md"`
