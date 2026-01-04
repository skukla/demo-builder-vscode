# Complexity Reduction - Project-Specific SOP

**Version**: 1.0.0
**Last Updated**: 2025-01-14
**Priority**: Project-specific

---

## Overview

This SOP defines patterns for identifying and reducing code complexity to improve readability, maintainability, and testability. Complex code is harder to understand, more error-prone, and costly to maintain.

---

## 1. Complexity Metrics

### 1.1 Cyclomatic Complexity

Measures the number of linearly independent paths through code.

| Score | Rating | Action |
|-------|--------|--------|
| 1-4 | Low | Good - no action needed |
| 5-7 | Moderate | Review - consider simplification |
| 8-10 | High | Refactor - split function |
| 11+ | Very High | Critical - must refactor |

```typescript
// ❌ High complexity (8+)
function processOrder(order: Order): Result {
    if (!order) return { error: 'No order' };           // +1
    if (!order.items) return { error: 'No items' };     // +1
    if (order.items.length === 0) return { error: 'Empty' }; // +1

    let total = 0;
    for (const item of order.items) {                   // +1
        if (item.quantity <= 0) continue;               // +1
        if (item.price < 0) return { error: 'Invalid price' }; // +1

        if (item.discount) {                            // +1
            total += item.price * item.quantity * (1 - item.discount);
        } else {
            total += item.price * item.quantity;
        }
    }

    if (total > order.maxAmount) {                      // +1
        return { error: 'Exceeds max' };
    }

    return { success: true, total };
}
// Cyclomatic complexity: 9

// ✅ Reduced complexity through extraction
function validateOrder(order: Order): string | null {
    if (!order) return 'No order';
    if (!order.items?.length) return 'No items';
    return null;
}

function calculateItemTotal(item: OrderItem): number {
    const base = item.price * item.quantity;
    return item.discount ? base * (1 - item.discount) : base;
}

function processOrder(order: Order): Result {
    const error = validateOrder(order);
    if (error) return { error };

    const total = order.items
        .filter(item => item.quantity > 0 && item.price >= 0)
        .reduce((sum, item) => sum + calculateItemTotal(item), 0);

    if (total > order.maxAmount) return { error: 'Exceeds max' };
    return { success: true, total };
}
// Each function: complexity 2-3
```

### 1.2 Cognitive Complexity

Measures how hard code is to understand (not just number of paths).

**Complexity Increments:**
- +1 for each `if`, `else if`, `else`
- +1 for each `for`, `while`, `do while`
- +1 for each `&&`, `||`, `??` in conditions
- +1 for each ternary `?:`
- +N for each nesting level (nested structures multiply complexity)

```typescript
// ❌ High cognitive complexity
function getStatus(user: User, project: Project): Status {
    if (user.role === 'admin') {                        // +1
        if (project.status === 'active') {              // +1, +1 nesting
            return project.owner === user.id            // +1, +2 nesting
                ? 'full-access'
                : 'admin-access';
        } else if (project.status === 'archived') {     // +1
            return 'read-only';
        }
    } else if (user.role === 'member') {                // +1
        if (project.members.includes(user.id)) {        // +1, +1 nesting
            return project.status === 'active'          // +1, +2 nesting
                ? 'member-access'
                : 'read-only';
        }
    }
    return 'no-access';
}
// Cognitive complexity: 13

// ✅ Reduced through early returns and extraction
function getStatus(user: User, project: Project): Status {
    if (user.role === 'admin') {
        return getAdminStatus(user, project);
    }
    if (user.role === 'member' && project.members.includes(user.id)) {
        return getMemberStatus(project);
    }
    return 'no-access';
}

function getAdminStatus(user: User, project: Project): Status {
    if (project.status === 'archived') return 'read-only';
    if (project.status !== 'active') return 'admin-access';
    return project.owner === user.id ? 'full-access' : 'admin-access';
}

function getMemberStatus(project: Project): Status {
    return project.status === 'active' ? 'member-access' : 'read-only';
}
// Each function: cognitive complexity 3-4
```

### 1.3 Nesting Depth

Maximum depth of nested structures.

| Depth | Rating | Action |
|-------|--------|--------|
| 1-2 | Good | No action needed |
| 3 | Moderate | Review for extraction |
| 4+ | High | Must refactor |

```typescript
// ❌ Deep nesting (depth 4)
function process(data: Data) {
    if (data) {                                         // depth 1
        for (const item of data.items) {                // depth 2
            if (item.enabled) {                         // depth 3
                for (const sub of item.subitems) {      // depth 4
                    if (sub.valid) {                    // depth 5!
                        // ... logic
                    }
                }
            }
        }
    }
}

// ✅ Flattened through early returns and extraction
function process(data: Data) {
    if (!data?.items) return;

    const enabledItems = data.items.filter(item => item.enabled);
    enabledItems.forEach(processItem);
}

function processItem(item: Item) {
    const validSubs = item.subitems.filter(sub => sub.valid);
    validSubs.forEach(processSubItem);
}

function processSubItem(sub: SubItem) {
    // ... logic (depth 1)
}
```

