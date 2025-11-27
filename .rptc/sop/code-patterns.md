# Code Patterns - Project-Specific SOP

**Version**: 2.0.0
**Last Updated**: 2025-01-27
**Priority**: Project-specific (overrides plugin default)

---

## Project-Specific Patterns

This project has established patterns for code clarity and maintainability. These patterns MUST be followed by all AI agents and manual development to prevent anti-patterns from recurring.

---

## 1. Centralized Timeout Constants

**REQUIREMENT**: All timeout/delay values MUST use the centralized `TIMEOUTS` configuration.

### The Pattern

```typescript
// ✅ CORRECT: Import and use TIMEOUTS constants
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const result = await commandExecutor.execute(cmd, {
    timeout: TIMEOUTS.PREREQUISITE_CHECK,
});

await new Promise(resolve => setTimeout(resolve, TIMEOUTS.UI_DEBOUNCE));
```

```typescript
// ❌ WRONG: Magic numbers for timeouts
const result = await commandExecutor.execute(cmd, {
    timeout: 10000,  // What does 10000 mean?
});

await new Promise(resolve => setTimeout(resolve, 100));  // Undocumented delay
```

### Available TIMEOUTS Constants

| Constant | Value | Use Case |
|----------|-------|----------|
| `PREREQUISITE_CHECK` | 10000ms | Tool version checking |
| `PREREQUISITE_INSTALL` | 300000ms | Tool installation (5 min) |
| `CONFIG_READ` | 5000ms | Reading configuration files |
| `CONFIG_WRITE` | 10000ms | Writing configuration files |
| `MESH_DESCRIBE` | 30000ms | Mesh describe operations |
| `MESH_VERIFY_INITIAL_WAIT` | 20000ms | Wait before first verification poll |
| `MESH_VERIFY_POLL_INTERVAL` | 10000ms | Interval between verification polls |
| `SDK_INIT` | 5000ms | Adobe Console SDK initialization |
| `AUTH_POLL_INTERVAL` | 1000ms | Auth status polling |
| `UI_DEBOUNCE` | 100ms | UI update debouncing |

### Adding New Timeout Constants

When you need a new timeout value:

1. Add it to `src/core/utils/timeoutConfig.ts`
2. Use a descriptive name that indicates purpose
3. Add a comment explaining the value choice
4. Update this SOP's reference table

```typescript
// In timeoutConfig.ts
export const TIMEOUTS = {
    // ... existing constants
    MY_NEW_TIMEOUT: 15000, // 15 seconds - description of use case
} as const;
```

### Why This Pattern Matters

- **Discoverability**: All timeouts documented in one place
- **Consistency**: Same operation uses same timeout everywhere
- **Tunability**: Change timeout once, affects all usages
- **Code Review**: Prevents arbitrary magic numbers in PRs

---

## 2. Helper Function Extraction

**REQUIREMENT**: Extract complex inline logic to well-named helper functions for readability.

### When to Extract

Extract to a helper function when:
1. **2+ usages** of the same logic
2. **Complex conditional** (3+ conditions combined)
3. **Nested ternary** operators
4. **Logic that benefits from a descriptive name**

### The Pattern

```typescript
// ✅ CORRECT: Extracted helper with clear name
function hasMeshDeploymentRecord(project: Project): boolean {
    return Boolean(
        project.meshState &&
        Object.keys(project.meshState.envVars || {}).length > 0
    );
}

// Usage is self-documenting
if (hasMeshDeploymentRecord(project)) {
    // ...
}
```

```typescript
// ❌ WRONG: Inline complex logic repeated multiple times
if (project.meshState && Object.keys(project.meshState.envVars || {}).length > 0) {
    // ...
}

// Same logic elsewhere
const hasDeployment = project.meshState && Object.keys(project.meshState.envVars || {}).length > 0;
```

### Helper Function Naming Conventions

| Pattern | Use Case | Example |
|---------|----------|---------|
| `is*` / `has*` | Boolean checks | `hasMeshDeploymentRecord()`, `isTokenExpired()` |
| `determine*` | Computing a state/status | `determineMeshStatus()`, `determinePrerequisiteStatus()` |
| `get*` | Returning a value | `getAuthSubMessage()`, `getPrerequisiteStatusMessage()` |
| `should*` | Decision logic | `shouldAsyncCheckMesh()`, `shouldRetry()` |

