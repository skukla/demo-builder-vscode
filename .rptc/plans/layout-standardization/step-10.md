# Step 10: Update Webview Documentation

## Purpose

Create comprehensive documentation for layout components and Spectrum token translation to guide future developers on when and how to use GridLayout, TwoColumnLayout, and direct Spectrum components. This documentation establishes patterns for consistent layout implementation across the webview UI layer.

## Prerequisites

- [ ] Steps 1-9 completed (spectrumTokens utility, layout components enhanced, migrations complete)
- [ ] All visual validations passed (no regressions introduced)
- [ ] TypeScript compilation passing (token types enforced)

## Validation Criteria (Documentation Quality)

Since this is a documentation step, we validate completeness rather than write code tests:

### Documentation Completeness Checklist

- [ ] **Component Overview Section**
  - Clearly explains purpose of GridLayout and TwoColumnLayout
  - Lists available layout components with brief descriptions
  - Provides decision tree for component selection

- [ ] **Usage Examples Section**
  - Includes 3+ complete code examples for each layout component
  - Shows both Spectrum token and pixel value usage
  - Demonstrates responsive layout patterns

- [ ] **Token Translation Documentation**
  - Explains spectrumTokens utility purpose and location
  - Documents all 13 supported tokens with pixel equivalents
  - Shows how to extend token mapping if needed

- [ ] **Pattern Guidelines Section**
  - When to use GridLayout (card grids, form fields, icon rows)
  - When to use TwoColumnLayout (split views with summary panels)
  - When to use Spectrum Flex directly (simple stacking)

- [ ] **Migration Examples**
  - Before/after code comparisons showing migration patterns
  - Common pitfalls and how to avoid them
  - Visual validation tips

- [ ] **API Reference Section**
  - Complete prop documentation for GridLayout
  - Complete prop documentation for TwoColumnLayout
  - Type signatures and descriptions

## Files to Create

- [ ] `webview-ui/src/shared/components/CLAUDE.md` - Primary documentation file for layout components

## Implementation Details

### Documentation Content Structure

The documentation file should follow this structure to match the existing hooks documentation pattern:

```markdown
# Layout Components

## Overview

[Purpose and scope of custom layout components]

## Architecture

[Visual diagram showing component hierarchy and relationships]

## Component Categories

### Layout Components
[GridLayout, TwoColumnLayout descriptions]

### Token Translation
[spectrumTokens utility documentation]

## Component Reference

### GridLayout
[Complete API reference with examples]

### TwoColumnLayout
[Complete API reference with examples]

## Token Translation

### spectrumTokens Utility
[How to use token translation]

### Supported Tokens
[Complete token mapping table]

## Usage Patterns

### Pattern 1: Card Grid Layouts
[When and how to use GridLayout]

### Pattern 2: Split View with Summary
[When and how to use TwoColumnLayout]

### Pattern 3: Simple Stacking
[When to use Spectrum Flex directly]

## Decision Tree

[Flow chart helping developers choose the right component]

## Best Practices

[Guidelines for consistent layout implementation]

## Migration Guide

[How to migrate from manual div structures]

## Examples

[Complete working examples]
```

### Detailed Documentation Content

Create `webview-ui/src/shared/components/CLAUDE.md` with the following comprehensive content:

````markdown
# Layout Components

## Overview

This directory contains custom layout components that provide consistent spacing, responsive behavior, and Adobe Spectrum design token integration. These components simplify common layout patterns while maintaining type safety and visual consistency.

## Architecture

```
components/
├── layouts/
│   ├── GridLayout.tsx            # Multi-column responsive grids
│   └── TwoColumnLayout.tsx       # Split view with left/right panels
├── utils/
│   └── spectrumTokens.ts         # Token translation utility
├── index.ts                      # Barrel exports
└── CLAUDE.md                     # This file - layout documentation
```

## Component Categories

### Layout Components

**GridLayout** - Responsive multi-column grid layouts with automatic wrapping
- **Use for:** Card grids, form field rows, icon arrays, button groups
- **Key features:** Responsive column counts, uniform spacing, vertical alignment control

**TwoColumnLayout** - Two-column split view with independent scrolling
- **Use for:** Selection views with summary panels, wizard steps with persistent info
- **Key features:** Fixed right panel, scrollable left content, gray divider styling

### Token Translation Utility

**spectrumTokens** - Converts Adobe Spectrum design tokens to pixel values
- **Location:** `webview-ui/src/shared/utils/spectrumTokens.ts`
- **Purpose:** Enables type-safe token usage in custom components
- **Exports:** `translateSpectrumToken()` function, `DimensionValue` type

## Token Translation

### spectrumTokens Utility

The `spectrumTokens` utility bridges Adobe Spectrum design tokens and custom CSS-in-JS components.

