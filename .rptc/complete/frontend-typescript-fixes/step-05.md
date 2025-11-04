# Step 5: Fix Unknown Type Assertions

## Objective

Add proper type guards and assertions for message handlers that receive `unknown` data, resolving **43 errors** across multiple files.

## Errors Addressed

### WebviewApp.tsx (5 errors):
- Lines 82-85: `data` is of type `unknown` in init message handler
- Lines 101-103: `data` is of type `unknown` in theme-changed handler

### WizardContainer.tsx (8 errors):
- Lines 232-233: `result` is of type `unknown` in request response
- Lines 241-242: `result` is of type `unknown` in another request response

### AdobeAuthStep.tsx (4 errors):
- Lines 51-52, 61, 70: `data` is of type `unknown` in message handlers

### ProjectDashboardScreen.tsx (4 errors):
- Lines 60, 65: Callback data types incompatible with `unknown`

### WebviewClient.ts (4 errors):
- Lines 96, 214: Property access on `unknown` types

### ConfigureScreen.tsx (18 errors):
- Lines 171 (×2), 546-549, 627, 633: `unknown` type issues

## Root Cause Analysis

**Problem**: VS Code message handlers receive data as `unknown` type (safest assumption), but the code treats them as specific types without proper type guards or assertions.

```typescript
// Example pattern:
webviewClient.onMessage('init', (data) => {
    setTheme(data.theme);  // ❌ Error: data is unknown
    //       ^^^^ Property 'theme' does not exist on type 'unknown'
});
```

**Why `unknown`**:
- Messages come from extension (different context)
- No compile-time guarantee of message shape
- TypeScript correctly enforces runtime validation

**Solutions**:
1. **Type assertion** (quick, less safe): `(data as InitData).theme`
2. **Type guard** (safer): Validate structure before use
3. **Generic typing** (cleanest): Type the message handler

## Implementation Strategy

### Preferred Approach: Generic Typing + Validation

```typescript
// Define message payload types
interface InitMessage {
    theme: 'light' | 'dark';
    // ... other init data
}

interface ThemeChangedMessage {
    theme: 'light' | 'dark';
}

// Type the message handler
webviewClient.onMessage<InitMessage>('init', (data) => {
    // data is now typed as InitMessage
    setTheme(data.theme);
});
```

**If WebviewClient doesn't support generics**, use type guards:

```typescript
function isInitMessage(data: unknown): data is InitMessage {
    return (
        typeof data === 'object' &&
        data !== null &&
        'theme' in data &&
        (data.theme === 'light' || data.theme === 'dark')
    );
}

webviewClient.onMessage('init', (data) => {
    if (isInitMessage(data)) {
        setTheme(data.theme);  // ✅ Type-safe
    }
});
```

**Quick fix (least safe)**: Type assertion

```typescript
webviewClient.onMessage('init', (data) => {
    const initData = data as InitMessage;
    setTheme(initData.theme);
});
```

## Detailed Implementation

### File 1: Define Message Type Interfaces

**Create**: `webview-ui/src/shared/types/messages.ts`

```typescript
/**
 * Message payload types for extension ↔ webview communication
 */

export interface InitMessage {
    theme: 'light' | 'dark';
    // Add other init data fields as discovered
}

export interface ThemeChangedMessage {
    theme: 'light' | 'dark';
}

export interface ProjectStatusMessage {
    status: 'running' | 'stopped' | 'error';
    message?: string;
    endpoint?: string;
}

export interface FeedbackMessage {
    step: string;
    status: 'start' | 'progress' | 'complete' | 'error' | 'warning';
    primary: string;
    secondary?: string;
    progress?: number;
    log?: string;
    error?: string;
    canRetry?: boolean;
}

// Add other message types as needed
```

### File 2: Fix WebviewApp.tsx (5 errors)

```typescript
// BEFORE (lines 81-86):
const unsubscribeInit = webviewClient.onMessage('init', (data) => {
    if (data.theme) {  // ❌ Error: data is unknown
        setTheme(data.theme);
        document.body.classList.remove('vscode-light', 'vscode-dark');
        document.body.classList.add(data.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
    }
    // ...
});

// AFTER:
import type { InitMessage, ThemeChangedMessage } from '../types/messages';

const unsubscribeInit = webviewClient.onMessage('init', (data) => {
    const initData = data as InitMessage;  // Type assertion
    if (initData.theme) {
        setTheme(initData.theme);
        document.body.classList.remove('vscode-light', 'vscode-dark');
        document.body.classList.add(initData.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
    }
    // ...
});

// Fix theme-changed handler similarly (lines 100-104)
const unsubscribeTheme = webviewClient.onMessage('theme-changed', (data) => {
    const themeData = data as ThemeChangedMessage;
    setTheme(themeData.theme);
    document.body.classList.remove('vscode-light', 'vscode-dark');
    document.body.classList.add(themeData.theme === 'dark' ? 'vscode-dark' : 'vscode-light');
});
```

### File 3: Fix WizardContainer.tsx (8 errors)

```typescript
// Lines 232-233, 241-242 - Request results

// BEFORE:
const result = await webviewClient.request('verify-adobe-project');
if (result.success) {  // ❌ Error: result is unknown
    // ...
}

// AFTER:
interface VerifyProjectResult {
    success: boolean;
    error?: string;
    // ... other fields
}

const result = await webviewClient.request('verify-adobe-project') as VerifyProjectResult;
if (result.success) {
    // ...
}
```

