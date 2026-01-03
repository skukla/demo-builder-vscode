# Step 6: Migrate Feature UIs (Core/Shared)

**Purpose:** Replace Adobe Spectrum imports in `src/core/ui/` components with the new React Aria components created in Steps 1-5, eliminating UNSAFE_className usage and maintaining identical functionality.

**Prerequisites:**
- [ ] Step 1 complete: Infrastructure (react-aria-components installed, directory structure created)
- [ ] Step 2 complete: Primitive components (Text, Heading, Flex, View, Divider)
- [ ] Step 3 complete: Interactive components (Button, ActionButton, ProgressCircle)
- [ ] Step 4 complete: Form components (TextField, SearchField)
- [ ] Step 5 complete: Overlay components (Dialog, Menu) with barrel exports in `@/core/ui/components/aria`

---

## Migration Scope

### Components to Migrate (22 files)

**Feedback Components (6 files):**
| File | Spectrum Imports | Priority |
|------|-----------------|----------|
| `LoadingDisplay.tsx` | Flex, ProgressCircle, Text | High |
| `EmptyState.tsx` | Flex, Text, Well | Medium |
| `StatusDisplay.tsx` | Flex, Text, Button | High |
| `LoadingOverlay.tsx` | Text | Low |
| `StatusCard.tsx` | TBD | Medium |
| `SuccessStateDisplay.tsx` | TBD | Medium |

**Form Components (3 files):**
| File | Spectrum Imports | Priority |
|------|-----------------|----------|
| `FormField.tsx` | TextField, Picker, Item, Flex, Text | High |
| `ConfigSection.tsx` | Heading, Flex, Divider | Medium |
| `FieldHelpButton.tsx` | ActionButton, Dialog, etc. | Low (complex) |

**Layout Components (3 files):**
| File | Spectrum Imports | Priority |
|------|-----------------|----------|
| `CenteredFeedbackContainer.tsx` | Flex | Low |
| `PageHeader.tsx` | View, Flex, Heading, Text, Button | High |
| `PageFooter.tsx` | View | Low |

**Navigation Components (4 files):**
| File | Spectrum Imports | Priority |
|------|-----------------|----------|
| `BackButton.tsx` | ActionButton, Text | High |
| `NavigationPanel.tsx` | Heading, Flex, Text | Medium |
| `SearchableList.tsx` | Text, ListView, Item | Deferred |
| `SearchHeader.tsx` | Flex, Text, SearchField, ActionButton | High |

**UI Components (3 files):**
| File | Spectrum Imports | Priority |
|------|-----------------|----------|
| `Spinner.tsx` | ProgressCircle | High |
| `Modal.tsx` | Dialog, Heading, Content, Divider, Button | Medium |
| `NumberedInstructions.tsx` | Flex, Text | Low |

**Wizard Components (2 files):**
| File | Spectrum Imports | Priority |
|------|-----------------|----------|
| `ConfigurationSummary.tsx` | View, Heading, Text, Flex, Divider | Medium |
| `configurationSummaryHelpers.tsx` | Flex, Text | Low |

**Root Components (3 files):**
| File | Spectrum Imports | Priority |
|------|-----------------|----------|
| `ErrorBoundary.tsx` | View, Text, Heading | High |
| `WebviewApp.tsx` | Provider, defaultTheme | Deferred |
| `TimelineNav.tsx` | View, Text | Medium |

---

## Test Strategy

### Testing Approach
- **Framework:** Jest with @testing-library/react
- **Coverage Goal:** 90% for migrated components (core infrastructure)
- **Test Location:** `tests/core/ui/components/`

### Pre-Migration Verification
Before migrating each file, verify existing tests pass:
```bash
npm test -- tests/core/ui/components/
```

### Post-Migration Verification
After each file migration, run tests to ensure no regressions:
```bash
npm test -- tests/core/ui/components/[component-path].test.tsx
```

---

## Implementation Tasks