**Import:**
```typescript
import { translateSpectrumToken, DimensionValue } from '@/webview-ui/shared/utils/spectrumTokens';
```

**Function Signature:**
```typescript
function translateSpectrumToken(value: DimensionValue | undefined): string | undefined
```

**Usage:**
```typescript
const gap = translateSpectrumToken('size-300'); // '24px'
const padding = translateSpectrumToken(16);      // '16px'
const maxWidth = translateSpectrumToken('800px'); // '800px'
```

### Supported Tokens

Complete token mapping based on Adobe Spectrum Design System (1 unit = 8px):

| Token | Pixel Value | Common Use |
|-------|-------------|------------|
| `size-50` | 4px | Minimal spacing, tight gaps |
| `size-100` | 8px | Compact spacing, icon gaps |
| `size-115` | 9.2px | Rare, specific Spectrum components |
| `size-130` | 10.4px | Rare, specific Spectrum components |
| `size-150` | 12px | Small spacing, form field gaps |
| `size-160` | 12.8px | Rare, specific Spectrum components |
| `size-200` | 16px | Standard spacing, button gaps |
| `size-300` | 24px | **Most common** - section spacing, padding |
| `size-400` | 32px | Large spacing, section margins |
| `size-500` | 40px | Extra large spacing |
| `size-600` | 48px | XL spacing, major section gaps |
| `size-1000` | 80px | XXL spacing, page-level margins |
| `size-6000` | 480px | Max content widths, layout constraints |

**Most Used Tokens:**
- `size-300` (24px) - Default padding, section spacing
- `size-200` (16px) - Element gaps, compact padding
- `size-100` (8px) - Tight spacing, icon gaps

### DimensionValue Type

TypeScript type for layout props accepting tokens, pixel strings, or numbers:

```typescript
type SpectrumSizeToken = 'size-50' | 'size-100' | ... | 'size-6000';
type DimensionValue = SpectrumSizeToken | `${number}px` | number;
```

**Type Safety:**
```typescript
// ✅ Valid - compile-time safe
const gap1: DimensionValue = 'size-300';
const gap2: DimensionValue = 24;
const gap3: DimensionValue = '24px';

// ❌ Invalid - TypeScript error
const gap4: DimensionValue = 'size-999'; // Not in SpectrumSizeToken union
const gap5: DimensionValue = 'invalid';  // Not a valid token or px string
```

### Extending Token Mapping

To add new tokens (e.g., future Spectrum updates):

1. **Add to type union** in `spectrumTokens.ts`:
```typescript
export type SpectrumSizeToken =
    | 'size-50'
    // ... existing tokens ...
    | 'size-700'; // NEW token
```

2. **Add to mapping object**:
```typescript
const SPECTRUM_TOKEN_MAP: Record<SpectrumSizeToken, string> = {
    'size-50': '4px',
    // ... existing mappings ...
    'size-700': '56px' // NEW mapping (calculated: 7 × 8px)
};
```

3. **Add test cases** in `spectrumTokens.test.ts`:
```typescript
it('translates size-700 to 56px', () => {
    expect(translateSpectrumToken('size-700')).toBe('56px');
});
```

## Component Reference

### GridLayout

**Purpose:** Responsive multi-column grid layout with consistent spacing and alignment.

**Props:**
```typescript
interface GridLayoutProps {
    children: React.ReactNode;           // Grid items
    columns?: number;                     // Column count (default: 3)
    gap?: DimensionValue;                // Gap between items (default: 'size-300' = 24px)
    padding?: DimensionValue;            // Internal padding (default: '0')
    alignItems?: 'start' | 'center' | 'end'; // Vertical alignment (default: 'start')
    justifyContent?: 'start' | 'center' | 'end' | 'space-between'; // Horizontal distribution (default: 'start')
    maxWidth?: DimensionValue;           // Maximum container width (default: none)
}
```

**Example 1: Simple 3-Column Card Grid**
```tsx
import { GridLayout } from '@/webview-ui/shared/components/layouts/GridLayout';

<GridLayout columns={3} gap="size-300">
    <Card>Item 1</Card>
    <Card>Item 2</Card>
    <Card>Item 3</Card>
    <Card>Item 4</Card>
</GridLayout>
```

**Example 2: Button Group with Tight Spacing**
```tsx
<GridLayout columns={4} gap="size-100" alignItems="center">
    <Button>Save</Button>
    <Button>Cancel</Button>
    <Button>Delete</Button>
    <Button>Export</Button>
</GridLayout>
```

**Example 3: Form Field Row with Pixel Values**
```tsx
<GridLayout columns={2} gap={16} padding={24} maxWidth="800px">
    <TextField label="First Name" />
    <TextField label="Last Name" />
</GridLayout>
```