---

## 2. Complexity Patterns to Avoid

### 2.1 Long Functions

**Threshold**: >30 lines

```typescript
// ❌ Long function (50+ lines)
function handleFormSubmit(form: Form): Promise<Result> {
    // 50+ lines of validation, transformation, API calls, error handling
}

// ✅ Split by responsibility
async function handleFormSubmit(form: Form): Promise<Result> {
    const validationError = validateForm(form);
    if (validationError) return { error: validationError };

    const transformedData = transformFormData(form);
    return await submitFormData(transformedData);
}
```

### 2.2 Long Parameter Lists

**Threshold**: >4 parameters

```typescript
// ❌ Too many parameters
function createUser(
    name: string,
    email: string,
    role: string,
    department: string,
    manager: string,
    startDate: Date,
    permissions: string[],
    metadata: Record<string, unknown>
): User { ... }

// ✅ Use object parameter
interface CreateUserOptions {
    name: string;
    email: string;
    role: string;
    department: string;
    manager?: string;
    startDate: Date;
    permissions?: string[];
    metadata?: Record<string, unknown>;
}

function createUser(options: CreateUserOptions): User { ... }
```

### 2.3 Boolean Parameter Flags

```typescript
// ❌ Boolean flags make calls hard to understand
function processData(data: Data, validate: boolean, transform: boolean, async: boolean) { ... }

processData(data, true, false, true); // What do these booleans mean?

// ✅ Use options object with named properties
interface ProcessOptions {
    validate?: boolean;
    transform?: boolean;
    async?: boolean;
}

function processData(data: Data, options: ProcessOptions = {}) { ... }

processData(data, { validate: true, async: true }); // Clear intent
```

### 2.4 Switch/Case Proliferation

```typescript
// ❌ Large switch statement
function getHandler(type: string): Handler {
    switch (type) {
        case 'create': return new CreateHandler();
        case 'update': return new UpdateHandler();
        case 'delete': return new DeleteHandler();
        case 'read': return new ReadHandler();
        case 'list': return new ListHandler();
        case 'search': return new SearchHandler();
        // ... 10 more cases
        default: throw new Error(`Unknown type: ${type}`);
    }
}

// ✅ Use object lookup
const handlers: Record<string, () => Handler> = {
    create: () => new CreateHandler(),
    update: () => new UpdateHandler(),
    delete: () => new DeleteHandler(),
    read: () => new ReadHandler(),
    list: () => new ListHandler(),
    search: () => new SearchHandler(),
};

function getHandler(type: string): Handler {
    const factory = handlers[type];
    if (!factory) throw new Error(`Unknown type: ${type}`);
    return factory();
}
```

### 2.5 Nested Callbacks

```typescript
// ❌ Callback hell
fetchUser(userId, (user) => {
    fetchOrders(user.id, (orders) => {
        fetchProducts(orders, (products) => {
            processData(user, orders, products, (result) => {
                handleResult(result);
            });
        });
    });
});

// ✅ Use async/await
async function processUserData(userId: string) {
    const user = await fetchUser(userId);
    const orders = await fetchOrders(user.id);
    const products = await fetchProducts(orders);
    const result = await processData(user, orders, products);
    return handleResult(result);
}
```

### 2.6 God Objects/Functions

Objects or functions that do too much.

```typescript
// ❌ God class - knows too much, does too much
class ApplicationManager {
    initializeDatabase() { ... }
    authenticateUser() { ... }
    renderUI() { ... }
    handleNetworkRequests() { ... }
    manageState() { ... }
    logErrors() { ... }
    // 20+ more methods
}

// ✅ Single responsibility classes
class DatabaseManager { ... }
class AuthenticationService { ... }
class UIRenderer { ... }
class NetworkClient { ... }
class StateManager { ... }
class ErrorLogger { ... }
```

---

## 3. Simplification Techniques

### 3.1 Early Returns (Guard Clauses)

```typescript
// ❌ Deep nesting
function processUser(user: User): Result {
    if (user) {
        if (user.isActive) {
            if (user.hasPermission) {
                return doProcess(user);
            } else {
                return { error: 'No permission' };
            }
        } else {
            return { error: 'User inactive' };
        }
    } else {
        return { error: 'No user' };
    }
}

// ✅ Guard clauses
function processUser(user: User): Result {
    if (!user) return { error: 'No user' };
    if (!user.isActive) return { error: 'User inactive' };
    if (!user.hasPermission) return { error: 'No permission' };

    return doProcess(user);
}
```