### Task 6.1: Migrate Simple Primitive Users (5 files)

**Files:**
- [ ] `src/core/ui/components/ui/Spinner.tsx`
- [ ] `src/core/ui/components/feedback/LoadingOverlay.tsx`
- [ ] `src/core/ui/components/layout/CenteredFeedbackContainer.tsx`
- [ ] `src/core/ui/components/layout/PageFooter.tsx`
- [ ] `src/core/ui/components/ui/NumberedInstructions.tsx`

**Migration Pattern:**
```typescript
// Before
import { Flex, ProgressCircle, Text } from '@adobe/react-spectrum';
<Flex gap="size-200" alignItems="center" UNSAFE_className={className}>
    <ProgressCircle size={size} isIndeterminate={true} aria-label={message} />
    <Text UNSAFE_className={mainTextClass}>{message}</Text>
</Flex>

// After
import { Flex, ProgressCircle, Text } from '@/core/ui/components/aria';
<Flex gap="size-200" alignItems="center" className={className}>
    <ProgressCircle size={size} isIndeterminate aria-label={message} />
    <Text className={mainTextClass}>{message}</Text>
</Flex>
```

**Tests to Write First:**

- [ ] Test: Spinner renders with ProgressCircle
  - **Given:** Spinner component with size="M"
  - **When:** Component renders
  - **Then:** ProgressCircle element present with correct aria-label
  - **File:** `tests/core/ui/components/ui/Spinner.test.tsx`

- [ ] Test: LoadingOverlay shows message text
  - **Given:** LoadingOverlay with message="Loading..."
  - **When:** Component renders
  - **Then:** Text displays the message
  - **File:** `tests/core/ui/components/feedback/LoadingOverlay.test.tsx`

- [ ] Test: CenteredFeedbackContainer centers content
  - **Given:** Container with child content
  - **When:** Component renders
  - **Then:** Content is centered via Flex
  - **File:** `tests/core/ui/components/layout/CenteredFeedbackContainer.test.tsx`

**Acceptance Criteria:**
- [ ] All 5 files migrated to React Aria imports
- [ ] No `@adobe/react-spectrum` imports remain
- [ ] No `UNSAFE_className` usage - use `className` instead
- [ ] Existing tests pass unchanged
- [ ] Visual output identical

---

### Task 6.2: Migrate Feedback Components (4 files)

**Files:**
- [ ] `src/core/ui/components/feedback/LoadingDisplay.tsx`
- [ ] `src/core/ui/components/feedback/StatusDisplay.tsx`
- [ ] `src/core/ui/components/feedback/EmptyState.tsx`
- [ ] `src/core/ui/components/feedback/StatusCard.tsx`

**Migration Pattern for LoadingDisplay:**
```typescript
// Before
import { Flex, ProgressCircle, Text } from '@adobe/react-spectrum';
<Flex gap="size-200" alignItems="center" UNSAFE_className={className}>
    <ProgressCircle size={size} isIndeterminate={true} aria-label={message} />
    <Text UNSAFE_className={mainTextClass}>{message}</Text>
    {helperText && (
        <Text UNSAFE_className={helperTextClass} marginTop="size-100">
            {helperText}
        </Text>
    )}
</Flex>

// After
import { Flex, ProgressCircle, Text } from '@/core/ui/components/aria';
<Flex gap="size-200" alignItems="center" className={className}>
    <ProgressCircle size={size} isIndeterminate aria-label={message} />
    <Text className={mainTextClass}>{message}</Text>
    {helperText && (
        <Text className={helperTextClass} marginTop="size-100">
            {helperText}
        </Text>
    )}
</Flex>
```

**Tests to Write First:**

- [ ] Test: LoadingDisplay shows primary message
  - **Given:** LoadingDisplay with message="Loading projects..."
  - **When:** Component renders
  - **Then:** Message text displays, ProgressCircle visible
  - **File:** `tests/core/ui/components/feedback/LoadingDisplay.test.tsx`