### Helper Function Placement

- **Single file usage**: Define at top of file, before main functions
- **Multiple file usage (same feature)**: Create `shared.ts` in feature handlers directory
- **Cross-feature usage**: Consider adding to `@/core/utils/`

### Examples from This Codebase

**Prerequisites feature** (`src/features/prerequisites/handlers/shared.ts`):
```typescript
export function determinePrerequisiteStatus(
    installed: boolean,
    optional: boolean,
): 'success' | 'error' | 'warning' {
    if (installed) return 'success';
    return optional ? 'warning' : 'error';
}

export function getPrerequisiteStatusMessage(
    prereqName: string,
    installed: boolean,
    version?: string,
    perNodeVariantMissing?: boolean,
    missingVariantMajors?: string[],
): string {
    if (perNodeVariantMissing && missingVariantMajors?.length) {
        return `${prereqName} is missing in Node ${missingVariantMajors.join(', ')}`;
    }
    if (installed) {
        return version
            ? `${prereqName} is installed: ${version}`
            : `${prereqName} is installed`;
    }
    return `${prereqName} is not installed`;
}
```

**Dashboard feature** (`src/features/dashboard/handlers/dashboardHandlers.ts`):
```typescript
function hasMeshDeploymentRecord(project: Project): boolean {
    return Boolean(
        project.meshState &&
        Object.keys(project.meshState.envVars || {}).length > 0
    );
}

function determineMeshStatus(
    meshChanges: { hasChanges: boolean; unknownDeployedState?: boolean },
    meshComponent: ComponentInstance,
    project: Project,
): 'deployed' | 'config-changed' | 'update-declined' | 'error' | 'checking' {
    if (meshChanges.hasChanges) {
        return project.meshState?.userDeclinedUpdate
            ? 'update-declined'
            : 'config-changed';
    }
    return meshComponent.status === 'error' ? 'error' : 'deployed';
}
```

---

## 3. Nested Ternary Refactoring

**REQUIREMENT**: Avoid nested ternary operators. Extract to explicit if/else logic in helper functions.

### The Pattern

```typescript
// ✅ CORRECT: Explicit helper function
function getAuthSubMessage(
    orgLacksAccess: boolean,
    currentOrg: AdobeOrg | undefined,
): string {
    if (orgLacksAccess) {
        return 'Organization no longer accessible or lacks App Builder access';
    }
    if (currentOrg) {
        return `Connected to ${currentOrg.name || 'your organization'}`;
    }
    return 'Please complete authentication to continue';
}

// Usage
subMessage: getAuthSubMessage(!!orgLacksAccess, currentOrg),
```

```typescript
// ❌ WRONG: Nested ternary
subMessage: orgLacksAccess
    ? 'Organization no longer accessible'
    : currentOrg
        ? `Connected to ${currentOrg.name}`
        : 'Please complete authentication',
```

### Acceptable Ternary Patterns

Some ternary uses are acceptable when they're **simple and flat**:

```typescript
// ✅ OK: Simple fallback
const name = user.displayName || user.email || 'Unknown';

// ✅ OK: Simple conditional assignment
const status = installed ? 'success' : 'error';

// ✅ OK: Sorting comparison (common pattern)
return a.order === b.order ? 0 : a.order > b.order ? 1 : -1;
```

### When Ternaries Are NOT Acceptable

- **Nested ternaries** with 3+ branches
- **Complex conditions** in the test expression
- **Long return values** that hurt readability

```typescript
// ❌ NOT OK: Nested with complex logic
const message = isError
    ? hasDetails
        ? `Error: ${details}`
        : 'Unknown error'
    : isWarning
        ? 'Warning occurred'
        : 'Success';
```

---

## 4. Inline Expression Complexity

**REQUIREMENT**: Extract complex inline expressions that require mental parsing to understand.

### Complexity Thresholds

Extract to a helper when ANY of these apply:

