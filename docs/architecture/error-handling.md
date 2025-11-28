# Error Handling Architecture

> **Status:** Interim Documentation
> **Last Updated:** 2025-11-27
> **Related Plan:** `.rptc/plans/error-handling-standardization/overview.md`

## Overview

This document describes the current error handling patterns in the Adobe Demo Builder extension. The codebase currently uses **3 different error payload formats** across features, which creates friction for UI error handling.

## Logging Infrastructure

The extension uses a two-tier logging system:

### Backend (Extension Host)

Use `Logger` from `@/core/logging`:

```typescript
import { Logger } from '@/core/logging';

class MyService {
    private logger = new Logger('MyService');

    async process() {
        this.logger.info('Processing started');
        this.logger.debug('Debug details', { data });
        this.logger.error('Operation failed', error);
    }
}
```

### Frontend (Webview/Browser)

Use `webviewLogger` from `@/core/ui/utils/webviewLogger`:

```typescript
import { webviewLogger } from '@/core/ui/utils/webviewLogger';

const log = webviewLogger('MyComponent');

log.info('Component mounted');
log.debug('State updated', { count: 5 });
log.error('Failed to load data', error);  // Always logs, even in production
```

**Key Differences:**
- Backend Logger writes to VS Code output channels
- Frontend webviewLogger uses browser console (dev-only, except errors)
- Both provide consistent `[Context]` prefix formatting

## Current State: Three Error Payload Formats

### Format A: Components (Simple Response)

**Used by:** Component handlers (`src/features/components/handlers/`)

**Structure:**
```typescript
{
    success: false,
    error: string,        // Error message
    message: string       // User-friendly message
}
```

**Example:**
```typescript
return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error',
    message: 'Failed to load components',
};
```

**Handlers using this format:**
- `handleLoadComponents`
- `handleGetComponentsData`
- `handleCheckCompatibility`
- `handleLoadDependencies`
- `handleLoadPreset`
- `handleValidateSelection`

---

### Format B: Mesh (String Error)

**Used by:** API Mesh handlers (`src/features/mesh/handlers/`)

**Structure:**
```typescript
{
    success: false,
    error: string,           // Descriptive error message
    apiEnabled?: boolean,    // Feature-specific fields
    meshExists?: boolean
}
```

**Example:**
```typescript
return {
    success: false,
    apiEnabled: false,
    meshExists: false,
    error: `Invalid workspace ID: ${(validationError as Error).message}`,
};
```

**Handlers using this format:**
- `handleCheckApiMesh`
- `handleCreateApiMesh`

---

### Format C: Authentication (Structured Multi-Field)

**Used by:** Authentication handlers (`src/features/authentication/handlers/`)

**Structure:**
```typescript
{
    authenticated: boolean,
    isAuthenticated: boolean,
    isChecking: boolean,
    error: boolean | string,    // Can be true, 'timeout', or error message
    message: string,            // User-friendly title
    subMessage?: string,        // Additional context
    // ... authentication-specific fields
}
```

**Example (Connection error):**
```typescript
await context.sendMessage('auth-status', {
    authenticated: false,
    isAuthenticated: false,
    isChecking: false,
    error: true,
    message: 'Connection problem',
    subMessage: "Can't reach Adobe services. Check your internet connection and try again.",
});
```

**Example (Timeout):**
```typescript
await context.sendMessage('auth-status', {
    authenticated: false,
    isAuthenticated: false,
    isChecking: false,
    error: 'timeout',
    message: 'Sign-in timed out',
    subMessage: 'The browser window may have been closed. Please try again.',
});
```

**Message Types:**
- `'auth-status'` - Normal authentication state updates (includes errors)
- `'authError'` - Critical authentication failures

---

## Generic Type Definitions

### HandlerResponse (src/types/handlers.ts)
```typescript
export interface HandlerResponse {
    success: boolean;
    data?: unknown;
    error?: string;
    message?: string;
    [key: string]: unknown;
}
```

### MessageResponse (src/types/messages.ts)
```typescript
export interface MessageResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    [key: string]: unknown;
}
```

---

## UI Handling Requirements

### Format A & B (Components, Mesh)
- Check `success` field first
- If `success: false`, display `message` or `error` field
- No special error code parsing needed

### Format C (Authentication)
- Check for `error` field presence
- If `error === true` or `error === 'timeout'`, handle accordingly
- Display `message` as title, `subMessage` as details
- Update authentication state from `authenticated`/`isAuthenticated` fields

---

## Interim Recommendation

**For new code, use Format C (auth-style) pattern:**

1. Always include `success: boolean`
2. Use `message` for user-friendly title
3. Use `subMessage` for additional context
4. Use `error` for programmatic error identification
5. Include feature-specific state fields

**Example template:**
```typescript
await context.sendMessage('feature-status', {
    success: false,
    error: 'ERROR_CODE',           // Programmatic identifier
    message: 'User-Friendly Title',
    subMessage: 'Detailed explanation of what went wrong.',
    // Feature-specific fields...
});
```

---

## Known Issues

1. **Inconsistent error field types**: `error` can be `boolean`, `string`, or `undefined`
2. **Multiple message types**: Authentication uses both `'auth-status'` and `'authError'`
3. **No standard error codes**: Errors identified by string matching, not enumerated codes
4. **Missing unified interface**: No `ErrorPayload` type defined

---

## Future Consolidation (Phase C)

The step-12 plan proposes unifying to a single format:

```typescript
interface ErrorPayload {
    type: 'error';
    code: ErrorCode;           // Programmatic identifier (enum)
    title: string;             // User-friendly title
    message: string;           // User-friendly description
    technical?: string;        // Debug details (dev only)
    recoverable: boolean;      // Can user retry?
    retryAction?: string;      // Action to retry (if recoverable)
}
```

This consolidation is deferred until Phase A and B are complete, pending decision gate evaluation.

---

## Quick Reference

| Feature | Format | Error Type | Message Pattern |
|---------|--------|------------|-----------------|
| Components | A | `string` | `{ error, message }` |
| Mesh | B | `string` | `{ error }` |
| Authentication | C | `boolean \| string` | `{ error, message, subMessage }` |

---

## Related Files

- `src/types/handlers.ts` - Generic handler response types
- `src/types/messages.ts` - Message response types
- `src/features/authentication/handlers/authenticationHandlers.ts` - Format C reference
- `src/features/components/handlers/componentHandlers.ts` - Format A reference
- `src/features/mesh/handlers/checkHandler.ts` - Format B reference