- [ ] Test: LoadingDisplay shows sub-message when provided
  - **Given:** LoadingDisplay with subMessage="This may take a moment"
  - **When:** Component renders
  - **Then:** Both primary and sub messages display
  - **File:** `tests/core/ui/components/feedback/LoadingDisplay.test.tsx`

- [ ] Test: LoadingDisplay centers for large size
  - **Given:** LoadingDisplay with size="L"
  - **When:** Component renders
  - **Then:** Container is centered vertically
  - **File:** `tests/core/ui/components/feedback/LoadingDisplay.test.tsx`

- [ ] Test: StatusDisplay renders variant icon
  - **Given:** StatusDisplay with variant="error"
  - **When:** Component renders
  - **Then:** Error icon displays with correct color
  - **File:** `tests/core/ui/components/feedback/StatusDisplay.test.tsx`

- [ ] Test: StatusDisplay shows action buttons
  - **Given:** StatusDisplay with actions array
  - **When:** Component renders
  - **Then:** Action buttons render and are clickable
  - **File:** `tests/core/ui/components/feedback/StatusDisplay.test.tsx`

- [ ] Test: EmptyState shows title and description
  - **Given:** EmptyState with title and description
  - **When:** Component renders
  - **Then:** Both texts display inside Well component
  - **File:** `tests/core/ui/components/feedback/EmptyState.test.tsx`

**Notes for EmptyState:**
- `Well` component may need to be replaced with a styled div
- Create `Well` wrapper component if needed

**Acceptance Criteria:**
- [ ] All 4 files migrated to React Aria imports
- [ ] No `UNSAFE_className` - converted to `className`
- [ ] StatusDisplay action buttons work correctly
- [ ] All variant icons render properly
- [ ] Existing tests pass

---

### Task 6.3: Migrate Navigation Components (3 files)

**Files:**
- [ ] `src/core/ui/components/navigation/BackButton.tsx`
- [ ] `src/core/ui/components/navigation/NavigationPanel.tsx`
- [ ] `src/core/ui/components/navigation/SearchHeader.tsx`

**Migration Pattern for BackButton:**
```typescript
// Before
import { ActionButton, Text } from '@adobe/react-spectrum';
import ChevronLeft from '@spectrum-icons/workflow/ChevronLeft';

<ActionButton isQuiet onPress={onPress}>
    <ChevronLeft size="S" />
    <Text>{label}</Text>
</ActionButton>

// After
import { ActionButton, Text } from '@/core/ui/components/aria';
import ChevronLeft from '@spectrum-icons/workflow/ChevronLeft';

<ActionButton isQuiet onPress={onPress}>
    <ChevronLeft size="S" />
    <Text>{label}</Text>
</ActionButton>
```

**Note:** Spectrum Icons (`@spectrum-icons/workflow`) remain unchanged - only the component imports change.

**Tests to Write First:**

- [ ] Test: BackButton renders with chevron icon
  - **Given:** BackButton with label="Back"
  - **When:** Component renders
  - **Then:** Button shows chevron icon and label
  - **File:** `tests/core/ui/components/navigation/BackButton.test.tsx` (existing)

- [ ] Test: BackButton calls onPress handler
  - **Given:** BackButton with onPress callback
  - **When:** User clicks button
  - **Then:** onPress is called once
  - **File:** `tests/core/ui/components/navigation/BackButton.test.tsx` (existing)

- [ ] Test: NavigationPanel renders sections
  - **Given:** NavigationPanel with sections array
  - **When:** Component renders
  - **Then:** All sections display with correct labels
  - **File:** `tests/core/ui/components/navigation/NavigationPanel.test.tsx`

- [ ] Test: SearchHeader shows search field when threshold met
  - **Given:** SearchHeader with items > searchThreshold
  - **When:** Component renders
  - **Then:** SearchField is visible
  - **File:** `tests/core/ui/components/navigation/SearchHeader.test.tsx`