**When to Use GridLayout:**
- ✅ Multiple items in rows (cards, buttons, form fields)
- ✅ Need responsive wrapping behavior
- ✅ Want consistent spacing between all items
- ✅ Simple equal-width columns

**When NOT to Use GridLayout:**
- ❌ Single-column layouts (use Spectrum Flex)
- ❌ Need complex column sizing (60% left, 40% right) - use TwoColumnLayout
- ❌ Nested grids within grids (prefer flat structure)

---

### TwoColumnLayout

**Purpose:** Two-column split view with left content area and right summary panel. Used extensively in wizard steps for selection + summary pattern.

**Props:**
```typescript
interface TwoColumnLayoutProps {
    leftContent: React.ReactNode;        // Main content (left column)
    rightContent: React.ReactNode;       // Summary panel (right column)
    leftMaxWidth?: DimensionValue;       // Max width of left column (default: '800px')
    leftPadding?: DimensionValue;        // Left column padding (default: 'size-300' = 24px)
    rightPadding?: DimensionValue;       // Right column padding (default: 'size-300' = 24px)
    gap?: DimensionValue;                // Gap between columns (default: '0')
    leftMaxWidth?: DimensionValue;       // Max width constraint for left content
}
```

**Styling Features:**
- Left column: Scrollable, constrained width (default 800px)
- Right column: Fixed position, gray background (#F5F5F5), 1px gray border
- Responsive: Stacks vertically on narrow screens (handled by Spectrum)

**Example 1: Wizard Step with Summary Panel**
```tsx
import { TwoColumnLayout } from '@/webview-ui/shared/components/layouts/TwoColumnLayout';

<TwoColumnLayout
    leftContent={
        <>
            <Heading level={2}>Select Project</Heading>
            <ListView items={projects} />
            <Button onClick={handleContinue}>Continue</Button>
        </>
    }
    rightContent={
        <ConfigurationSummary state={state} />
    }
    leftMaxWidth="800px"
    leftPadding="size-300"
    rightPadding="size-300"
/>
```

**Example 2: Dashboard with Side Panel**
```tsx
<TwoColumnLayout
    leftContent={
        <ProjectDashboard project={currentProject} />
    }
    rightContent={
        <ProjectInfo project={currentProject} />
    }
    leftMaxWidth="1000px"
    leftPadding="size-400"
    rightPadding="size-400"
    gap="size-200"
/>
```

**Example 3: Compact Split View**
```tsx
<TwoColumnLayout
    leftContent={<ComponentSelector />}
    rightContent={<ComponentDetails />}
    leftMaxWidth="600px"
    leftPadding={16}
    rightPadding={16}
    gap={0}
/>
```

**When to Use TwoColumnLayout:**
- ✅ Wizard steps with selection + summary pattern
- ✅ Main content + persistent info panel
- ✅ 60/40 or 70/30 split layouts
- ✅ Need independent scrolling for each column
- ✅ Want gray divider styling (built-in)

**When NOT to Use TwoColumnLayout:**
- ❌ Simple horizontal layouts (use Spectrum Flex)
- ❌ More than 2 columns (use GridLayout or nested Flex)
- ❌ Equal-width columns (use GridLayout columns={2})
- ❌ No clear "main content" vs "summary" distinction

---

## Usage Patterns

### Pattern 1: Card Grid Layouts (GridLayout)

**Use Case:** Display multiple cards, icons, or buttons in a responsive grid.

**Example: Component Selection Cards**
```tsx
import { GridLayout } from '@/webview-ui/shared/components/layouts/GridLayout';

function ComponentSelectionStep() {
    return (
        <div>
            <Heading level={2}>Select Components</Heading>
            <GridLayout columns={3} gap="size-300" padding="size-300">
                {components.map(component => (
                    <Card key={component.id}>
                        <Heading level={4}>{component.name}</Heading>
                        <Text>{component.description}</Text>
                    </Card>
                ))}
            </GridLayout>
        </div>
    );
}
```

**Key Decisions:**
- `columns={3}` - Shows 3 cards per row on wide screens
- `gap="size-300"` - 24px between cards (standard spacing)
- `padding="size-300"` - 24px around entire grid

---

### Pattern 2: Split View with Summary (TwoColumnLayout)

**Use Case:** Main content area with persistent summary/info panel.

**Example: Adobe Project Selection**
```tsx
import { TwoColumnLayout } from '@/webview-ui/shared/components/layouts/TwoColumnLayout';

function AdobeProjectStep({ state, completedSteps }) {
    return (
        <TwoColumnLayout
            leftContent={
                <>
                    <Heading level={2}>Select Project</Heading>
                    <SearchField value={searchQuery} onChange={setSearchQuery} />
                    <ListView items={filteredProjects} onSelectionChange={handleSelect} />
                    <ButtonGroup>
                        <Button variant="secondary" onPress={handleBack}>Back</Button>
                        <Button variant="primary" onPress={handleContinue}>Continue</Button>
                    </ButtonGroup>
                </>
            }
            rightContent={
                <ConfigurationSummary state={state} completedSteps={completedSteps} />
            }
            leftMaxWidth="800px"
            leftPadding="size-300"
            rightPadding="size-300"
        />
    );
}
```

**Key Decisions:**
- `leftMaxWidth="800px"` - Constrains main content for readability
- Both columns `padding="size-300"` - Consistent 24px padding
- `gap="0"` (default) - No gap, border provides visual separation

---

### Pattern 3: Simple Stacking (Spectrum Flex)

**Use Case:** Simple vertical or horizontal stacks without complex layout needs.

**Example: Vertical Stack of Form Fields**
```tsx
import { Flex } from '@adobe/react-spectrum';

function ConfigureScreen() {
    return (
        <Flex direction="column" gap="size-300">
            <Heading level={2}>Configuration</Heading>
            <TextField label="Project Name" />
            <TextField label="API Key" />
            <Button variant="primary">Save</Button>
        </Flex>
    );
}
```

**When to Use Spectrum Flex Directly:**
- ✅ Simple vertical stacks (1 column)
- ✅ Simple horizontal stacks (1 row)
- ✅ No complex responsive behavior needed
- ✅ Standard Spectrum gap tokens work natively

**Key Point:** Spectrum Flex's `gap` prop supports tokens natively (`gap="size-300"`), so custom layouts aren't needed for simple stacking.

---

## Decision Tree

### Should I use a custom layout component?

```
Start: Need to lay out multiple elements
│
├─ Is it a simple vertical or horizontal stack?
│  └─ YES → Use Spectrum Flex directly
│     └─ Example: <Flex direction="column" gap="size-300">
│
├─ Need multiple columns with equal widths?
│  └─ YES → Use GridLayout
│     └─ Example: <GridLayout columns={3} gap="size-300">
│
├─ Need 2 columns with different purposes (main + summary)?
│  └─ YES → Use TwoColumnLayout
│     └─ Example: <TwoColumnLayout leftContent={...} rightContent={...}>
│
└─ Complex custom layout?
   └─ Start with native CSS Grid or Flex, consider extracting pattern later
```

### Quick Reference Table

| Scenario | Component | Example |
|----------|-----------|---------|
| Vertical stack of elements | Spectrum Flex | `<Flex direction="column">` |
| Horizontal row of buttons | Spectrum Flex | `<Flex direction="row" gap="size-200">` |
| 3-column card grid | GridLayout | `<GridLayout columns={3}>` |
| Form fields in 2 columns | GridLayout | `<GridLayout columns={2}>` |
| Selection + summary panel | TwoColumnLayout | `<TwoColumnLayout leftContent={...} rightContent={...}>` |
| Wizard step with side info | TwoColumnLayout | Same as above |
| Complex nested layout | Custom CSS Grid | Manual implementation |

---

## Best Practices

### 1. Prefer Spectrum Tokens Over Pixel Values

**Why:** Tokens provide consistency, theme compatibility, and future-proof scaling.

```tsx
// ✅ Good - uses Spectrum token
<GridLayout gap="size-300" padding="size-300" />

// ⚠️ Acceptable - explicit pixel value
<GridLayout gap={24} padding={24} />

// ❌ Avoid - hardcoded string (no type safety)
<GridLayout gap="24px" padding="24px" />
```

**Exception:** When matching existing pixel-based designs or integrating with non-Spectrum code, pixel values are acceptable.

---

### 2. Constrain Content Width for Readability

**Why:** Wide text blocks (>800px) reduce readability. Constrain main content areas.

```tsx
// ✅ Good - constrains width for readability
<TwoColumnLayout leftMaxWidth="800px" ... />

// ⚠️ Less ideal - unconstrained width
<TwoColumnLayout ... /> // Left column could stretch too wide
```

**Recommended Max Widths:**
- Text-heavy content: 600-800px
- Form fields: 600-1000px
- Card grids: Unconstrained (responsive wrapping handles width)

---

### 3. Use Consistent Padding Values

**Why:** Consistent spacing creates visual harmony and predictable layouts.

**Standard Padding Values:**
- `size-300` (24px) - **Most common** - section padding, card interiors
- `size-200` (16px) - Compact padding, tight layouts
- `size-400` (32px) - Generous padding, major sections

```tsx
// ✅ Good - consistent standard padding
<TwoColumnLayout leftPadding="size-300" rightPadding="size-300" />

// ⚠️ Inconsistent - mixing different values without reason
<TwoColumnLayout leftPadding="size-200" rightPadding="size-400" />
```

---

### 4. Avoid Deeply Nested Layout Components

**Why:** Nested layouts increase complexity and can cause layout conflicts.

```tsx
// ❌ Avoid - nested layout components
<TwoColumnLayout
    leftContent={
        <GridLayout columns={2}>
            <GridLayout columns={3}>
                {/* Too much nesting */}
            </GridLayout>
        </GridLayout>
    }
/>

// ✅ Better - flatten structure
<TwoColumnLayout
    leftContent={
        <GridLayout columns={3}>
            {/* Single level of layout */}
        </GridLayout>
    }
/>
```

**Rule of Thumb:** Maximum 1-2 levels of layout nesting.

---

### 5. Validate with Multiple Content Scenarios

**Why:** Layouts should work with varying content amounts (short lists, long lists, empty states).

**Test Scenarios:**
- Empty state (no items)
- Single item
- Few items (2-3)
- Many items (20+, requires scrolling)
- Mixed content heights

```tsx
// ✅ Good - handles empty state explicitly
<GridLayout columns={3} gap="size-300">
    {items.length === 0 ? (
        <EmptyState message="No items found" />
    ) : (
        items.map(item => <Card key={item.id}>{item.name}</Card>)
    )}
</GridLayout>
```

---

## Migration Guide

### Migrating from Manual Div Structures to Layout Components

**Common Pattern:** Replace manual flex div layouts with TwoColumnLayout.

#### Before: Manual Two-Column Div Structure

```tsx
return (
    <div style={{ display: 'flex', height: '100%', width: '100%', gap: '0' }}>
        {/* Left: Main Content */}
        <div style={{
            maxWidth: '800px',
            width: '100%',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <Heading level={2}>Select Project</Heading>
            <ListView items={projects} />
            <Button onPress={handleContinue}>Continue</Button>
        </div>

        {/* Right: Summary Panel */}
        <div style={{
            flex: '1',
            padding: '24px',
            backgroundColor: 'var(--spectrum-global-color-gray-75)',
            borderLeft: '1px solid var(--spectrum-global-color-gray-200)'
        }}>
            <ConfigurationSummary state={state} />
        </div>
    </div>
);
```

**Lines of Code:** ~30 lines for layout structure

---

#### After: TwoColumnLayout Component

```tsx
import { TwoColumnLayout } from '@/webview-ui/shared/components/layouts/TwoColumnLayout';

return (
    <TwoColumnLayout
        leftContent={
            <>
                <Heading level={2}>Select Project</Heading>
                <ListView items={projects} />
                <Button onPress={handleContinue}>Continue</Button>
            </>
        }
        rightContent={
            <ConfigurationSummary state={state} />
        }
        leftMaxWidth="800px"
        leftPadding="size-300"
        rightPadding="size-300"
    />
);
```

**Lines of Code:** ~17 lines (43% reduction)

**Benefits:**
- ✅ ~40% less code
- ✅ Type-safe token usage (`size-300`)
- ✅ Consistent gray panel styling (built-in)
- ✅ Centralized responsive behavior
- ✅ Easier to maintain

---

### Migration Steps

**Step 1: Identify Manual Layout Pattern**

Look for:
- Manual `display: flex` divs with `maxWidth` constraints
- Two-column structures with gray background on right
- Inline padding/gap styles

**Step 2: Import TwoColumnLayout**

```tsx
import { TwoColumnLayout } from '@/webview-ui/shared/components/layouts/TwoColumnLayout';
```

**Step 3: Extract Content**

Copy content from left div → `leftContent` prop
Copy content from right div → `rightContent` prop

**Step 4: Map Styles to Props**

| Inline Style | Component Prop | Example |
|--------------|----------------|---------|
| `maxWidth: '800px'` | `leftMaxWidth` | `leftMaxWidth="800px"` |
| `padding: '24px'` (left) | `leftPadding` | `leftPadding="size-300"` |
| `padding: '24px'` (right) | `rightPadding` | `rightPadding="size-300"` |
| `gap: '0'` | `gap` | `gap="0"` (default) |

**Step 5: Visual Validation**

1. Open application in browser (before migration)
2. Take screenshot of original layout
3. Apply migration changes
4. Compare side-by-side for visual parity
5. Test responsive behavior (resize window)
6. Test scrolling with long content

---

### Common Migration Pitfalls

**Pitfall 1: Forgetting to wrap extracted content in fragments**

```tsx
// ❌ Invalid - multiple children without wrapper
leftContent={
    <Heading>Title</Heading>
    <ListView items={items} />
}

// ✅ Valid - wrapped in fragment
leftContent={
    <>
        <Heading>Title</Heading>
        <ListView items={items} />
    </>
}
```

---

**Pitfall 2: Not matching original maxWidth constraints**

```tsx
// ❌ Forgot to set leftMaxWidth
<TwoColumnLayout ... /> // Left column might be too wide

// ✅ Constrained to original 800px
<TwoColumnLayout leftMaxWidth="800px" ... />
```

---

**Pitfall 3: Mixing tokens and pixel values inconsistently**

```tsx
// ⚠️ Inconsistent - mixing px and tokens
<TwoColumnLayout leftPadding="24px" rightPadding="size-300" />

// ✅ Consistent - both use tokens
<TwoColumnLayout leftPadding="size-300" rightPadding="size-300" />
```

---

## Real-World Examples

### Example 1: Wizard Step with Search and Refresh

**File:** `webview-ui/src/wizard/steps/AdobeProjectStep.tsx`

```tsx
import { TwoColumnLayout } from '@/webview-ui/shared/components/layouts/TwoColumnLayout';

export function AdobeProjectStep({ state, completedSteps, updateState }: StepProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    return (
        <TwoColumnLayout
            leftContent={
                <>
                    <Heading level={2} marginBottom="size-300">
                        Select Adobe Project
                    </Heading>

                    <Flex direction="row" gap="size-200" marginBottom="size-300">
                        <SearchField
                            value={searchQuery}
                            onChange={setSearchQuery}
                            width="100%"
                        />
                        <ActionButton onPress={handleRefresh}>
                            <Refresh />
                        </ActionButton>
                    </Flex>

                    <ListView
                        items={filteredProjects}
                        selectedKeys={selectedProject ? [selectedProject.id] : []}
                        onSelectionChange={handleSelection}
                    >
                        {(item) => <Item key={item.id}>{item.title}</Item>}
                    </ListView>

                    <ButtonGroup marginTop="size-300">
                        <Button variant="secondary" onPress={handleBack}>Back</Button>
                        <Button variant="primary" onPress={handleContinue}>Continue</Button>
                    </ButtonGroup>
                </>
            }
            rightContent={
                <ConfigurationSummary
                    state={state}
                    completedSteps={completedSteps}
                    currentStep={state.currentStep}
                />
            }
            leftMaxWidth="800px"
            leftPadding="size-300"
            rightPadding="size-300"
        />
    );
}
```

**Key Features:**
- Search field and refresh button in Flex row (24px gap)
- ListView for project selection
- ButtonGroup for navigation
- ConfigurationSummary in right panel (persistent)
- 800px max-width on left for readability
- Consistent 24px padding (`size-300`)

---

### Example 2: Dashboard with Component Grid

**File:** `webview-ui/src/dashboard/ProjectDashboardScreen.tsx`

```tsx
import { GridLayout } from '@/webview-ui/shared/components/layouts/GridLayout';
import { TwoColumnLayout } from '@/webview-ui/shared/components/layouts/TwoColumnLayout';

export function ProjectDashboardScreen() {
    return (
        <TwoColumnLayout
            leftContent={
                <>
                    <Heading level={1}>Project Dashboard</Heading>

                    <Heading level={3} marginTop="size-400">Installed Components</Heading>
                    <GridLayout columns={3} gap="size-300" padding="size-200">
                        {components.map(component => (
                            <Card key={component.id}>
                                <Heading level={4}>{component.name}</Heading>
                                <Text>{component.version}</Text>
                            </Card>
                        ))}
                    </GridLayout>

                    <Heading level={3} marginTop="size-400">Quick Actions</Heading>
                    <GridLayout columns={4} gap="size-200">
                        <ActionButton onPress={handleStart}>Start</ActionButton>
                        <ActionButton onPress={handleStop}>Stop</ActionButton>
                        <ActionButton onPress={handleDeploy}>Deploy Mesh</ActionButton>
                        <ActionButton onPress={handleConfigure}>Configure</ActionButton>
                    </GridLayout>
                </>
            }
            rightContent={
                <ProjectInfo project={currentProject} />
            }
            leftMaxWidth="1000px"
            leftPadding="size-400"
            rightPadding="size-400"
        />
    );
}
```

**Key Features:**
- Nested GridLayout within TwoColumnLayout (acceptable for distinct sections)
- Component cards in 3-column grid
- Action buttons in 4-column grid with tighter spacing
- Wider max-width (1000px) for dashboard
- Generous padding (`size-400` = 32px)

---

### Example 3: Simple Form with GridLayout

**File:** `webview-ui/src/configure/ConfigureScreen.tsx`

```tsx
import { GridLayout } from '@/webview-ui/shared/components/layouts/GridLayout';

export function ConfigureScreen() {
    return (
        <Flex direction="column" gap="size-400" padding="size-400" maxWidth="1000px">
            <Heading level={1}>Project Configuration</Heading>

            <Heading level={3} marginTop="size-300">API Keys</Heading>
            <GridLayout columns={2} gap="size-300">
                <TextField label="Adobe IMS Client ID" />
                <TextField label="Adobe IMS Client Secret" type="password" />
            </GridLayout>

            <Heading level={3} marginTop="size-300">Project Settings</Heading>
            <GridLayout columns={2} gap="size-300">
                <TextField label="Project Name" />
                <TextField label="Project ID" />
                <NumberField label="Port" defaultValue={3000} />
                <Checkbox>Enable Debug Mode</Checkbox>
            </GridLayout>

            <Button variant="primary" onPress={handleSave}>Save Configuration</Button>
        </Flex>
    );
}
```

**Key Features:**
- Outer Flex for vertical stacking (sections)
- GridLayout for 2-column form fields
- Consistent gaps (`size-300` = 24px)
- Max-width constraint (1000px) for form readability
- Mixed field types (TextField, NumberField, Checkbox)

---

## Performance Considerations

### Rendering Performance

**Layout components are lightweight:**
- No state management (stateless functional components)
- Minimal props processing (token translation cached)
- Standard React rendering (no custom optimizations needed)

**Best Practices:**
- Avoid recreating content props on every render (use `useMemo` for expensive computations)
- Don't pass inline functions as content (define handlers outside render)

```tsx
// ⚠️ Less optimal - recreates content on every render
<TwoColumnLayout
    leftContent={items.map(item => <Card>{item.name}</Card>)}
    rightContent={<Summary />}
/>

// ✅ Better - memoize expensive content generation
const leftContent = useMemo(
    () => items.map(item => <Card key={item.id}>{item.name}</Card>),
    [items]
);

<TwoColumnLayout leftContent={leftContent} rightContent={<Summary />} />
```

---

### Token Translation Performance

**translateSpectrumToken() is fast:**
- O(1) lookup in object map
- No regex parsing
- No DOM manipulation

**No performance concerns for typical usage** (hundreds of components).

---

## Troubleshooting

### Issue 1: Token not translating correctly

**Symptom:** `gap="size-300"` renders as `gap: 0px` instead of `24px`

**Causes:**
1. Using Spectrum component's native gap prop (no translation needed)
2. Using custom component without token translation
3. Typo in token name (`size-3000` instead of `size-300`)

**Solution:**
- Spectrum components: Tokens work natively, no utility needed
- Custom components: Use `translateSpectrumToken()`
- Check spelling: Use TypeScript autocomplete for valid tokens

---

### Issue 2: TypeScript error on token prop

**Symptom:** `Type '"size-999"' is not assignable to type 'DimensionValue'`

**Cause:** Invalid token not in SpectrumSizeToken union

**Solution:**
- Use valid token from supported list (see table above)
- Or use pixel value: `gap={24}` or `gap="24px"`
- If token should be supported, extend mapping (see "Extending Token Mapping")

---

### Issue 3: Layout breaks on resize

**Symptom:** Columns overlap or break unexpectedly when window resized

**Cause:** Missing responsive handling or conflicting parent styles

**Solution:**
- Ensure parent container doesn't constrain width too much
- Check for conflicting CSS (overflow, max-width, flex-basis)
- Test with various viewport widths (900px, 600px, 400px)

---

### Issue 4: Content overflows right panel

**Symptom:** ConfigurationSummary extends beyond viewport height

**Cause:** Right panel content too tall, no scrolling defined

**Solution:**
- TwoColumnLayout handles overflow automatically
- Check if parent container has fixed height constraint
- Add explicit `overflow-y: auto` if needed

---

## Testing Recommendations

### Manual Visual Testing

**For each layout component usage, validate:**

1. **Visual Parity** (after migration)
   - Take before/after screenshots
   - Compare side-by-side
   - Check spacing, colors, borders

2. **Responsive Behavior**
   - Test at 1920px, 1280px, 900px, 600px widths
   - Verify columns stack correctly on narrow screens
   - Check scrolling behavior

3. **Content Scenarios**
   - Empty state (0 items)
   - Single item
   - Many items (20+, requires scrolling)
   - Mixed heights

4. **Interactive Elements**
   - Buttons still clickable
   - Search fields functional
   - ListViews scroll correctly
   - Focus states visible

---

### Automated Testing (Future)

**Component tests to write:**

```typescript
// GridLayout.test.tsx
describe('GridLayout', () => {
    it('renders children in grid', () => {
        render(<GridLayout columns={3}><div>Item</div></GridLayout>);
        expect(screen.getByText('Item')).toBeInTheDocument();
    });

    it('applies token translation for gap', () => {
        const { container } = render(<GridLayout gap="size-300"><div>Item</div></GridLayout>);
        const grid = container.firstChild;
        expect(grid).toHaveStyle({ gap: '24px' });
    });
});

// TwoColumnLayout.test.tsx
describe('TwoColumnLayout', () => {
    it('renders left and right content', () => {
        render(
            <TwoColumnLayout
                leftContent={<div>Left</div>}
                rightContent={<div>Right</div>}
            />
        );
        expect(screen.getByText('Left')).toBeInTheDocument();
        expect(screen.getByText('Right')).toBeInTheDocument();
    });

    it('applies leftMaxWidth prop', () => {
        const { container } = render(
            <TwoColumnLayout
                leftContent={<div>Left</div>}
                rightContent={<div>Right</div>}
                leftMaxWidth="800px"
            />
        );
        const leftColumn = container.querySelector('[style*="max-width"]');
        expect(leftColumn).toHaveStyle({ maxWidth: '800px' });
    });
});
```

---

## Future Enhancements

Potential improvements to layout system:

### 1. Responsive Column Counts
**GridLayout with breakpoint-based columns:**
```tsx
<GridLayout
    columns={{ base: 1, md: 2, lg: 3 }}
    gap="size-300"
>
```

### 2. ThreeColumnLayout
**For more complex dashboards:**
```tsx
<ThreeColumnLayout
    leftContent={<Sidebar />}
    centerContent={<MainContent />}
    rightContent={<InfoPanel />}
/>
```

### 3. Collapsible Right Panel
**Toggle summary panel visibility:**
```tsx
<TwoColumnLayout
    rightCollapsible={true}
    rightDefaultCollapsed={false}
    ...
/>
```

### 4. More Token Types
**Support color, font-size, border-radius tokens:**
```typescript
type ColorToken = 'gray-50' | 'gray-100' | ...;
type FontSizeToken = 'font-size-100' | 'font-size-200' | ...;
```

---

## Related Documentation

- **Hooks Documentation:** `webview-ui/src/shared/hooks/CLAUDE.md`
- **Component Architecture:** `src/CLAUDE.md` (Webview Organization Pattern)
- **Adobe Spectrum Design System:** https://spectrum.adobe.com/page/design-tokens/
- **Testing Guide:** `.rptc/sop/testing-guide.md` (project SOP)

---

**Last Updated:** 2025-10-30
**Feature:** Layout Component Standardization (Steps 1-10)
**Status:** Documentation Complete ✅
````

## Expected Outcome

After completing this step:

- [ ] Comprehensive layout component documentation created at `webview-ui/src/shared/components/CLAUDE.md`
- [ ] Documentation covers all aspects: components, tokens, patterns, migration guide
- [ ] Real-world examples provided from actual codebase (5+ complete examples)
- [ ] Decision tree helps developers choose the right component
- [ ] Migration guide with before/after comparisons
- [ ] Best practices documented (5+ guidelines)
- [ ] Troubleshooting section addresses common issues
- [ ] Token mapping table includes all 13 supported tokens
- [ ] Documentation matches style and structure of existing hooks documentation
- [ ] Future developers can confidently use layout components without asking questions

## Acceptance Criteria

- [ ] Documentation file created at correct path
- [ ] All sections from "Documentation Content Structure" present
- [ ] Minimum 5 complete code examples included
- [ ] Decision tree clearly explains when to use each component
- [ ] Migration guide includes before/after code comparisons
- [ ] Token mapping table complete (13 tokens documented)
- [ ] Best practices section has 5+ actionable guidelines
- [ ] Troubleshooting section addresses 4+ common issues
- [ ] Cross-references to related documentation included
- [ ] Documentation reviewed for clarity (readable by junior developer)
- [ ] No TODOs or incomplete sections
- [ ] Markdown formatting correct (headers, code blocks, tables)
- [ ] Consistent with existing documentation style (see hooks/CLAUDE.md)

## Dependencies

**Prerequisites:**
- Steps 1-9 complete (all components and migrations implemented)
- Visual validations passed (confirms documentation accuracy)

**Enables:**
- Future developers can implement layouts consistently
- Onboarding time reduced (clear guidance)
- Maintenance simplified (centralized documentation)

## Estimated Time

**3-4 hours**

- Content planning and structure: 30 minutes
- Writing component reference sections: 60 minutes
- Creating real-world examples: 60 minutes
- Writing decision tree and best practices: 45 minutes
- Migration guide and troubleshooting: 45 minutes
- Review and formatting: 30 minutes

---

**Documentation Philosophy:**

This documentation step follows the "Documentation as Code" principle:

1. **Comprehensive:** Covers all use cases and patterns
2. **Example-Rich:** Multiple real-world examples from actual codebase
3. **Decision-Focused:** Helps developers choose the right approach
4. **Migration-Friendly:** Clear before/after patterns for refactoring
5. **Maintainable:** Single source of truth, easy to update

**Success Criteria:** A developer with no context can read this documentation and confidently implement layouts without asking questions.
