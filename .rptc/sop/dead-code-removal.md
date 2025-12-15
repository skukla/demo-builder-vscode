# Dead Code & Duplicate Code Removal - Project-Specific SOP

**Version**: 1.0.0
**Last Updated**: 2025-01-14
**Priority**: Project-specific

---

## Overview

This SOP defines patterns for identifying and removing dead code, unused exports, duplicate logic, and redundant implementations. Regular cleanup prevents codebase bloat, reduces cognitive load, and improves maintainability.

---

## 1. Types of Dead Code

### 1.1 Unreachable Code

Code that can never execute due to control flow.

```typescript
// ❌ Unreachable code after return
function processData(data: Data) {
    if (!data) {
        return null;
    }
    return data;
    console.log('Processing complete'); // DEAD: Never executes
}

// ❌ Unreachable code due to constant condition
const DEBUG = false;
if (DEBUG) {
    console.log('Debug mode'); // DEAD: DEBUG is always false
}

// ❌ Unreachable catch (TypeScript knows this can't throw)
try {
    const x = 1 + 1;
} catch (e) {
    console.error(e); // DEAD: Arithmetic can't throw
}
```

### 1.2 Unused Variables & Imports

```typescript
// ❌ Unused imports
import { useState, useEffect, useCallback } from 'react'; // useCallback unused
import { Button, TextField, Checkbox } from '@adobe/react-spectrum'; // Checkbox unused

// ❌ Unused variables
function Component({ data }: Props) {
    const unusedValue = computeExpensiveValue(data); // DEAD: Never used
    const [count, setCount] = useState(0); // setCount never called

    return <div>{data.name}</div>;
}
```

### 1.3 Unused Exports

```typescript
// ❌ Exported but never imported anywhere
export function deprecatedHelper() { ... } // DEAD: No imports found
export const LEGACY_CONSTANT = 'old'; // DEAD: No imports found
export interface OldInterface { ... } // DEAD: No imports found
```

### 1.4 Commented-Out Code

```typescript
// ❌ Commented code blocks
function handleSubmit() {
    // Old implementation:
    // const result = await legacyApi.submit(data);
    // if (result.error) {
    //     showError(result.error);
    //     return;
    // }

    const result = await newApi.submit(data);
    // ...
}
```

### 1.5 Unused Function Parameters

```typescript
// ❌ Unused parameters
function formatUser(user: User, options: Options, context: Context) { // context unused
    return `${user.name} - ${options.format}`;
}

// ❌ Unused destructured properties
function Component({ name, age, email, phone }: UserProps) { // phone unused
    return <div>{name}, {age}, {email}</div>;
}
```

---

## 2. Types of Duplicate Code

### 2.1 Exact Duplicates

Identical code blocks appearing multiple times.

```typescript
// ❌ Exact duplicate functions
// In fileA.ts
function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

// In fileB.ts (exact copy)
function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}
```

### 2.2 Near Duplicates

Similar code with minor variations.

```typescript
// ❌ Near duplicate - only string literals differ
function showSuccessToast() {
    toast.show({ type: 'success', message: 'Operation successful', duration: 3000 });
}

function showErrorToast() {
    toast.show({ type: 'error', message: 'Operation failed', duration: 3000 });
}

function showWarningToast() {
    toast.show({ type: 'warning', message: 'Please check input', duration: 3000 });
}

// ✅ Consolidated
function showToast(type: ToastType, message: string) {
    toast.show({ type, message, duration: 3000 });
}
```

### 2.3 Structural Duplicates

Same logic structure with different data.

```typescript
// ❌ Structural duplicate - same pattern, different fields
function validateEmail(email: string): boolean {
    if (!email) return false;
    if (email.length > 255) return false;
    if (!EMAIL_REGEX.test(email)) return false;
    return true;
}

function validatePhone(phone: string): boolean {
    if (!phone) return false;
    if (phone.length > 20) return false;
    if (!PHONE_REGEX.test(phone)) return false;
    return true;
}

// ✅ Consolidated
interface ValidationRule {
    maxLength: number;
    pattern: RegExp;
}

function validateField(value: string, rule: ValidationRule): boolean {
    if (!value) return false;
    if (value.length > rule.maxLength) return false;
    if (!rule.pattern.test(value)) return false;
    return true;
}
```

### 2.4 Copy-Paste Remnants

Code copied and partially modified, leaving redundant parts.

```typescript
// ❌ Copy-paste remnant with outdated variable names
function processNewUser(user: User) {
    const oldUser = user; // Renamed from old code, now confusing
    // ... rest uses 'oldUser' instead of 'user'
}
```

---

## 3. Detection Patterns

### 3.1 TypeScript/ESLint Detection