**Acceptance Criteria:**
- [ ] All 3 files migrated
- [ ] BackButton tests pass (existing tests)
- [ ] NavigationPanel expands/collapses correctly
- [ ] SearchHeader filters work properly

---

### Task 6.4: Migrate Layout Components (2 files)

**Files:**
- [ ] `src/core/ui/components/layout/PageHeader.tsx`
- [ ] `src/core/ui/components/TimelineNav.tsx`

**Migration Pattern for PageHeader:**
```typescript
// Before
import { View, Flex, Heading, Text, Button } from '@adobe/react-spectrum';
<View padding="size-400" UNSAFE_className={cn('border-b', 'bg-gray-75', className)}>
    <Flex justifyContent="space-between" alignItems="start">
        <View>
            <Heading level={1}>{title}</Heading>
            {subtitle && (
                <Heading level={3} UNSAFE_className={cn('font-normal', 'text-gray-600')}>
                    {subtitle}
                </Heading>
            )}
        </View>
        {action}
    </Flex>
</View>

// After
import { View, Flex, Heading, Text, Button } from '@/core/ui/components/aria';
<View padding="size-400" className={cn('border-b', 'bg-gray-75', className)}>
    <Flex justifyContent="space-between" alignItems="start">
        <View>
            <Heading level={1}>{title}</Heading>
            {subtitle && (
                <Heading level={3} className={cn('font-normal', 'text-gray-600')}>
                    {subtitle}
                </Heading>
            )}
        </View>
        {action}
    </Flex>
</View>
```

**Tests to Write First:**

- [ ] Test: PageHeader renders title
  - **Given:** PageHeader with title="Your Projects"
  - **When:** Component renders
  - **Then:** H1 heading shows title text
  - **File:** `tests/core/ui/components/layout/PageHeader.test.tsx` (existing)

- [ ] Test: PageHeader renders optional subtitle
  - **Given:** PageHeader with subtitle="Step 1"
  - **When:** Component renders
  - **Then:** H3 heading shows subtitle
  - **File:** `tests/core/ui/components/layout/PageHeader.test.tsx` (existing)

- [ ] Test: TimelineNav renders steps
  - **Given:** TimelineNav with steps array
  - **When:** Component renders
  - **Then:** All steps display in order
  - **File:** `tests/core/ui/components/wizard/TimelineNav.test.tsx`

**Acceptance Criteria:**
- [ ] Both files migrated
- [ ] PageHeader tests pass (existing)
- [ ] TimelineNav step navigation works
- [ ] Styling consistent with current implementation

---

### Task 6.5: Migrate Wizard Components (2 files)

**Files:**
- [ ] `src/core/ui/components/wizard/ConfigurationSummary.tsx`
- [ ] `src/core/ui/components/wizard/configurationSummaryHelpers.tsx`

**Migration Pattern:**
```typescript
// Before
import { View, Heading, Text, Flex, Divider } from '@adobe/react-spectrum';

// After
import { View, Heading, Text, Flex, Divider } from '@/core/ui/components/aria';
```

**Tests to Write First:**

- [ ] Test: ConfigurationSummary renders organization status
  - **Given:** State with authenticated org
  - **When:** Component renders
  - **Then:** Org name displays with completed status
  - **File:** `tests/core/ui/components/wizard/ConfigurationSummary.test.tsx`

- [ ] Test: ConfigurationSummary shows pending status
  - **Given:** State without project selected
  - **When:** Component renders
  - **Then:** Project section shows pending status
  - **File:** `tests/core/ui/components/wizard/ConfigurationSummary.test.tsx`

**Acceptance Criteria:**
- [ ] Both files migrated
- [ ] Status icons render correctly
- [ ] Inline styles removed (use CSS classes)

---

### Task 6.6: Migrate ErrorBoundary (1 file)

**Files:**
- [ ] `src/core/ui/components/ErrorBoundary.tsx`