| Pattern | Threshold | Example |
|---------|-----------|---------|
| Optional chaining | >2 levels deep | `a?.b?.c?.d` → extract |
| Object operations | Any `Object.keys/values/entries` inline | `Object.keys(x).length` → extract |
| Boolean coercion | `!!` or `Boolean()` with additional logic | `!!x && x.prop` → extract |
| Array chains | >1 operation inline | `.filter().map()` → extract |
| Nullish fallbacks | >2 fallbacks | `a ?? b ?? c ?? d` → extract |

### The Pattern

```typescript
// ✅ CORRECT: Named helper reveals intent
function hasEnvVars(meshState: MeshState | undefined): boolean {
    return Boolean(meshState?.envVars && Object.keys(meshState.envVars).length > 0);
}

// Usage is immediately clear
if (hasEnvVars(project.meshState)) { ... }
```

```typescript
// ❌ WRONG: Reader must mentally parse
if (project.meshState?.envVars && Object.keys(project.meshState.envVars).length > 0) { ... }
```

### Deep Optional Chaining

```typescript
// ❌ WRONG: 4 levels deep
const workspaceId = state.adobe?.project?.workspace?.id;

// ✅ CORRECT: Helper with null safety
function getWorkspaceId(state: WizardState): string | undefined {
    return state.adobe?.project?.workspace?.id;
}
```

### Inline Object Operations

```typescript
// ❌ WRONG: Inline Object.keys check
const hasConfig = config && Object.keys(config.settings || {}).length > 0;

// ✅ CORRECT: Named predicate
function hasConfigSettings(config: Config | undefined): boolean {
    if (!config?.settings) return false;
    return Object.keys(config.settings).length > 0;
}
```

### Boolean Coercion Patterns

```typescript
// ❌ WRONG: Double-bang with chained logic
const isReady = !!auth?.token && !!project?.id && !isLoading;

// ✅ CORRECT: Named check
function isReadyToSubmit(auth: Auth, project: Project, isLoading: boolean): boolean {
    if (!auth?.token) return false;
    if (!project?.id) return false;
    if (isLoading) return false;
    return true;
}
```

---

## 5. JSX Inline Complexity

**REQUIREMENT**: Extract conditional rendering logic from JSX when there are multiple branches.

### The Pattern

```typescript
// ❌ WRONG: Logic mixed with rendering
{isLoading ? (
    <Spinner />
) : error ? (
    <ErrorDisplay message={error.message} onRetry={() => refetch()} />
) : data?.items?.length > 0 ? (
    <List items={data.items} />
) : (
    <EmptyState />
)}

// ✅ CORRECT: Extract render decision
function renderContent(
    isLoading: boolean,
    error: Error | null,
    data: Data | null,
): React.ReactNode {
    if (isLoading) return <Spinner />;
    if (error) return <ErrorDisplay message={error.message} />;
    if (data?.items?.length) return <List items={data.items} />;
    return <EmptyState />;
}

// Usage - clean and readable
{renderContent(isLoading, error, data)}
```

### When to Extract JSX Logic

- **>2 conditional branches** in a single expression
- **Nested ternaries** in JSX props
- **Complex conditions** determining what to render

### Acceptable JSX Patterns

```typescript
// ✅ OK: Simple conditional render
{isVisible && <Component />}

// ✅ OK: Simple ternary
{isLoading ? <Spinner /> : <Content />}

// ✅ OK: Null check with render
{data && <Display data={data} />}
```

---

## 6. Callback Body Complexity

**REQUIREMENT**: Extract complex transformation logic from inline callbacks.

### The Pattern

```typescript
// ❌ WRONG: Complex logic inside callback
items.map(item => ({
    ...item,
    status: item.installed ? 'success' : item.optional ? 'warning' : 'error',
    message: item.installed
        ? `${item.name} v${item.version}`
        : `${item.name} not found`,
    action: item.installed ? null : { label: 'Install', handler: () => install(item.id) }
}))

// ✅ CORRECT: Extract transformation
function toDisplayItem(item: Item): DisplayItem {
    return {
        ...item,
        status: determineStatus(item),
        message: formatItemMessage(item),
        action: getItemAction(item),
    };
}

// Usage - intent is clear
items.map(toDisplayItem)
```

### When to Extract Callbacks

