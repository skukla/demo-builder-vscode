# Research: API Mesh Deployment Timeout Handling

**Date:** 2024-12-04
**Scope:** Codebase + Web Research
**Depth:** Standard
**Purpose:** Implementation Planning

---

## Summary

The current implementation does **NOT** actually count "10 repetitions of building" - it polls up to 10 times (120 seconds total) and treats timeout as a **soft failure** that allows the user to continue. However, there's a critical misunderstanding: the mesh timeout is not currently deleting the project. The research reveals the existing behavior is more nuanced than initially described.

The missing piece is **retry capability** - users have no way to retry mesh deployment without restarting the wizard.

---

## Codebase Analysis

### Current Timeout Logic

**Location:** `src/features/mesh/handlers/createHandler.ts:162-284`

- **Max retries:** 10 attempts
- **Timing:** 20s initial wait + (10 × 10s polls) = ~120 seconds
- **Status handling:**
  - `deployed/active/success` → Exit with success
  - `failed/error` → Exit immediately with failure
  - `pending/building/provisioning` → Continue polling

### Key Finding: Timeout is NOT Treated as Failure

**Location:** `src/features/mesh/handlers/createHandler.ts:280-283`

```typescript
return {
    success: true,  // Don't block user - mesh was submitted successfully
    meshId: undefined,
    message: 'Mesh is still provisioning after ${totalWaitTime} seconds. ' +
             'This is unusual but not necessarily an error. ' +
             'You can continue - the mesh will be available once deployment completes.'
};
```

The current implementation already allows continuation on timeout!

### Status Categorization

**Location:** `src/features/mesh/utils/meshHelpers.ts:40-63`

```typescript
const DEPLOYED_STATUSES = ['active', 'deployed', 'success'];
const ERROR_STATUSES = ['failed', 'error'];
// Everything else → 'pending' (including 'building', 'provisioning', etc.)
```

### Project Deletion Logic

**Location:** `src/features/project-creation/handlers/createHandler.ts:164-189`

Project deletion only happens when:
1. `meshCreatedForWorkspace` is set AND `meshExistedBeforeSession` is false
2. A **hard error** occurs during creation (not timeout)

---

## Gap Analysis: Current vs Best Practice

| Aspect | Current | Best Practice |
|--------|---------|---------------|
| Timeout handling | Soft failure (allows continue) | ✅ Already correct |
| User feedback | Shows elapsed time during polling | ✅ Good |
| Retry after timeout | None - user must redeploy manually | ❌ Should offer retry |
| Distinction timeout vs error | Same polling loop | ⚠️ Could be clearer |
| Manual retry option | Not available | ❌ Should add |

---

## Implementation Options

### Option A: Auto-Retry with User Notification

**How it works:**
1. First attempt times out (120s)
2. Show notification: "Mesh deployment taking longer than expected. Retrying..."
3. Automatically retry (up to 2 additional attempts)
4. If all retries exhaust, show message with manual "Check Status" action

**Pros:**
- Transparent to user for quick recoveries
- Handles extended deployment times automatically
- Most cloud deployments recommend this pattern (AWS, Google)

**Cons:**
- User loses control during retries
- Could mask underlying issues
- May extend total wait time significantly

**Web research support:** AWS and Google recommend auto-retry with exponential backoff for cloud deployments.

### Option B: Manual Retry Button

**How it works:**
1. First attempt times out (120s)
2. Show message: "Mesh is still deploying. This can take 3+ minutes for new meshes."
3. Offer buttons: "Retry Deployment" | "Continue Without Mesh" | "Cancel"
4. User decides how to proceed

**Pros:**
- User retains control
- Clear communication of status
- Matches VS Code UX patterns

**Cons:**
- Requires user interaction
- May interrupt focused work
- User might not know best choice

**Web research support:** VS Code UX guidelines favor giving users control for operations >10 seconds.

### Option C: Hybrid - Progressive Control (Recommended)

**How it works:**
1. First timeout (120s): Auto-retry once silently
2. Second timeout (240s total): Show message with options
3. Options: "Keep Waiting (auto-retry)" | "Retry Manually" | "Continue & Check Later"

**Pros:**
- Balances automation with user control
- Handles most cases automatically (deploy usually completes <3 min)
- Gives explicit control for edge cases
- Aligns with Nielsen Norman Group recommendations

**Cons:**
- More complex implementation
- Multiple states to manage

