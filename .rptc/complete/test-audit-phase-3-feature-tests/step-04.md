# Step 4: Prerequisites Feature Tests (39 files)

> **Phase:** 3 - Feature Tests
> **Step:** 4 of 9
> **Feature:** prerequisites
> **Test Files:** 39
> **Estimated Time:** 3-4 hours

---

## Purpose

Audit all 39 prerequisites test files to ensure tests accurately reflect the current prerequisite checking, installation, and Node version handling. Prerequisites gate the entire wizard flow.

---

## Prerequisites

- [ ] Steps 1-3 complete or in parallel
- [ ] All current tests pass before starting audit
- [ ] Read current prerequisites implementation structure

---

## Test Files to Audit

### Root Level (2 files)

- [ ] `tests/features/prerequisites/npmFallback.test.ts`
- [ ] `tests/features/prerequisites/npmFlags.test.ts`

### UI Steps (8 files)

- [ ] `tests/features/prerequisites/ui/steps/PrerequisitesStep-checking.test.tsx`
- [ ] `tests/features/prerequisites/ui/steps/PrerequisitesStep-edgeCases.test.tsx`
- [ ] `tests/features/prerequisites/ui/steps/PrerequisitesStep-installation.test.tsx`
- [ ] `tests/features/prerequisites/ui/steps/PrerequisitesStep-optional.test.tsx`
- [ ] `tests/features/prerequisites/ui/steps/PrerequisitesStep-progress-format.test.tsx`
- [ ] `tests/features/prerequisites/ui/steps/PrerequisitesStep-progress-updates.test.tsx`
- [ ] `tests/features/prerequisites/ui/steps/PrerequisitesStep-recheck.test.tsx`

### Handlers (21 files)

- [ ] `tests/features/prerequisites/handlers/checkHandler-errorHandling.test.ts`
- [ ] `tests/features/prerequisites/handlers/checkHandler-multiVersion.test.ts`
- [ ] `tests/features/prerequisites/handlers/checkHandler-operations.test.ts`
- [ ] `tests/features/prerequisites/handlers/continueHandler-edge-cases.test.ts`
- [ ] `tests/features/prerequisites/handlers/continueHandler-errors.test.ts`
- [ ] `tests/features/prerequisites/handlers/continueHandler-operations.test.ts`
- [ ] `tests/features/prerequisites/handlers/installHandler-adobeCLI.test.ts`
- [ ] `tests/features/prerequisites/handlers/installHandler-adobeCliProgress.test.ts`
- [ ] `tests/features/prerequisites/handlers/installHandler-edgeCases.test.ts`
- [ ] `tests/features/prerequisites/handlers/installHandler-errorHandling.test.ts`
- [ ] `tests/features/prerequisites/handlers/installHandler-fnmShell.test.ts`
- [ ] `tests/features/prerequisites/handlers/installHandler-happyPath.test.ts`
- [ ] `tests/features/prerequisites/handlers/installHandler-nodeVersions.test.ts`
- [ ] `tests/features/prerequisites/handlers/installHandler-sharedUtilities.test.ts`
- [ ] `tests/features/prerequisites/handlers/installHandler-shellOptions.test.ts`
- [ ] `tests/features/prerequisites/handlers/installHandler-versionSatisfaction.test.ts`
- [ ] `tests/features/prerequisites/handlers/installHandler.test.ts`
- [ ] `tests/features/prerequisites/handlers/security-validation.test.ts`
- [ ] `tests/features/prerequisites/handlers/shared-dependencies.test.ts`
- [ ] `tests/features/prerequisites/handlers/shared-node-mapping.test.ts`
- [ ] `tests/features/prerequisites/handlers/shared-per-node-status.test.ts`
- [ ] `tests/features/prerequisites/handlers/shared-required-versions.test.ts`

### Services (8 files)

- [ ] `tests/features/prerequisites/services/PrerequisitesManager-checking.test.ts`
- [ ] `tests/features/prerequisites/services/PrerequisitesManager-edgeCases.test.ts`
- [ ] `tests/features/prerequisites/services/PrerequisitesManager-installation.test.ts`
- [ ] `tests/features/prerequisites/services/PrerequisitesManager-progress.test.ts`
- [ ] `tests/features/prerequisites/services/PrerequisitesManager-stateManagement.test.ts`
- [ ] `tests/features/prerequisites/services/prerequisitesCacheManager-operations.test.ts`
- [ ] `tests/features/prerequisites/services/prerequisitesCacheManager-stats-versions.test.ts`
- [ ] `tests/features/prerequisites/services/prerequisitesCacheManager-ttl-eviction.test.ts`

---

## Audit Checklist Per File

### 1. Prerequisite Definitions

```typescript
// VERIFY: Prerequisite IDs match templates/prerequisites.json
// Check templates/prerequisites.json for current definitions

// Example: Prerequisite IDs
const prerequisiteIds = [
  'node',
  'fnm',
  'adobe-cli',
  'adobe-aio-plugins',
  // Verify all IDs exist in JSON
];
```

### 2. Prerequisite Status Types