- **>3 properties** being computed in a map/filter/reduce
- **Nested ternaries** inside callback body
- **Same transformation** used in multiple places
- **Callback body >3 lines**

### Acceptable Callback Patterns

```typescript
// ✅ OK: Simple property access
items.map(item => item.name)

// ✅ OK: Simple transformation
items.filter(item => item.isActive)

// ✅ OK: Simple object creation
items.map(item => ({ id: item.id, label: item.name }))
```

---

## 7. Async Pattern Repetition

**REQUIREMENT**: Extract repeated async fetch-parse-cache patterns into shared helpers.

### The Pattern

```typescript
// ❌ WRONG: Same fetch-parse-cache pattern repeated across methods
async function getCurrentOrg() {
    let cached = this.cache.get('context');
    if (!cached) {
        const result = await this.cmd.execute('aio console where --json');
        if (result.code === 0 && result.stdout) {
            cached = JSON.parse(result.stdout);
            this.cache.set('context', cached);
        }
    }
    return cached?.org;
}

async function getCurrentProject() {
    let cached = this.cache.get('context');
    if (!cached) {
        const result = await this.cmd.execute('aio console where --json');
        // Same pattern repeated...
    }
    return cached?.project;
}

// ✅ CORRECT: Extract the shared pattern
private async getConsoleWhereContext(): Promise<ConsoleWhere | undefined> {
    let context = this.cache.get('context');

    if (!context) {
        const result = await this.cmd.execute('aio console where --json');
        if (result.code === 0 && result.stdout) {
            context = JSON.parse(result.stdout);
            this.cache.set('context', context);
        }
    }

    return context;
}

// Reuse the helper
async getCurrentOrg() {
    return (await this.getConsoleWhereContext())?.org;
}

async getCurrentProject() {
    return (await this.getConsoleWhereContext())?.project;
}
```

### When to Extract Async Patterns

- **2+ methods** with same fetch/parse/cache flow
- **Same error handling** repeated across async calls
- **Same retry logic** in multiple places

---

## 8. Conditional Object Properties

**REQUIREMENT**: Extract complex conditional object building to explicit helper functions.

### The Pattern

```typescript
// ❌ WRONG: Spread conditionals inline
const config = {
    name: project.name,
    ...(project.description && { description: project.description }),
    ...(project.version && { version: project.version }),
    ...(options.debug && { debug: true }),
    ...(options.verbose && { verbose: true, logLevel: 'debug' }),
};

// ✅ CORRECT: Build explicitly
function buildConfig(project: Project, options: Options): Config {
    const config: Config = { name: project.name };

    if (project.description) config.description = project.description;
    if (project.version) config.version = project.version;
    if (options.debug) config.debug = true;
    if (options.verbose) {
        config.verbose = true;
        config.logLevel = 'debug';
    }

    return config;
}
```

### When to Extract Object Building

- **>2 conditional spreads** (`...(condition && {...})`)
- **Nested conditionals** in object properties
- **Same object shape** built in multiple places

### Acceptable Patterns

```typescript
// ✅ OK: Single conditional spread
const options = {
    timeout: 5000,
    ...(debug && { verbose: true }),
};

// ✅ OK: Simple fallback
const config = {
    name: name || 'default',
    count: count ?? 0,
};
```

---

## 9. Error Message Construction

**REQUIREMENT**: Extract complex error message building to dedicated functions.

### The Pattern

```typescript
// ❌ WRONG: Complex inline string building
throw new Error(
    `Failed to ${action} ${resource.type} "${resource.name}"` +
    (resource.id ? ` (ID: ${resource.id})` : '') +
    (error.code ? `: [${error.code}]` : '') +
    `: ${error.message || 'Unknown error'}` +
    (error.details ? `\nDetails: ${JSON.stringify(error.details)}` : '')
);

// ✅ CORRECT: Extract message builder
function buildErrorMessage(
    action: string,
    resource: Resource,
    error: ErrorInfo,
): string {
    const parts: string[] = [
        `Failed to ${action} ${resource.type} "${resource.name}"`,
    ];

    if (resource.id) parts.push(`(ID: ${resource.id})`);
    if (error.code) parts.push(`[${error.code}]`);
    parts.push(error.message || 'Unknown error');

    let message = parts.join(' ');
    if (error.details) {
        message += `\nDetails: ${JSON.stringify(error.details)}`;
    }

    return message;
}

// Usage
throw new Error(buildErrorMessage(action, resource, error));
```