**Migration Pattern:**
```typescript
// Before
import { View, Text, Heading } from '@adobe/react-spectrum';
<View padding="size-400" backgroundColor="gray-100" borderRadius="medium">
    <Heading level={3}>Something went wrong</Heading>
    <Text>{error.message}</Text>
</View>

// After
import { View, Text, Heading } from '@/core/ui/components/aria';
<View padding="size-400" className="bg-gray-100 rounded-md border-l-4 border-red-500">
    <Heading level={3}>Something went wrong</Heading>
    <Text>{error.message}</Text>
</View>
```

**Tests to Write First:**

- [ ] Test: ErrorBoundary catches errors
  - **Given:** Child component that throws
  - **When:** Error occurs during render
  - **Then:** Error UI displays instead of crashing
  - **File:** `tests/core/ui/components/ErrorBoundary.test.tsx` (existing)

- [ ] Test: ErrorBoundary shows error message
  - **Given:** Error with message "Test error"
  - **When:** Error boundary catches it
  - **Then:** Message displays in error UI
  - **File:** `tests/core/ui/components/ErrorBoundary.test.tsx` (existing)

**Acceptance Criteria:**
- [ ] File migrated
- [ ] Existing tests pass
- [ ] Error UI styling preserved

---

### Task 6.7: Migrate Form Components (2 files)

**Files:**
- [ ] `src/core/ui/components/forms/FormField.tsx`
- [ ] `src/core/ui/components/forms/ConfigSection.tsx`

**Migration Pattern for FormField:**
```typescript
// Before
import { TextField, Picker, Item, Flex, Text } from '@adobe/react-spectrum';
<TextField
    label={renderLabel()}
    value={String(value)}
    onChange={handleChange}
    validationState={showError ? 'invalid' : undefined}
    errorMessage={showError ? error : undefined}
    width="100%"
/>

// After
import { TextField, Flex, Text } from '@/core/ui/components/aria';
// Note: Picker needs special handling - may need Select component
<TextField
    label={renderLabel()}
    value={String(value)}
    onChange={handleChange}
    isInvalid={showError}
    errorMessage={showError ? error : undefined}
/>
```

**Note on Picker:**
The `Picker` component from Spectrum needs to be replaced with a custom `Select` component or native select. This may require creating a new component in Step 4.5 (addendum).

**Tests to Write First:**

- [ ] Test: FormField renders text input
  - **Given:** FormField with type="text"
  - **When:** Component renders
  - **Then:** TextField renders with label
  - **File:** `tests/core/ui/components/forms/FormField.test.tsx`

- [ ] Test: FormField shows validation error
  - **Given:** FormField with showError=true, error="Required"
  - **When:** Component renders
  - **Then:** Error message displays
  - **File:** `tests/core/ui/components/forms/FormField.test.tsx`

- [ ] Test: ConfigSection renders heading and children
  - **Given:** ConfigSection with label and children
  - **When:** Component renders
  - **Then:** Section heading and content display
  - **File:** `tests/core/ui/components/forms/ConfigSection.test.tsx`

**Acceptance Criteria:**
- [ ] Both files migrated
- [ ] TextField validation works
- [ ] Picker/Select functionality preserved
- [ ] Help button integration works

---

### Task 6.8: Migrate Modal Component (1 file)

**Files:**
- [ ] `src/core/ui/components/ui/Modal.tsx`

**Migration Pattern:**
```typescript
// Before
import { Dialog, Heading, Content, Divider, Button } from '@adobe/react-spectrum';
<Dialog size={dialogSize}>
    <Heading>{title}</Heading>
    <Divider />
    <Content>{children}</Content>
</Dialog>

// After
import { Dialog, Heading, Divider, Button } from '@/core/ui/components/aria';
<Dialog size={dialogSize} title={title}>
    {children}
    <div className="modal-footer-actions">
        {/* Action buttons */}
    </div>
</Dialog>
```

**Tests to Write First:**