```typescript
// VERIFY: Status types match current definitions
// Check src/features/prerequisites/types.ts

// Example: PrerequisiteStatus
type PrerequisiteStatus =
  | 'checking'
  | 'installed'
  | 'not-installed'
  | 'installing'
  | 'error'
  | 'optional';
// Verify all status values
```

### 3. Node Version Handling

```typescript
// VERIFY: Node version tests match current multi-version logic
// Check src/features/prerequisites/handlers/ for Node version handling

// Example: Node version selection
const nodeVersions = {
  'adobe-commerce-paas': '18',
  'adobe-commerce-cloud': '20',
  // Verify version mappings match prerequisites.json
};
```

### 4. Installation Commands

```typescript
// VERIFY: Installation command tests match current install logic
// Check templates/prerequisites.json install.command fields

// Example: fnm installation
const fnmInstall = {
  command: 'curl -fsSL https://fnm.vercel.app/install | bash',
  // Verify command matches current JSON
};
```

### 5. Check Commands

```typescript
// VERIFY: Check command tests match current check logic
// Check templates/prerequisites.json check.command fields

// Example: Node check
const nodeCheck = {
  command: 'node --version',
  versionRegex: 'v(\\d+\\.\\d+\\.\\d+)',
  // Verify regex and command match current JSON
};
```

### 6. Cache Manager Logic

```typescript
// VERIFY: Cache tests match current TTL and eviction logic
// Check src/features/prerequisites/services/prerequisitesCacheManager.ts

// Key areas:
// - TTL values (5-minute default)
// - Cache key format
// - Eviction policy (LRU)
// - Size limits (100 entries)
```

### 7. Progress Reporting

```typescript
// VERIFY: Progress tests match current progress format
// Check src/features/prerequisites/ for progress callback shape

// Example: Progress update shape
const progressUpdate = {
  prerequisiteId: 'adobe-cli',
  status: 'installing',
  message: 'Installing Adobe CLI...',
  percent: 50,
  // Verify all fields
};
```

---

## Key Source Files to Reference

| Source File | Purpose |
|-------------|---------|
| `src/features/prerequisites/types.ts` | Type definitions |
| `src/features/prerequisites/handlers/` | Handler implementations |
| `src/features/prerequisites/services/` | Service implementations |
| `src/features/prerequisites/ui/` | UI components |
| `templates/prerequisites.json` | Prerequisite definitions |
| `src/core/utils/timeoutConfig.ts` | Timeout constants |

---

## Common Issues to Look For

### Issue 1: Outdated Prerequisite IDs

```typescript
// OLD: Might reference renamed prerequisites
const prereq = { id: 'aio-cli' }; // Might be 'adobe-cli' now

// CURRENT: Verify against prerequisites.json
const prereq = { id: 'adobe-cli' };
```

### Issue 2: Changed Version Requirements

```typescript
// OLD: Hardcoded version
expect(nodeVersion).toBe('18.x');

// CURRENT: May be dynamic based on component selection
expect(nodeVersion).toMatch(/^(18|20)\./);
```

### Issue 3: Cache TTL Values

```typescript
// OLD: Hardcoded TTL
const ttl = 300000; // 5 minutes

// CURRENT: Use TIMEOUTS constant
const ttl = TIMEOUTS.PREREQUISITE_CACHE_TTL;
```

### Issue 4: Installation Progress Shape

```typescript
// OLD: Simple progress number
onProgress(50);

// CURRENT: Structured progress
onProgress({
  prerequisiteId: 'adobe-cli',
  percent: 50,
  message: 'Installing...',
  elapsed: 5000,
});
```

### Issue 5: Per-Node-Version Status

```typescript
// OLD: Single status per prerequisite
const status = { 'adobe-cli': 'installed' };

// CURRENT: Status per Node version
const status = {
  'adobe-cli': {
    '18': 'installed',
    '20': 'not-installed',
  }
};
```

---

## Expected Outcomes

After auditing all 39 prerequisites test files:

- [ ] All prerequisite ID tests match prerequisites.json
- [ ] All status type tests use current definitions
- [ ] All Node version tests match current multi-version logic
- [ ] All installation tests match current commands
- [ ] All cache tests match current TTL/eviction logic
- [ ] No version references (v2/v3) remain
- [ ] All timeout values use TIMEOUTS.* constants

---

## Acceptance Criteria

- [ ] All 39 prerequisites test files reviewed
- [ ] Mock data matches templates/prerequisites.json
- [ ] Status types match current definitions
- [ ] Node version handling matches current logic
- [ ] Cache tests match current TTL/eviction
- [ ] All prerequisites tests pass
- [ ] No hardcoded timeout values
- [ ] No version-specific logic remains

---

## Notes

- Prerequisites tests are critical for setup flow
- Node version handling is complex - verify multi-version logic
- Cache manager has security features (size limits) - verify tests cover these
- Watch for per-Node-version status tests vs single status

---

## Implementation Log

_To be filled during audit_

### Files Audited

_List files as they are completed_

### Issues Found

_Document any issues requiring follow-up_

### Mock Updates Made

_Track mock structure changes for cross-feature consistency_