### When to Extract Error Messages

- **>2 conditional parts** in the message
- **String concatenation** with multiple `+` operators
- **Same error format** used across multiple throw sites

---

## 10. Validation Chains

**REQUIREMENT**: Extract long validation chains to named predicate functions.

### The Pattern

```typescript
// ❌ WRONG: Long validation inline
const isValid =
    value !== null &&
    value !== undefined &&
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_LENGTH &&
    VALID_PATTERN.test(value) &&
    !FORBIDDEN_VALUES.includes(value);

// ✅ CORRECT: Named validation with early returns
function isValidInput(value: unknown): value is string {
    if (value === null || value === undefined) return false;
    if (typeof value !== 'string') return false;
    if (value.trim().length === 0) return false;
    if (value.length > MAX_LENGTH) return false;
    if (!VALID_PATTERN.test(value)) return false;
    if (FORBIDDEN_VALUES.includes(value)) return false;
    return true;
}
```

### When to Extract Validations

- **>3 conditions** combined with `&&`
- **Type narrowing** needed (use type guard)
- **Same validation** applied in multiple places
- **Complex conditions** that need explanation

### Validation Naming Conventions

| Pattern | Use Case | Example |
|---------|----------|---------|
| `isValid*` | General validation | `isValidEmail()`, `isValidConfig()` |
| `is*` (type guard) | Type narrowing | `isString()`, `isProject()` |
| `has*` | Presence checks | `hasRequiredFields()`, `hasPermission()` |
| `can*` | Capability checks | `canSubmit()`, `canEdit()` |

---

## 11. AI Anti-Patterns (Code Patterns)

### Magic Number Anti-Pattern

```typescript
// ❌ AI often generates this
await new Promise(r => setTimeout(r, 5000));
const result = await cmd.execute({ timeout: 30000 });
```

**Fix**: Always ask "Is there a TIMEOUTS constant for this?" If not, create one.

### Inline Logic Duplication Anti-Pattern

```typescript
// ❌ AI often copies the same condition check multiple times
if (project.meshState && Object.keys(project.meshState.envVars || {}).length > 0) { ... }
// ... later in same file
const hasMesh = project.meshState && Object.keys(project.meshState.envVars || {}).length > 0;
```

**Fix**: Extract to a helper function on first occurrence if logic is non-trivial.

### Nested Ternary Anti-Pattern

```typescript
// ❌ AI often generates deeply nested ternaries for "conciseness"
const status = a ? b ? 'x' : 'y' : c ? 'z' : 'w';
```

**Fix**: Immediately extract to an explicit helper function with clear if/else logic.

### JSX Conditional Rendering Anti-Pattern

```typescript
// ❌ AI often generates nested ternaries in JSX for "compactness"
{loading ? <Spinner /> : error ? <Error /> : data ? <Content /> : <Empty />}
```

**Fix**: Extract to a `renderContent()` helper function with explicit if/else returns.

### Complex Callback Anti-Pattern

```typescript
// ❌ AI often puts too much logic inside .map() callbacks
items.map(item => ({
    ...item,
    status: item.x ? 'a' : item.y ? 'b' : 'c',
    label: `${item.name} (${item.count})`,
}))
```

**Fix**: Extract to a named `toDisplayItem()` function.

### Spread Conditional Anti-Pattern

```typescript
// ❌ AI often chains conditional spreads for "flexibility"
const obj = { a, ...(b && { b }), ...(c && { c }), ...(d && { d }) };
```

**Fix**: Build object explicitly with if statements in a helper function.

### Validation Chain Anti-Pattern

```typescript
// ❌ AI often chains many && conditions for validation
const valid = a && b && c && d && e && f;
```

**Fix**: Extract to an `isValid*()` type guard function with early returns.

---

## 12. RPTC Workflow Integration

### Master Efficiency Agent