### 3.2 Replace Conditionals with Polymorphism

```typescript
// ❌ Type-checking conditionals
function getArea(shape: Shape): number {
    if (shape.type === 'circle') {
        return Math.PI * shape.radius ** 2;
    } else if (shape.type === 'rectangle') {
        return shape.width * shape.height;
    } else if (shape.type === 'triangle') {
        return (shape.base * shape.height) / 2;
    }
    throw new Error('Unknown shape');
}

// ✅ Polymorphism
interface Shape {
    getArea(): number;
}

class Circle implements Shape {
    constructor(private radius: number) {}
    getArea() { return Math.PI * this.radius ** 2; }
}

class Rectangle implements Shape {
    constructor(private width: number, private height: number) {}
    getArea() { return this.width * this.height; }
}
```

### 3.3 Extract Method

```typescript
// ❌ Long method with multiple concerns
function processOrder(order: Order) {
    // Validation logic (10 lines)
    if (!order.id) throw new Error('No ID');
    if (!order.items) throw new Error('No items');
    // ... more validation

    // Calculation logic (15 lines)
    let subtotal = 0;
    for (const item of order.items) {
        subtotal += item.price * item.quantity;
    }
    const tax = subtotal * 0.1;
    const total = subtotal + tax;
    // ... more calculations

    // Persistence logic (10 lines)
    db.save(order);
    // ... more persistence

    return { total };
}

// ✅ Extracted methods
function processOrder(order: Order) {
    validateOrder(order);
    const totals = calculateTotals(order);
    persistOrder(order, totals);
    return totals;
}

function validateOrder(order: Order): void { ... }
function calculateTotals(order: Order): Totals { ... }
function persistOrder(order: Order, totals: Totals): void { ... }
```

### 3.4 Replace Temp with Query

```typescript
// ❌ Temp variable for derived value
function getPrice(order: Order): number {
    const basePrice = order.quantity * order.itemPrice;
    const discount = Math.max(0, order.quantity - 500) * order.itemPrice * 0.05;
    const shipping = Math.min(100, basePrice * 0.1);
    return basePrice - discount + shipping;
}

// ✅ Query methods
function getPrice(order: Order): number {
    return getBasePrice(order) - getDiscount(order) + getShipping(order);
}

function getBasePrice(order: Order): number {
    return order.quantity * order.itemPrice;
}

function getDiscount(order: Order): number {
    return Math.max(0, order.quantity - 500) * order.itemPrice * 0.05;
}

function getShipping(order: Order): number {
    return Math.min(100, getBasePrice(order) * 0.1);
}
```

### 3.5 Introduce Explaining Variable

```typescript
// ❌ Complex expression
if (platform.toUpperCase().indexOf('MAC') > -1 &&
    browser.toUpperCase().indexOf('CHROME') > -1 &&
    wasInitialized() &&
    resize > 0) {
    // ...
}

// ✅ Explaining variables
const isMacOS = platform.toUpperCase().indexOf('MAC') > -1;
const isChrome = browser.toUpperCase().indexOf('CHROME') > -1;
const isReady = wasInitialized();
const needsResize = resize > 0;

if (isMacOS && isChrome && isReady && needsResize) {
    // ...
}
```

---

## 4. React-Specific Complexity

### 4.1 Complex useEffect Dependencies

```typescript
// ❌ Too many dependencies, hard to track
useEffect(() => {
    if (user && project && workspace && auth && settings) {
        loadData(user, project, workspace, auth, settings);
    }
}, [user, project, workspace, auth, settings, loadData]);

// ✅ Extract to custom hook
function useProjectData(params: ProjectParams) {
    const { user, project, workspace, auth, settings } = params;

    useEffect(() => {
        if (!isReady(params)) return;
        loadData(params);
    }, [params]);

    return { data, loading, error };
}
```

### 4.2 Prop Drilling

```typescript
// ❌ Passing props through many levels
function App({ user }) {
    return <Layout user={user} />;
}
function Layout({ user }) {
    return <Sidebar user={user} />;
}
function Sidebar({ user }) {
    return <UserInfo user={user} />;
}
function UserInfo({ user }) {
    return <span>{user.name}</span>;
}

// ✅ Context for shared data
const UserContext = createContext<User | null>(null);

function App({ user }) {
    return (
        <UserContext.Provider value={user}>
            <Layout />
        </UserContext.Provider>
    );
}

function UserInfo() {
    const user = useContext(UserContext);
    return <span>{user?.name}</span>;
}
```

### 4.3 Complex JSX Conditionals

