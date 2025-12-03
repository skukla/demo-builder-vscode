# Step 11: Consolidate EmptyState Usage

## Status: SKIPPED - Composition Deemed Unnecessary

### Decision Summary

After thorough analysis, composition between `DashboardEmptyState` and `EmptyState` is **not practical** and would violate KISS/YAGNI principles.

### Analysis Findings

**1. API Incompatibility**
The plan assumed EmptyState had an `action` prop, but the actual API is:
```typescript
// Actual EmptyState API (no action support)
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  iconColor?: string;
  centered?: boolean;
}
```

**2. Different Semantic Purposes**
| Aspect | EmptyState | DashboardEmptyState |
|--------|-----------|-------------------|
| Purpose | Informational display | Call-to-action |
| Layout | Horizontal (icon | text) | Vertical (title, desc, button, icons) |
| Action | None | Button + 3 utility icons |
| AutoFocus | Not supported | Supported |

**3. Composition Would Require**
- Adding `action?: { label, onPress, icon?, autoFocus? }` prop
- Adding `layout?: 'horizontal' | 'vertical'` prop
- Major restructuring of internal layout
- Risk breaking existing usage in `SelectionStepContent`

**4. Rule of Three Violation**
Only 1 CTA empty state exists (DashboardEmptyState). Abstraction requires 3+ use cases.

**5. Minimal Shared Code**
Both components use React Spectrum primitives (Well, Flex, Text) - this is not meaningful duplication worth abstracting.

### Recommendation

Keep components separate. Each is optimized for its purpose:
- **EmptyState**: Simple informational display (5 props, horizontal layout)
- **DashboardEmptyState**: Complex CTA with utility icons (7 props, vertical layout)

### Future Consideration

If 2+ additional CTA-style empty states are needed, revisit composition:
1. Create `ActionableEmptyState` base component
2. Have `DashboardEmptyState` compose with it
3. Keep informational `EmptyState` separate

---

## Original Plan (For Reference)

## Test Requirements

### Test File
`tests/features/projects-dashboard/ui/components/DashboardEmptyState.test.tsx`

### Test Cases (Update Existing)

```typescript
describe('DashboardEmptyState', () => {
  describe('composition with EmptyState', () => {
    it('uses EmptyState component internally', () => {
      render(<DashboardEmptyState onCreate={mockOnCreate} />);

      // EmptyState provides structure
      expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument();
    });

    it('passes custom title to EmptyState', () => {
      render(<DashboardEmptyState onCreate={mockOnCreate} title="Custom Title" />);

      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('passes custom button text to EmptyState', () => {
      render(<DashboardEmptyState onCreate={mockOnCreate} buttonText="Create Demo" />);

      expect(screen.getByRole('button', { name: /create demo/i })).toBeInTheDocument();
    });
  });

  describe('dashboard-specific features', () => {
    it('renders utility icons when callbacks provided', () => {
      render(
        <DashboardEmptyState
          onCreate={mockOnCreate}
          onOpenDocs={mockOnOpenDocs}
          onOpenHelp={mockOnOpenHelp}
          onOpenSettings={mockOnOpenSettings}
        />
      );

      // Utility icons are dashboard-specific
      expect(screen.getAllByRole('button')).toHaveLength(4); // New + 3 icons
    });

    it('does not render utility icons when callbacks not provided', () => {
      render(<DashboardEmptyState onCreate={mockOnCreate} />);

      expect(screen.getAllByRole('button')).toHaveLength(1); // Only New button
    });
  });
});
```

## Implementation

### Current EmptyState API

First, review the generic EmptyState component:

**Location:** `src/core/ui/components/feedback/EmptyState.tsx`

```typescript
interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  icon?: React.ReactNode;
}
```

### Refactor DashboardEmptyState

**Location:** `src/features/projects-dashboard/ui/components/DashboardEmptyState.tsx`

