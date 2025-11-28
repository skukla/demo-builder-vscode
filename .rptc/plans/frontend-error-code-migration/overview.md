# Phase E: Frontend Error Code Migration

## Status: PLANNED
**Created:** 2025-11-28
**Estimated Effort:** 2-3 days
**Priority:** Medium (improves UX, not blocking)

---

## Overview

**Problem:** Frontend uses string-based error detection (`error === 'timeout'`) instead of programmatic error codes. This is brittle and doesn't leverage the typed error infrastructure already in place in the backend.

**Solution:** Update frontend hooks and components to extract and use the `code` field from backend responses.

**Backend Status:** ✅ COMPLETE - All handlers return `code: ErrorCode` in error responses.

---

## Current State (Anti-Pattern)

```typescript
// Frontend currently uses string matching
if (authData.error === 'timeout') {
    setAuthTimeout(true);
}

if (adobeAuth.error === 'no_app_builder_access') {
    // Show specific UI
}
```

## Target State

```typescript
// Frontend should use typed error codes
import { ErrorCode } from '@/types/errorCodes';

if (response.code === ErrorCode.TIMEOUT) {
    setAuthTimeout(true);
}

if (response.code === ErrorCode.AUTH_NO_APP_BUILDER) {
    // Show specific UI
}
```

---

## Implementation Steps

### Step 1: Type Definition Updates (30 min)

**File:** `src/types/webview.ts`

Add `code?: ErrorCode` to:
- `AdobeAuthState` interface
- `WizardState.apiMesh` field

**File:** Response interfaces in hooks
- Add `code?: ErrorCode` to response type definitions

---

### Step 2: Hook Updates (3-4 hours)

**2.1: useAuthStatus.ts (MEDIUM)**
- Add `code?: ErrorCode` to `AuthStatusData` interface
- Extract and store `code` from backend response
- Replace `error === 'timeout'` with `code === ErrorCode.TIMEOUT`
- Return `code` to consuming components

**2.2: useSelectionStep.ts (LARGE)**
- Change `error: string | null` to `error: { message?: string; code?: ErrorCode } | null`
- Extract both `error` and `code` from backend response
- Update all usages (ProjectStep, WorkspaceStep)

**2.3: useMeshOperations.ts (LARGE)**
- Add `code?: ErrorCode` to `CheckApiMeshResponse` and `CreateApiMeshResponse`
- Extract and store `code` from response
- Pass `code` to MeshErrorDialog

**2.4: useComponentConfig.ts (MEDIUM)**
- Extract and store `code` field from responses
- Return to consuming components

---

### Step 3: Component Updates (2-3 hours)

**3.1: AuthErrorState.tsx**
- Add `code?: ErrorCode` prop
- Use for conditional rendering (different messages per error type)

**3.2: MeshErrorDialog.tsx**
- Add `code?: ErrorCode` prop
- Customize recovery instructions based on error code

**3.3: SelectionStepContent.tsx**
- Accept and display `code` from useSelectionStep

**3.4: ErrorDisplay.tsx (optional)**
- Add optional `code?: ErrorCode` prop for future use

**3.5: StatusDisplay.tsx (optional)**
- Add optional `code?: ErrorCode` prop for future use

---

### Step 4: Remove String Checks (30 min)

Search and replace string-based error checks:
- `authData.error === 'timeout'` → `authData.code === ErrorCode.TIMEOUT`
- `adobeAuth.error === 'no_app_builder_access'` → `adobeAuth.code === ErrorCode.AUTH_NO_APP_BUILDER`

---

### Step 5: Test Updates (1-2 hours)

- Update mock responses to include `code` field
- Add assertions for error code handling
- Test each error path with proper code values

---

## File Summary

| File | Change Type | Effort | Priority |
|------|-------------|--------|----------|
| `types/webview.ts` | Add code field | SMALL | HIGH |
| `useAuthStatus.ts` | Extract & use code | MEDIUM | HIGH |
| `useSelectionStep.ts` | Redesign state | LARGE | HIGH |
| `useMeshOperations.ts` | Extract & use code | LARGE | HIGH |
| `useComponentConfig.ts` | Extract code | MEDIUM | MEDIUM |
| `AuthErrorState.tsx` | Accept code prop | SMALL | MEDIUM |
| `MeshErrorDialog.tsx` | Accept code prop | SMALL | MEDIUM |
| `SelectionStepContent.tsx` | Pass through code | SMALL | MEDIUM |
| `ErrorDisplay.tsx` | Optional enhancement | SMALL | LOW |
| `StatusDisplay.tsx` | Optional enhancement | SMALL | LOW |

---

## Benefits

1. **Type safety** - TypeScript validates error codes
2. **Refactoring safety** - Renaming codes caught at compile time
3. **Consistency** - Same error codes used in backend and frontend
4. **Smart UX** - Different error handling per error type:
   - `TIMEOUT` → "Please try again"
   - `NETWORK` → "Check your connection"
   - `AUTH_REQUIRED` → "Please sign in"
   - `AUTH_NO_APP_BUILDER` → "Contact administrator for access"

---

## Success Criteria

- [ ] No string-based error checks in frontend code
- [ ] All hooks extract and expose `code` field
- [ ] Error components receive and can use `code` prop
- [ ] Tests verify code-based error handling
- [ ] Documentation updated with frontend patterns

---

## Dependencies

- ✅ Backend handlers return `code` field (COMPLETE)
- ✅ `ErrorCode` enum defined (COMPLETE)
- ✅ `SimpleResult` type has `code` field (COMPLETE)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing error display | Low | Medium | Gradual migration, preserve string fallback |
| Type definition conflicts | Low | Low | Single PR for type changes |
| Test failures | Medium | Low | Update tests alongside code |

---

## Related Documentation

- `docs/architecture/error-handling.md` - Phase E section
- `src/types/errorCodes.ts` - Error code definitions
- `src/types/errors.ts` - Typed error classes
