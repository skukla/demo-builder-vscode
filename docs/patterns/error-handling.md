# Error Handling Patterns

## Overview

This document describes error handling and formatting patterns used throughout the Adobe Demo Builder extension.

## When to Use Each Formatter

### Mesh Errors

**File**: `src/features/mesh/utils/errorFormatter.ts`
**Use for**: Adobe CLI errors with arrow separators
**Returns**: `string` with newlines for display
**Pattern**: Functional approach with helper functions

**Example**:
```typescript
import { formatMeshDeploymentError, formatAdobeCliError } from '@/features/mesh/utils/errorFormatter';

// Mesh deployment error
const formatted = formatMeshDeploymentError(error);
// Output: "Failed to deploy Adobe Commerce API Mesh:\nError details here"

// Generic Adobe CLI error
const formatted = formatAdobeCliError(error);
// Input:  "Error › Config invalid › missing field"
// Output: "Error\nConfig invalid\nmissing field"
```

**When to use**:
- Adobe I/O CLI errors (mesh deployment, project creation)
- Errors with arrow separators (›)
- Simple string-based error display
- CLI output needs to be displayed in UI

### Authentication Errors

**File**: `src/features/authentication/services/authenticationErrorFormatter.ts`
**Use for**: User-facing auth errors needing categorization
**Returns**: `{title: string; message: string; technical: string}`
**Pattern**: Static class with categorization logic

**Example**:
```typescript
import { AuthenticationErrorFormatter } from '@/features/authentication/services/authenticationErrorFormatter';

const formatted = AuthenticationErrorFormatter.formatError(error, {
    operation: 'login',
    timeout: 5000
});
// {
//   title: "Operation Timed Out",
//   message: "Login timed out after 5000ms. Please try again.",
//   technical: "Operation: login\nError: ...\nStack: ..."
// }
```

**Error Categories**:
- **Timeout**: Operation exceeded time limit
- **Network**: Connection/DNS errors (ENOTFOUND, network issues)
- **Auth**: Authentication/authorization failures
- **Generic**: Uncategorized errors (fallback)

**When to use**:
- User-facing authentication errors
- Errors requiring structured output (title, message, technical)
- Timeout, network, and auth failure errors
- When you need separate user-friendly and technical messages

### Generic Errors

**File**: `src/types/typeGuards.ts`
**Function**: `toError(value: unknown): Error`
**Use for**: Simple error conversions
**Returns**: `Error` object

**Example**:
```typescript
import { toError } from '@/types/typeGuards';

const error = toError(unknownValue);
// Converts string, Error, or unknown to Error object
```

**When to use**:
- Converting unknown values to Error objects
- Ensuring consistent Error type handling
- When you don't need special formatting

## Error Handling Best Practices

### 1. Catch and Format at UI Boundaries

```typescript
try {
    await deployMesh(config);
} catch (error) {
    const formatted = formatMeshDeploymentError(error);
    vscode.window.showErrorMessage(formatted);
    logger.error('Mesh deployment failed', error);
}
```

### 2. Preserve Error Context

```typescript
// ✅ Good: Preserve original error
const formatted = AuthenticationErrorFormatter.formatError(error, {
    operation: 'token refresh',
    timeout: 5000
});
logger.error('Token refresh failed', { formatted, originalError: error });

// ❌ Bad: Lose original error
throw new Error('Token refresh failed');
```

### 3. Use Appropriate Formatter for Context

```typescript
// ✅ Good: Use structured auth formatter for UI
const { title, message } = AuthenticationErrorFormatter.formatError(error, {
    operation: 'login'
});
showErrorDialog(title, message);

// ✅ Good: Use simple mesh formatter for CLI errors
const formatted = formatAdobeCliError(cliError);
outputChannel.appendLine(formatted);
```

### 4. Log Technical Details Separately

```typescript
const formatted = AuthenticationErrorFormatter.formatError(error, {
    operation: 'login'
});

// Show user-friendly message
vscode.window.showErrorMessage(formatted.message);

// Log technical details
logger.error('Authentication failed', {
    title: formatted.title,
    technical: formatted.technical
});
```

## Common Error Patterns

### Pattern 1: CLI Command Errors

```typescript
import { formatAdobeCliError } from '@/features/mesh/utils/errorFormatter';

try {
    const result = await executeCommand('aio', ['mesh:deploy']);
} catch (error) {
    const formatted = formatAdobeCliError(error);
    // Handles: "Error › Config › missing › ADOBE_CATALOG_ENDPOINT"
    // Converts to: "Error\nConfig\nmissing\nADOBE_CATALOG_ENDPOINT"
}
```

### Pattern 2: Timeout Handling

```typescript
import { AuthenticationErrorFormatter } from '@/features/authentication/services/authenticationErrorFormatter';

try {
    await withTimeout(operation(), TIMEOUT.AUTH);
} catch (error) {
    const formatted = AuthenticationErrorFormatter.formatError(error, {
        operation: 'login',
        timeout: TIMEOUT.AUTH
    });
    // Categorizes as timeout error with helpful message
}
```

### Pattern 3: Network Error Handling

```typescript
import { AuthenticationErrorFormatter } from '@/features/authentication/services/authenticationErrorFormatter';

try {
    await fetch(apiUrl);
} catch (error) {
    const formatted = AuthenticationErrorFormatter.formatError(error, {
        operation: 'API call'
    });
    // Detects ENOTFOUND, network errors
    // Provides user-friendly "No internet connection" message
}
```

## Error Formatter Decision Tree

```
Is it an Adobe CLI error with arrows (›)?
  └─ YES → Use formatAdobeCliError()

Is it an authentication/network/timeout error?
  └─ YES → Use AuthenticationErrorFormatter.formatError()

Do you need structured output (title, message, technical)?
  └─ YES → Use AuthenticationErrorFormatter.formatError()

Just need to ensure it's an Error object?
  └─ YES → Use toError()

Need custom error handling?
  └─ Implement feature-specific formatter
```

## Migration Notes

**Previous Approach**: Generic `ErrorFormatter` class in `@/core/errors`
- **Status**: REMOVED (unused, 0 production imports)
- **Reason**: Domain-specific formatters better serve actual use cases

**Current Approach**: Domain-specific formatters
- **Mesh**: Functional formatters for CLI errors
- **Auth**: Static class for structured error categorization
- **Result**: Better type safety, clearer usage patterns

## Adding New Error Formatters

**When to create a new formatter**:
1. Existing formatters don't fit your use case
2. You have domain-specific error patterns (not just one-off errors)
3. You need specialized error categorization

**Where to add**:
- Feature-specific: `src/features/[feature]/utils/errorFormatter.ts`
- Cross-cutting: Consider if existing formatters can be extended first

**Pattern to follow**:
```typescript
/**
 * Error Formatting for [Your Domain]
 *
 * [Description of what errors this handles]
 *
 * **Use this formatter for:**
 * - [Use case 1]
 * - [Use case 2]
 *
 * **Returns**: [Return type and structure]
 *
 * **See also**: [Related formatters]
 */
export function formatYourError(error: Error | string): string {
    const errorMessage = toError(error).message;
    // Your formatting logic
    return formatted;
}
```

## See Also

- Mesh Error Formatter: `src/features/mesh/utils/errorFormatter.ts`
- Auth Error Formatter: `src/features/authentication/services/authenticationErrorFormatter.ts`
- Type Guards: `src/types/typeGuards.ts`
- Logging: `docs/systems/logging-system.md`