**Better approach** - Type the request method:

```typescript
// If WebviewClient.request supports generics:
const result = await webviewClient.request<VerifyProjectResult>('verify-adobe-project');
if (result.success) {  // ✅ Type-safe
    // ...
}
```

### File 4: Fix AdobeAuthStep.tsx (4 errors)

```typescript
// Lines 51-52, 61, 70 - Auth message handlers

// BEFORE:
webviewClient.onMessage('auth-check-complete', (data) => {
    setAuthState(prevState => ({  // ❌ Error: data is unknown
        ...prevState,
        isChecking: false,
        isAuthenticated: data.isAuthenticated,  // unknown
        email: data.email  // unknown
    }));
});

// AFTER:
interface AuthCheckCompleteMessage {
    isAuthenticated: boolean;
    email?: string;
    error?: string;
}

webviewClient.onMessage('auth-check-complete', (data) => {
    const authData = data as AuthCheckCompleteMessage;
    setAuthState(prevState => ({
        ...prevState,
        isChecking: false,
        isAuthenticated: authData.isAuthenticated,
        email: authData.email
    }));
});
```

### File 5: Fix ProjectDashboardScreen.tsx (4 errors)

```typescript
// Lines 60, 65 - useVSCodeMessage type incompatibility

// BEFORE:
useVSCodeMessage('project-status-update', (data: ProjectStatus) => {
//                                         ^^^^^^^^^^^^^^^^^^^^ Type incompatible with unknown
    setProjectStatus(data);
});

// AFTER - Option 1: Remove explicit type, use assertion inside
useVSCodeMessage('project-status-update', (data) => {
    const status = data as ProjectStatus;
    setProjectStatus(status);
});

// AFTER - Option 2: Fix useVSCodeMessage to support generics
// (Requires modifying the hook definition)
useVSCodeMessage<ProjectStatus>('project-status-update', (data) => {
    setProjectStatus(data);  // data is now ProjectStatus
});
```

### File 6: Fix WebviewClient.ts (4 errors)

```typescript
// Lines 96 - Timeout hint message payload

// BEFORE (lines 95-96):
if (message.type === '__timeout_hint__' && message.payload) {
    const { requestId, timeout: newTimeout } = message.payload;
    //      ^^^^^^^^^ Property 'requestId' does not exist on type '{}'
}

// AFTER:
interface TimeoutHintPayload {
    requestId: string;
    timeout: number;
}

if (message.type === '__timeout_hint__' && message.payload) {
    const { requestId, timeout: newTimeout } = message.payload as TimeoutHintPayload;
}

// Line 214 - Pending request resolve typing
// BEFORE:
pending.resolve(message.payload);
// resolve expects T, but payload is unknown

// AFTER: Cast to T (generic type)
pending.resolve(message.payload as T);
// Or better: Update resolve signature to accept unknown and let caller cast
```

### File 7: Fix ConfigureScreen.tsx (18 errors)

```typescript
// Lines 171, 546-549, 627, 633 - Various unknown type issues

// Pattern: Same as above, add type assertions where data/result is used

// Example (line 171):
// BEFORE:
const instance = await getComponentInstance(componentId);
if (instance.deployed) {  // ❌ instance is unknown
    // ...
}

// AFTER:
const instance = await getComponentInstance(componentId) as ComponentInstance;
if (instance.deployed) {
    // ...
}
```

## Test Strategy

### Pre-Implementation Test
```bash
# Count unknown type errors
npm run compile:webview 2>&1 | grep "is of type 'unknown'" | wc -l
# Expected: 43 errors
```

### Post-Implementation Test
```bash
# Test: TypeScript compilation
npm run compile:webview

# Expected: 43 fewer errors
# Verify: No unknown type errors in affected files
```

### Manual Functional Testing
Since message handling is critical, test each affected screen:

1. **WebviewApp**: Verify theme switching works
2. **WizardContainer**: Run through wizard, verify all steps
3. **AdobeAuthStep**: Test authentication flow
4. **ProjectDashboardScreen**: Check project status updates
5. **ConfigureScreen**: Test configuration UI

## Acceptance Criteria

- [ ] All message payload types defined in `messages.ts`
- [ ] All message handlers use proper type assertions or guards
- [ ] TypeScript error count reduced by 43
- [ ] No NEW errors introduced
- [ ] All affected webviews function correctly (manual test)
- [ ] Type assertions documented where runtime validation isn't feasible

## Estimated Time

**30 minutes** (multiple files, need to define message types)

## Risk Level

**Medium** - Type assertions without runtime validation can mask bugs if message shapes change. Recommend adding runtime validation in critical paths.

## Dependencies

- **Depends on**: Steps 1-4 (clean foundation for type fixes)
- **Blocks**: None (but improves safety for remaining fixes)

## Notes

- **Type Assertion vs Type Guard**: Use assertions for trusted sources (our own extension), guards for untrusted external data
- **Consider**: Adding a message validation layer in WebviewClient for production safety
- **Future Enhancement**: Generate message types from backend message definitions for single source of truth
