# Error Handling Architecture

> **Status:** Active Documentation
> **Last Updated:** 2025-11-28
> **Phase:** D - Status Quo with Documentation

## Overview

This document describes the error handling patterns in the Adobe Demo Builder extension. The codebase uses **typed error infrastructure** with `ErrorCode` enum for programmatic error handling, while maintaining **backward-compatible payload formats** for gradual migration.

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

---

## Typed Error Infrastructure

### Error Classes (`src/types/errors.ts`)

The codebase provides typed error classes for programmatic error handling:

```typescript
import { AppError, TimeoutError, NetworkError, toAppError, isTimeout, isNetwork } from '@/types/errors';
import { ErrorCode } from '@/types/errorCodes';

// Convert unknown error to typed AppError
const appError = toAppError(error);

// Type guards for specific error types
if (isTimeout(appError)) {
    // Handle timeout specifically
}

if (isNetwork(appError)) {
    // Handle network error specifically
}

// Access error properties
appError.code;        // ErrorCode enum value (e.g., 'TIMEOUT')
appError.message;     // Technical error message
appError.userMessage; // User-friendly message
```

### Error Codes (`src/types/errorCodes.ts`)

```typescript
export enum ErrorCode {
    UNKNOWN = 'UNKNOWN',
    TIMEOUT = 'TIMEOUT',
    NETWORK = 'NETWORK',
    AUTH_REQUIRED = 'AUTH_REQUIRED',
    CANCELLED = 'CANCELLED',
    VALIDATION = 'VALIDATION',
    NOT_FOUND = 'NOT_FOUND',
    // ... additional codes
}
```

### Usage in Handlers

Handlers should use typed errors for consistent error detection:

```typescript
import { toAppError, isTimeout } from '@/types/errors';

export async function handleGetProjects(context: HandlerContext) {
    try {
        const projects = await fetchProjects();
        return { success: true, data: projects };
    } catch (error) {
        const appError = toAppError(error);

        // Use type guards instead of string matching
        const errorMessage = isTimeout(appError)
            ? appError.userMessage
            : 'Failed to load projects. Please try again.';

        return {
            success: false,
            error: errorMessage,
            code: appError.code,  // Include code for programmatic handling
        };
    }
}
```

### Benefits of Typed Errors

1. **No String Matching**: Use `isTimeout()` instead of `error.message.includes('timed out')`
2. **Consistent Messages**: `appError.userMessage` provides user-friendly text
3. **Programmatic Handling**: Frontend can switch on `code` field
4. **Type Safety**: TypeScript knows error properties exist

---

## Current State: Three Error Payload Formats

### Format A: Components (Simple Response + Code)

**Used by:** Component handlers (`src/features/components/handlers/`)

**Structure:**
```typescript
{
    success: false,
    error: string,        // User-friendly error message
    message: string,      // Context message
    code: ErrorCode       // Programmatic error code (NEW)
}
```

**Example:**
```typescript
const appError = toAppError(error);
return {
    success: false,
    error: appError.userMessage,
    code: appError.code,
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

## Migration Strategy (Phase D)

The codebase now uses typed errors internally. Migration to consistent payloads happens **gradually** as files are touched.

### For New Code

**Always include `code` field in error responses:**

```typescript
import { toAppError } from '@/types/errors';

// In catch block
const appError = toAppError(error);
return {
    success: false,
    error: appError.userMessage,
    code: appError.code,  // Always include this
    // ... other fields as needed
};
```

### For Existing Code

When modifying existing handlers, add the `code` field:

**Before:**
```typescript
return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error',
};
```

**After:**
```typescript
const appError = toAppError(error);
return {
    success: false,
    error: appError.userMessage,
    code: appError.code,
};
```

### Frontend Handling

Frontend code can now use the `code` field for programmatic handling:

```typescript
// Handle response
if (!response.success) {
    switch (response.code) {
        case 'TIMEOUT':
            // Show retry button with longer timeout
            break;
        case 'NETWORK':
            // Show offline indicator
            break;
        case 'AUTH_REQUIRED':
            // Redirect to login
            break;
        default:
            // Show generic error
    }
}
```

### Future Consolidation

Once all handlers include `code` field, consider unifying to:

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

This is **not required** for current development. The `code` field provides sufficient programmatic handling capability.

---

## Quick Reference

| Feature | Format | Error Type | Message Pattern | Has `code`? |
|---------|--------|------------|-----------------|-------------|
| Components | A | `string` | `{ error, message, code }` | ✅ Yes |
| Project/Workspace | B | `string` | `{ error, code }` | ✅ Yes |
| Mesh | B | `string` | `{ error }` | ❌ Not yet |
| Authentication | C | `boolean \| string` | `{ error, message, subMessage }` | ❌ Not yet |

### Handlers with `code` Field (Migrated)

- `handleGetProjects` - `code: 'TIMEOUT' | 'UNKNOWN'`
- `handleGetWorkspaces` - `code: 'TIMEOUT' | 'UNKNOWN'`
- `handleLoadComponents` - `code: ErrorCode`
- `handleGetComponentsData` - `code: ErrorCode`
- `handleCheckCompatibility` - `code: ErrorCode`
- `createHandler` (project creation) - `code: 'TIMEOUT' | 'UNKNOWN'`

---

## Related Files

- `src/types/handlers.ts` - Generic handler response types
- `src/types/messages.ts` - Message response types
- `src/features/authentication/handlers/authenticationHandlers.ts` - Format C reference
- `src/features/components/handlers/componentHandlers.ts` - Format A reference
- `src/features/mesh/handlers/checkHandler.ts` - Format B reference