```json
// tsconfig.json
{
    "compilerOptions": {
        "noUnusedLocals": true,
        "noUnusedParameters": true
    }
}

// .eslintrc.json
{
    "rules": {
        "no-unused-vars": "error",
        "@typescript-eslint/no-unused-vars": ["error", {
            "argsIgnorePattern": "^_",
            "varsIgnorePattern": "^_"
        }],
        "no-unreachable": "error",
        "no-dead-code": "error"
    }
}
```

### 3.2 Search Patterns for Dead Code

```bash
# Unused exports (find exports, then grep for imports)
grep -r "export function\|export const\|export interface" src/ | \
    awk -F: '{print $2}' | \
    while read export; do
        name=$(echo "$export" | grep -oP '(?<=export (function|const|interface) )\w+')
        if ! grep -rq "import.*$name\|from.*$name" src/; then
            echo "Possibly unused: $name"
        fi
    done

# Commented code blocks (multiline comments with code-like content)
grep -rn "^\s*//.*function\|^\s*//.*const\|^\s*//.*return" src/

# TODO/FIXME comments that might indicate dead code
grep -rn "TODO.*remove\|FIXME.*delete\|DEPRECATED" src/
```

### 3.3 Search Patterns for Duplicate Code

```bash
# Find potential duplicate functions
grep -rh "^function\|^export function\|^const.*=.*=>" src/ | \
    sort | uniq -d

# Find similar error handling patterns
grep -rn "catch.*Error" src/ | \
    awk -F: '{print $3}' | \
    sort | uniq -c | sort -rn

# Find repeated string literals
grep -rohE '"[^"]{10,}"' src/ | sort | uniq -c | sort -rn | head -20
```

---

## 4. Safe Removal Checklist

### Before Removing Code

- [ ] Verify no runtime references (dynamic imports, reflection)
- [ ] Check for string-based references (event names, route params)
- [ ] Search entire codebase including tests
- [ ] Check for external consumers (if published package)
- [ ] Verify not used in build/deploy scripts

### During Removal

- [ ] Remove all related code (tests, mocks, fixtures)
- [ ] Update barrel exports (index.ts files)
- [ ] Remove from any configuration files
- [ ] Clean up related imports in other files

### After Removal

- [ ] Run full test suite
- [ ] Run TypeScript compilation
- [ ] Verify no runtime errors
- [ ] Check build output size reduced

---

## 5. Common Dead Code Patterns

### Pattern 1: Feature Flag Leftovers

```typescript
// ❌ Feature flag that's always true/false
const FEATURE_NEW_UI = true;

function render() {
    if (FEATURE_NEW_UI) {
        return <NewUI />;
    }
    return <OldUI />; // DEAD: Never reached
}

// ✅ Remove flag and dead branch
function render() {
    return <NewUI />;
}
```

### Pattern 2: Deprecated API Handlers

```typescript
// ❌ Handler for removed API endpoint
// Note: /api/v1/users removed in v2.0
export async function handleLegacyUsers(req: Request) { // DEAD
    // ... implementation
}

// ✅ Delete entirely after verifying no callers
```

### Pattern 3: Unused Error Codes

```typescript
// ❌ Error codes never thrown
export const ErrorCodes = {
    AUTH_FAILED: 'AUTH_FAILED', // Used
    NETWORK_ERROR: 'NETWORK_ERROR', // Used
    LEGACY_ERROR: 'LEGACY_ERROR', // DEAD: Never used
    OLD_FORMAT: 'OLD_FORMAT', // DEAD: Never used
};

// ✅ Remove unused error codes
export const ErrorCodes = {
    AUTH_FAILED: 'AUTH_FAILED',
    NETWORK_ERROR: 'NETWORK_ERROR',
};
```

### Pattern 4: Overridden Methods Never Called

```typescript
// ❌ Interface method implemented but base class handles all calls
class CustomHandler extends BaseHandler {
    // This is never called - base class intercepts all requests
    protected processRequest(req: Request) { // DEAD
        // ... implementation
    }
}
```

### Pattern 5: Test-Only Exports

```typescript
// ❌ Exported only for tests, but tests don't use it
export function _internalHelper() { // DEAD: Only export was for tests
    // ...
}

// ✅ Make private or delete if truly unused
function internalHelper() {
    // ...
}
```

---

## 6. Common Duplicate Code Patterns

### Pattern 1: Loading State Handling

```typescript
// ❌ Duplicated across many components
if (loading) return <Spinner />;
if (error) return <ErrorDisplay error={error} />;
if (!data) return null;

// ✅ Extracted to component or hook
<LoadingState loading={loading} error={error}>
    <Content data={data} />
</LoadingState>
```

### Pattern 2: Form Validation

```typescript
// ❌ Same validation in multiple forms
const isEmailValid = email && email.includes('@') && email.length < 255;
const isPhoneValid = phone && /^\d{10}$/.test(phone);

// ✅ Centralized validators
import { isValidEmail, isValidPhone } from '@/core/validation';
```