---

## Relevant Files

### Mesh Status Checking
- `src/features/mesh/handlers/createHandler.ts:162-284` - Main polling loop
- `src/features/mesh/utils/meshHelpers.ts:40-63` - Status categorization
- `src/core/utils/timeoutConfig.ts:22-23` - Timeout constants

### Project Creation Integration
- `src/features/project-creation/handlers/executor.ts:294-376` - Mesh deployment in creation flow
- `src/features/project-creation/handlers/createHandler.ts:164-189` - Cleanup on failure

### User Messaging
- `src/features/project-creation/ui/steps/ProjectCreationStep.tsx:62` - "Up to 3 minutes" helper text
- `src/features/mesh/handlers/createHandler.ts:159-182` - Progress messages

### Existing Retry Patterns (reusable)
- `src/features/lifecycle/commands/deleteProject.ts:156-192` - Exponential backoff pattern
- `src/core/shell/pollingService.ts` - Generic polling utilities

---

## Web Research: Best Practices

### 1. Use Exponential Backoff with Jitter

**Sources:** AWS, Google Cloud, Microsoft Learn

**Recommended Values:**
- Initial delay: 1-2 seconds
- Multiplier: 2x (doubling)
- Maximum backoff cap: 32-64 seconds
- Jitter: Add random 0-1000ms to prevent synchronized retries

**Example:**
```typescript
const delay = Math.min(2000 * Math.pow(2, attempt) + Math.random() * 1000, 30000);
```

### 2. Distinguish Timeout from Failure

**Key Insight:** Client timeout ≠ Server failure

- **Client timeout:** Polling limit reached, operation may still be running
- **Server error:** Operation explicitly failed with error status

**Implementation:**
```typescript
if (result.timedOut) {
  // Don't treat as failure - mesh may still be deploying
  showWarning('Deployment may still be in progress');
} else if (result.status === 'error') {
  showError('Deployment failed: ' + result.error);
}
```

### 3. Progressive User Feedback

| Duration | Feedback |
|----------|----------|
| 0-5s | "Deploying API Mesh..." |
| 5-30s | "Deploying... (Xs elapsed)" |
| 30s-2m | "Still deploying... Check status later if needed" |
| 2m+ | "Taking longer than expected. Deployment may still complete." |

### 4. Adobe API Mesh Specifics

**From Adobe Documentation:**
- Deployments typically complete in 1-3 minutes
- Status states: `pending` → `building` → `provisioning` → `success/error`
- Edge mesh propagates to 330+ locations globally
- `aio api-mesh:update` is idempotent (safe to retry)

---

## Common Pitfalls to Avoid

1. **Treating client timeout as server failure** - The mesh may still be deploying
2. **Aggressive retry without backoff** - Could overwhelm Adobe's API
3. **No feedback during long waits** - Users assume the app is frozen
4. **Retrying non-idempotent operations** - `aio api-mesh:update` is safe (idempotent)
5. **Synchronized retry storms** - Always add jitter to retry delays

---

## Recommended Timing Values

| Parameter | Current | Recommended |
|-----------|---------|-------------|
| Initial wait | 20s | 20s (keep) |
| Poll interval | 10s | 5-10s (keep) |
| Max poll time | 120s | 180s (increase) |
| Retry attempts after timeout | 0 | 1-2 |
| Backoff multiplier | N/A | 1.5x per retry |

---

## Key Takeaways

1. **The current implementation is better than described** - timeout already returns `success: true` and allows continuation
2. **The missing piece is retry capability** - user has no way to retry mesh deployment without restarting wizard
3. **Option C (progressive control)** offers the best balance for VS Code extension UX
4. **Adobe mesh deployments typically complete in 1-3 minutes** - 120s timeout may be too aggressive

---

## Sources

### Industry/Official
- AWS Builders Library - Timeouts, Retries, and Backoff with Jitter
- Microsoft Learn - Retry Pattern, Circuit Breaker Pattern
- Google Cloud - Exponential Backoff, Retry Strategy
- Adobe - API Mesh Command Reference, I/O Runtime Documentation
- VS Code - API Reference, UX Guidelines

### UX/Research
- Nielsen Norman Group - Progress Indicators, Error Message Guidelines
- Smashing Magazine - Designing Better Error Messages

### Community
- Better Stack - Mastering Exponential Backoff
- GeeksforGeeks - Circuit Breaker vs Retry Pattern