```typescript
// ❌ Nested conditionals in JSX
return (
    <div>
        {loading ? (
            <Spinner />
        ) : error ? (
            <Error message={error} />
        ) : data ? (
            data.items.length > 0 ? (
                <List items={data.items} />
            ) : (
                <Empty />
            )
        ) : null}
    </div>
);

// ✅ Extract render helper
function renderContent() {
    if (loading) return <Spinner />;
    if (error) return <Error message={error} />;
    if (!data) return null;
    if (data.items.length === 0) return <Empty />;
    return <List items={data.items} />;
}

return <div>{renderContent()}</div>;
```

### 4.4 Component Responsibilities

```typescript
// ❌ Component doing too much
function Dashboard() {
    // Data fetching (20 lines)
    // State management (15 lines)
    // Event handlers (30 lines)
    // Complex rendering (50 lines)
    // Total: 115+ lines
}

// ✅ Split by responsibility
function Dashboard() {
    return (
        <DashboardProvider>
            <DashboardHeader />
            <DashboardContent />
            <DashboardFooter />
        </DashboardProvider>
    );
}

// Logic in custom hook
function useDashboard() { ... }

// Presentation in components
function DashboardContent() { ... }
```

---

## 5. Complexity Thresholds

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| Cyclomatic complexity | 1-4 | 5-7 | 8+ |
| Cognitive complexity | 1-8 | 9-15 | 16+ |
| Function length | 1-30 | 31-50 | 51+ |
| Parameter count | 1-3 | 4-5 | 6+ |
| Nesting depth | 1-2 | 3 | 4+ |
| File length (handler) | 1-500 | 501-800 | 801+ |
| File length (component) | 1-300 | 301-450 | 451+ |
| File length (service) | 1-400 | 401-600 | 601+ |
| Class method count | 1-10 | 11-20 | 21+ |

**Note**: File length thresholds are higher than traditional guidance. Files can exceed thresholds if organized with section headers and all code relates to a single responsibility. See `god-file-decomposition.md` for the "Extract for Reuse, Section for Clarity" philosophy.

---

## 6. AI Agent Integration

### Scan Patterns for Complexity

When scanning for complexity issues, look for:

1. **Long functions**: >30 lines
2. **Deep nesting**: >3 levels of indentation
3. **Long parameter lists**: >4 parameters
4. **Complex conditionals**: >3 conditions combined
5. **Large switch/case**: >5 cases
6. **Callback nesting**: >2 levels of callbacks
7. **Large files**: >300 lines
8. **God classes**: >10 methods

### Complexity Detection Patterns

```bash
# Functions over 30 lines
awk '/^(export )?function|^const.*=>/{start=NR} /^}/{if(NR-start>30) print FILENAME":"start}' *.ts

# Deep nesting (count leading whitespace)
grep -n "^        " src/**/*.ts  # 4+ levels (8 spaces)

# Long parameter lists
grep -E "\([^)]{100,}\)" src/**/*.ts

# Complex conditionals
grep -E "if.*&&.*&&.*&&|if.*\|\|.*\|\|.*\|\|" src/**/*.ts
```

### Auto-Fix Capabilities

- **HIGH confidence**: Convert nested `if` to guard clauses
- **HIGH confidence**: Replace simple switch with object lookup
- **MEDIUM confidence**: Suggest function extraction for long functions
- **MEDIUM confidence**: Suggest parameter object for long parameter lists
- **LOW confidence**: Flag high complexity for manual review

---

## 7. Refactoring Checklist

### Before Refactoring

- [ ] Identify the specific complexity issue
- [ ] Ensure tests exist for affected code
- [ ] Understand the code's purpose and dependencies
- [ ] Plan the refactoring approach

### During Refactoring

- [ ] Make one change at a time
- [ ] Run tests after each change
- [ ] Keep functions focused (single responsibility)
- [ ] Use meaningful names for extracted functions
- [ ] Maintain consistent abstraction levels

### After Refactoring

- [ ] All tests pass
- [ ] Code coverage maintained or improved
- [ ] Complexity metrics improved
- [ ] Code is more readable

---

## 8. Summary

| Pattern | Problem | Solution |
|---------|---------|----------|
| Long function | >30 lines | Extract methods |
| Deep nesting | >3 levels | Guard clauses, extraction |
| Many parameters | >4 params | Options object |
| Switch/case | >5 cases | Object lookup |
| Nested callbacks | >2 levels | async/await |
| Complex conditional | >3 conditions | Extract predicate |
| Prop drilling | >3 levels | Context or composition |
| God object | >10 methods | Single responsibility split |

**Golden Rule**: Simple code is correct code. If you can't explain what code does in one sentence, it's too complex.

**Refactoring Mantra**: Make it work, make it right, make it simple.