### Pattern 3: API Error Handling

```typescript
// ❌ Same try/catch in every handler
try {
    const result = await api.call();
    return { success: true, data: result };
} catch (error) {
    logger.error('API call failed', error);
    return { success: false, error: formatError(error) };
}

// ✅ Wrapped in utility
const result = await safeApiCall(() => api.call());
```

### Pattern 4: Event Handler Patterns

```typescript
// ❌ Same pattern in many components
const handleClick = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    doAction();
}, [doAction]);

// ✅ Extracted hook
const handleClick = usePreventedCallback(doAction);
```

---

## 7. Consolidation Strategies

### Strategy 1: Extract to Shared Utility

```typescript
// Before: Duplicate in 3+ files
const truncated = text.length > 50 ? text.slice(0, 47) + '...' : text;

// After: Shared utility
// src/core/utils/stringHelpers.ts
export function truncate(text: string, maxLength = 50): string {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}
```

### Strategy 2: Extract to Shared Component

```typescript
// Before: Same JSX in multiple components
<div className="flex items-center gap-2">
    <StatusDot status={status} />
    <Text>{message}</Text>
</div>

// After: Shared component
// src/core/ui/components/feedback/StatusMessage.tsx
export function StatusMessage({ status, message }: StatusMessageProps) {
    return (
        <div className="flex items-center gap-2">
            <StatusDot status={status} />
            <Text>{message}</Text>
        </div>
    );
}
```

### Strategy 3: Extract to Shared Hook

```typescript
// Before: Same useState + useEffect in multiple components
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
useEffect(() => {
    fetchData().then(setData).finally(() => setLoading(false));
}, []);

// After: Shared hook
const { data, loading } = useFetch(fetchData);
```

### Strategy 4: Configuration Objects

```typescript
// Before: Magic values scattered
const timeout = 5000;
const retries = 3;
const delay = 1000;

// After: Centralized config
import { API_CONFIG } from '@/core/config';
const { timeout, retries, delay } = API_CONFIG;
```

---

## 8. AI Agent Integration

### Scan Patterns for Dead Code

When scanning for dead code, search for:

1. **Unused imports**: Import statements with no usage
2. **Unused variables**: Declared but never read
3. **Unused exports**: Exported but never imported
4. **Unreachable code**: Code after return/throw
5. **Commented code blocks**: Multiline comments containing code
6. **TODO/FIXME markers**: May indicate dead code
7. **Deprecated annotations**: @deprecated with no migration
8. **Feature flags**: Always true/false conditions

### Scan Patterns for Duplicate Code

When scanning for duplicates, search for:

1. **Identical functions**: Same name, same body
2. **Similar validation**: Same structure, different fields
3. **Repeated error handling**: Same try/catch pattern
4. **Copied JSX blocks**: Same component structure
5. **Magic strings/numbers**: Same literals repeated
6. **Similar hooks usage**: Same useState/useEffect patterns

### Auto-Fix Capabilities

- **HIGH confidence**: Remove clearly unused imports
- **HIGH confidence**: Remove code after return/throw
- **MEDIUM confidence**: Flag unused exports for review
- **MEDIUM confidence**: Suggest consolidation for duplicates
- **LOW confidence**: Flag commented code for manual review

---

## 9. Prevention Guidelines

### Code Review Checklist

- [ ] No new unused imports?
- [ ] No new unused variables?
- [ ] No commented-out code?
- [ ] No copy-paste without consolidation?
- [ ] Feature flags have cleanup tasks?

### IDE Configuration

```json
// VS Code settings.json
{
    "editor.showUnused": true,
    "typescript.preferences.organizeImportsIgnoreCase": true,
    "editor.codeActionsOnSave": {
        "source.organizeImports": true
    }
}
```

### Pre-commit Hooks

```bash
# In .husky/pre-commit
npx eslint --fix
npx tsc --noEmit
```

---

## 10. Summary

| Issue Type | Detection Method | Fix Approach |
|------------|------------------|--------------|
| Unused imports | TypeScript/ESLint | Auto-remove |
| Unused variables | TypeScript/ESLint | Auto-remove |
| Unused exports | Grep search | Manual verify, then remove |
| Unreachable code | ESLint no-unreachable | Auto-remove |
| Commented code | Pattern search | Manual review, then remove |
| Exact duplicates | Hash comparison | Extract to shared |
| Near duplicates | Pattern analysis | Parameterize and extract |
| Structural duplicates | AST analysis | Abstract and extract |

**Golden Rule**: If code isn't executed, delete it. Version control preserves history if you need it back.

**Cleanup Frequency**: Run dead code analysis monthly or before major releases.
