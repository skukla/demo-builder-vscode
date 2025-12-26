# Step 8: EDS Feature Tests (10 files)

> **Phase:** 3 - Feature Tests
> **Step:** 8 of 9
> **Feature:** eds (Edge Delivery Services)
> **Test Files:** 10
> **Estimated Time:** 1-2 hours

---

## Purpose

Audit all 10 EDS test files to ensure tests accurately reflect the current Edge Delivery Services integration, GitHub repository setup, and data source configuration.

---

## Prerequisites

- [ ] Steps 1-7 complete or in parallel
- [ ] All current tests pass before starting audit
- [ ] Read current EDS implementation structure

---

## Test Files to Audit

### UI Components (3 files)

- [ ] `tests/features/eds/ui/components/DaLiveServiceCard.test.tsx`
- [ ] `tests/features/eds/ui/components/GitHubServiceCard.test.tsx`
- [ ] `tests/features/eds/ui/components/VerifiedField.test.tsx`

### UI Steps (4 files)

- [ ] `tests/features/eds/ui/steps/DataSourceConfigStep.test.tsx`
- [ ] `tests/features/eds/ui/steps/EdsRepositoryConfigStep.test.tsx`
- [ ] `tests/features/eds/ui/steps/GitHubRepoSelectionStep.test.tsx`
- [ ] `tests/features/eds/ui/steps/GitHubSetupStep.test.tsx`

### UI Hooks (1 file)

- [ ] `tests/features/eds/ui/hooks/useGitHubAuth.test.tsx`

### UI Helpers (1 file)

- [ ] `tests/features/eds/ui/helpers/validationHelpers.test.ts`

### Handlers (1 file)

- [ ] `tests/features/eds/handlers/edsHelpers.test.ts`

---

## Audit Checklist Per File

### 1. EDS Configuration Types

```typescript
// VERIFY: EDS config types match current definitions
// Check src/features/eds/types.ts

// Example: EDS configuration
interface EdsConfig {
  repositoryOwner: string;
  repositoryName: string;
  dataSource: DataSourceType;
  // Verify all fields
}
```

### 2. GitHub Authentication Flow

```typescript
// VERIFY: GitHub auth tests match current OAuth flow
// Check src/features/eds/ui/hooks/useGitHubAuth.ts

// Key areas:
// - OAuth initiation
// - Token handling
// - Auth status detection
```

### 3. Repository Selection

```typescript
// VERIFY: Repo selection tests match current flow
// Check src/features/eds/ui/steps/GitHubRepoSelectionStep.tsx

// Example: Repository data
const repo = {
  owner: 'adobe',
  name: 'demo-site',
  fullName: 'adobe/demo-site',
  // Verify structure
};
```

### 4. Data Source Configuration

```typescript
// VERIFY: Data source tests match current options
// Check src/features/eds/ for data source types

// Example: Data source types
type DataSourceType =
  | 'sharepoint'
  | 'gdrive'
  | 'custom';
// Verify all types exist
```

### 5. Validation Logic

```typescript
// VERIFY: Validation tests match current validators
// Check src/features/eds/ui/helpers/validationHelpers.ts

// Example: Repository URL validation
expect(isValidRepoUrl('https://github.com/owner/repo')).toBe(true);
expect(isValidRepoUrl('invalid')).toBe(false);
// Verify validation rules
```

### 6. Service Card Rendering

```typescript
// VERIFY: Service card tests match current props
// Check src/features/eds/ui/components/

// Example: GitHubServiceCard props
const props = {
  isAuthenticated: boolean,
  username: string | null,
  onConnect: () => void,
  // Verify all props
};
```

---

## Key Source Files to Reference

| Source File | Purpose |
|-------------|---------|
| `src/features/eds/types.ts` | Type definitions |
| `src/features/eds/ui/steps/` | Step components |
| `src/features/eds/ui/components/` | UI components |
| `src/features/eds/ui/hooks/` | React hooks |
| `src/features/eds/handlers/` | Handlers |
| `src/features/eds/README.md` | Feature documentation |

---

## Common Issues to Look For

### Issue 1: GitHub API Response Shape

```typescript
// OLD: Might use different response structure
const repo = response.data;

// CURRENT: Verify against actual GitHub API
const repo = {
  id: number,
  name: string,
  owner: { login: string },
  // Check actual structure
};
```

### Issue 2: Auth State Changes

```typescript
// OLD: Simple boolean
const isAuthenticated = true;

// CURRENT: May include token info
const authState = {
  isAuthenticated: true,
  token: '...',
  username: 'user',
};
```

### Issue 3: Data Source Field Names

```typescript
// OLD: Might use different names
const config = { source: 'sharepoint' };

// CURRENT: Verify field names
const config = { dataSource: 'sharepoint' };
```

### Issue 4: Repository Config Step Flow

```typescript
// OLD: Single step for all config
// CURRENT: May be split into multiple steps
// Verify step sequence matches current implementation
```

---

## Expected Outcomes

After auditing all 10 EDS test files:

- [ ] All EDS config tests match current types
- [ ] All GitHub auth tests match current OAuth flow
- [ ] All repository tests match current selection logic
- [ ] All data source tests match current options
- [ ] All validation tests match current validators
- [ ] No version references (v2/v3) remain

---

## Acceptance Criteria

- [ ] All 10 EDS test files reviewed
- [ ] Mock data matches current TypeScript interfaces
- [ ] GitHub auth flow matches current implementation
- [ ] Data source types match current options
- [ ] Validation rules match current validators
- [ ] All EDS tests pass
- [ ] No hardcoded values where constants exist
- [ ] No version-specific logic remains

---

## Notes

- EDS is a newer feature - tests may be more current
- GitHub API mocks should match actual API response shapes
- OAuth flow is security-sensitive - verify carefully
- Watch for integration with authentication feature

---

## Implementation Log

_To be filled during audit_

### Files Audited

_List files as they are completed_

### Issues Found

_Document any issues requiring follow-up_

### Mock Updates Made

_Track mock structure changes for cross-feature consistency_