- [ ] Test: Modal renders with title
  - **Given:** Modal with title="Confirm Action"
  - **When:** Component renders
  - **Then:** Dialog shows title in heading
  - **File:** `tests/core/ui/components/ui/Modal.test.tsx` (existing)

- [ ] Test: Modal action buttons work
  - **Given:** Modal with actionButtons array
  - **When:** User clicks action button
  - **Then:** Button onPress callback fires
  - **File:** `tests/core/ui/components/ui/Modal.test.tsx` (existing)

**Acceptance Criteria:**
- [ ] File migrated
- [ ] Existing tests pass
- [ ] Focus trap works correctly
- [ ] Keyboard navigation (Escape to close) works

---

## Deferred Migrations

The following files are deferred to Step 7 or later due to complexity:

### WebviewApp.tsx
- Uses `Provider` and `defaultTheme` from Spectrum
- This is the theme provider - migration requires careful planning
- **Deferred to:** Step 9 (Theme System Migration)

### SearchableList.tsx
- Uses `ListView` and `Item` - complex virtualized list
- Needs custom implementation or external library
- **Deferred to:** Step 8 (Complex Component Migration)

### FieldHelpButton.tsx
- Uses `DialogTrigger`, `Tooltip`, `TooltipTrigger`
- Complex overlay composition
- **Deferred to:** Step 8 (Complex Component Migration)

---

## Estimated Effort

| Task | Files | Estimated Time |
|------|-------|----------------|
| 6.1 Simple Primitives | 5 | 1 hour |
| 6.2 Feedback Components | 4 | 2 hours |
| 6.3 Navigation Components | 3 | 1.5 hours |
| 6.4 Layout Components | 2 | 1 hour |
| 6.5 Wizard Components | 2 | 1 hour |
| 6.6 ErrorBoundary | 1 | 30 min |
| 6.7 Form Components | 2 | 2 hours |
| 6.8 Modal Component | 1 | 1 hour |
| **Total** | **20** | **10 hours** |

---

## Acceptance Criteria

- [ ] All 20 files migrated to `@/core/ui/components/aria` imports
- [ ] No `@adobe/react-spectrum` imports in migrated files
- [ ] No `UNSAFE_className` usage - all converted to `className`
- [ ] All existing tests pass (run full test suite)
- [ ] Visual regression: components render identically
- [ ] Functionality preserved: all interactions work
- [ ] Accessibility maintained: ARIA attributes preserved
- [ ] Build succeeds with no TypeScript errors

---

## Verification Commands

```bash
# Run all core/ui tests
npm test -- tests/core/ui/

# Check for remaining Spectrum imports
grep -r "from '@adobe/react-spectrum'" src/core/ui/components/

# Check for remaining UNSAFE_className
grep -r "UNSAFE_className" src/core/ui/components/

# Build verification
npm run build
```

---

## Rollback Instructions

If this step needs to be reverted:

1. **Revert import changes:** `git checkout src/core/ui/ src/webviews/shared/`
2. **Keep React Aria components:** Components created in Steps 2-5 remain intact
3. **Verify:** `npm run build && npm test`

**Rollback Impact:** Medium - reverts consumer migrations but preserves new component library.

**Note:** Each file can be individually reverted since migration is import-by-import.

---

## Notes

### Import Path Change
All Spectrum imports change from:
```typescript
import { X, Y, Z } from '@adobe/react-spectrum';
```
To:
```typescript
import { X, Y, Z } from '@/core/ui/components/aria';
```

### UNSAFE_className Removal
Replace all instances of:
```typescript
UNSAFE_className="some-class"
```
With:
```typescript
className="some-class"
```

### Spectrum Icons Unchanged
Icons from `@spectrum-icons/workflow` remain unchanged - they work independently of the component library.

### Size Tokens
Size tokens like `size-200`, `size-400` should work with the new components if they implement the same Spectrum token system. If not, convert to CSS values:
- `size-100` = `8px`
- `size-200` = `16px`
- `size-300` = `24px`
- `size-400` = `32px`