**Before:**
```tsx
export function DashboardEmptyState({
  onCreate,
  title = 'No projects yet',
  buttonText = 'New Project',
  autoFocus = false,
  onOpenDocs,
  onOpenHelp,
  onOpenSettings,
}: DashboardEmptyStateProps): React.ReactElement {
  return (
    <Flex direction="column" alignItems="center" justifyContent="center" gap="size-200" marginTop="size-800">
      <Heading level={2} UNSAFE_className={cn('text-gray-700')}>
        {title}
      </Heading>
      <Text UNSAFE_className={cn('text-gray-600')}>
        Create your first demo project to get started
      </Text>
      <Button variant="accent" onPress={onCreate} autoFocus={autoFocus}>
        <Add size="S" />
        <Text>{buttonText}</Text>
      </Button>
      {/* Utility icons */}
      {(onOpenDocs || onOpenHelp || onOpenSettings) && (
        <Flex gap="size-100" marginTop="size-400">
          {onOpenDocs && <ActionButton isQuiet onPress={onOpenDocs}><HelpCircle size="S" /></ActionButton>}
          {onOpenHelp && <ActionButton isQuiet onPress={onOpenHelp}><QuestionMark size="S" /></ActionButton>}
          {onOpenSettings && <ActionButton isQuiet onPress={onOpenSettings}><Settings size="S" /></ActionButton>}
        </Flex>
      )}
    </Flex>
  );
}
```

**After:**
```tsx
import { EmptyState } from '@/core/ui/components/feedback';

export function DashboardEmptyState({
  onCreate,
  title = 'No projects yet',
  buttonText = 'New Project',
  autoFocus = false,
  onOpenDocs,
  onOpenHelp,
  onOpenSettings,
}: DashboardEmptyStateProps): React.ReactElement {
  const showUtilityIcons = onOpenDocs || onOpenHelp || onOpenSettings;

  return (
    <Flex direction="column" alignItems="center" justifyContent="center" gap="size-200" marginTop="size-800">
      {/* Compose with generic EmptyState */}
      <EmptyState
        title={title}
        description="Create your first demo project to get started"
        action={{
          label: buttonText,
          onPress: onCreate,
        }}
        icon={<Add size="L" />}
      />

      {/* Dashboard-specific: utility icons */}
      {showUtilityIcons && (
        <Flex gap="size-100" marginTop="size-400">
          {onOpenDocs && (
            <ActionButton isQuiet onPress={onOpenDocs} aria-label="Documentation">
              <HelpCircle size="S" />
            </ActionButton>
          )}
          {onOpenHelp && (
            <ActionButton isQuiet onPress={onOpenHelp} aria-label="Help">
              <QuestionMark size="S" />
            </ActionButton>
          )}
          {onOpenSettings && (
            <ActionButton isQuiet onPress={onOpenSettings} aria-label="Settings">
              <Settings size="S" />
            </ActionButton>
          )}
        </Flex>
      )}
    </Flex>
  );
}
```

### Verify EmptyState Supports Needed Features

If EmptyState doesn't support the action button or icon, update it:

```typescript
// src/core/ui/components/feedback/EmptyState.tsx
interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: {
    label: string;
    onPress: () => void;
    icon?: React.ReactNode;  // Add icon support
    autoFocus?: boolean;     // Add autoFocus support
  };
  icon?: React.ReactNode;
}
```

## Verification

```bash
# Run DashboardEmptyState tests
npm run test:fast -- tests/features/projects-dashboard/ui/components/DashboardEmptyState.test.tsx

# Run EmptyState tests
npm run test:fast -- tests/webview-ui/shared/components/feedback/EmptyState.test.tsx

# Verify build
npm run compile

# Visual verification (manual)
# - Open extension with no projects
# - Verify empty state displays correctly
# - Verify utility icons work (if applicable)
```

## Acceptance Criteria

- [ ] DashboardEmptyState uses EmptyState internally
- [ ] All existing props still work
- [ ] Utility icons (dashboard-specific) still render correctly
- [ ] Visual appearance unchanged
- [ ] All tests pass
- [ ] No regressions in other EmptyState usages

## Dependencies

- Generic EmptyState component must exist and support:
  - `title` prop
  - `description` prop
  - `action` prop with `label` and `onPress`
  - `icon` prop (optional)

## Notes

- This is a refactoring step - no new functionality
- The goal is composition, not replacement
- DashboardEmptyState keeps its unique features (utility icons)
- Other components using EmptyState should continue to work