When the Master Efficiency Agent reviews code, it MUST check:
1. All timeout values use `TIMEOUTS` constants
2. Duplicate inline logic is extracted to helpers
3. Nested ternaries are refactored
4. Inline expressions don't exceed complexity thresholds (Section 4)
5. JSX conditional rendering uses helper functions (Section 5)
6. Callback bodies are extracted when complex (Section 6)
7. Async patterns aren't duplicated (Section 7)
8. Conditional object properties use explicit builders (Section 8)
9. Error messages use builder functions (Section 9)
10. Validation chains use type guard functions (Section 10)

### Master Simplicity Agent

When the Master Simplicity Agent validates plans, it MUST ensure:
1. New features propose timeout constants, not magic numbers
2. Helper function extraction is planned for complex logic
3. No nested ternaries are introduced
4. Complex conditions will be extracted to named predicates
5. JSX rendering logic is separated from presentation
6. Async patterns are consolidated, not duplicated

### TDD Implementation

When implementing features via `/rptc:tdd`:
1. Import `TIMEOUTS` at the start if timeouts are needed
2. Create helper functions before main implementation
3. Review for nested ternaries before marking step complete
4. Check inline expression complexity thresholds before marking complete
5. Ensure callbacks have named transformations for complex logic

---

## 13. Quick Reference for AI Agents

### Before Writing Code

- [ ] Will I need timeouts? → Import `TIMEOUTS` from `@/core/utils/timeoutConfig`
- [ ] Will I repeat logic? → Plan helper function extraction
- [ ] Will I need conditional returns? → Use explicit if/else, not nested ternaries
- [ ] Will I have complex inline expressions? → Plan named predicates/helpers
- [ ] Will I have conditional JSX? → Plan `render*()` helper functions
- [ ] Will I transform arrays? → Plan named transformation functions

### During Code Review

- [ ] Any numeric literals for time/delay? → Replace with TIMEOUTS constant
- [ ] Any repeated conditional logic? → Extract to named helper
- [ ] Any nested ternaries (`? : ? :`)? → Extract to explicit helper function
- [ ] Any `?.?.?.?` chains (>2 levels)? → Extract to getter helper
- [ ] Any `Object.keys/values/entries` inline? → Extract to predicate helper
- [ ] Any `!!` or `Boolean()` with logic? → Extract to named check
- [ ] Any `.filter().map()` chains? → Extract to named transformation
- [ ] Any `...(condition && {...})` chains (>2)? → Extract to builder function
- [ ] Any string concatenation with conditions? → Extract to message builder
- [ ] Any `&& && &&` validation chains (>3)? → Extract to type guard

### After Implementation

```bash
# Search for magic numbers in new/changed files
grep -E "setTimeout\(.*, [0-9]+" src/features/my-feature/
grep -E "timeout: [0-9]+" src/features/my-feature/

# Search for nested ternaries
grep -E "\? .+ : .+\?" src/features/my-feature/

# Search for deep optional chaining
grep -E "\?\.\w+\?\.\w+\?\." src/features/my-feature/

# Search for Object.keys inline
grep -E "Object\.(keys|values|entries)\(" src/features/my-feature/

# Search for long && chains
grep -E "&&.*&&.*&&.*&&" src/features/my-feature/
```

---

## 14. Summary

| # | Pattern | Rule | Threshold |
|---|---------|------|-----------|
| 1 | Timeouts | Use `TIMEOUTS.*` constants | Any numeric timeout |
| 2 | Helper Functions | Extract to named functions | 2+ usages or complex logic |
| 3 | Ternaries | No nesting; use explicit helpers | >2 branches |
| 4 | Inline Expressions | Extract complex expressions | See thresholds table |
| 5 | JSX Complexity | Extract conditional rendering | >2 conditional branches |
| 6 | Callbacks | Extract transformation logic | >3 computed properties |
| 7 | Async Patterns | Consolidate repeated patterns | 2+ similar fetch flows |
| 8 | Object Building | Use explicit builders | >2 conditional spreads |
| 9 | Error Messages | Use message builders | >2 conditional parts |
| 10 | Validation Chains | Use type guard functions | >3 conditions |

**Golden Rule**: If a human needs context to understand the code, the code needs refactoring.

**Enforcement**: All patterns are checked by the Master Efficiency Agent during TDD quality gates.
