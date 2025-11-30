# UI Design Decisions

## Overview

This document captures the UI/UX decisions made for the Adobe Demo Builder VSCode Extension, particularly focusing on the component selection wizard interface. These decisions ensure a consistent, professional appearance and optimal user experience.

## Component Selection Interface

### Dropdown Menu Styling

#### Problem
React Spectrum Picker dropdown menus were displaying with incorrect widths - either too narrow or not matching the trigger button width. CSS-based solutions were ineffective.

#### Solution
Use the `menuWidth` prop directly on Picker components:
```tsx
<Picker
    menuWidth="size-4600"
    // ... other props
>
```

**Key Findings:**
- CSS `min-width` and `width` rules do NOT affect React Spectrum dropdown menus
- Only the `menuWidth` prop successfully controls dropdown width
- `size-4600` provides optimal width matching the trigger button
- `size-5000` was too wide, `size-4000` was too narrow

### Dropdown Option Descriptions

#### Problem
Option descriptions were appearing inline with titles, making them difficult to read and unprofessional looking.

#### Solution
Applied CSS Grid layout to force descriptions onto separate lines:

```css
/* Force dropdown descriptions to appear on separate lines */
.spectrum-Menu-itemGrid {
    display: grid !important;
    grid-template-columns: 1fr !important;
    grid-template-rows: auto auto !important;
    gap: 2px !important;
}

.spectrum-Menu-itemLabel {
    grid-column: 1 !important;
    grid-row: 1 !important;
}

.spectrum-Menu-description {
    grid-column: 1 !important;
    grid-row: 2 !important;
    display: block !important;
    font-size: 11px !important;
    color: var(--spectrum-global-color-gray-600) !important;
}
```

**Why CSS Grid?**
- React Spectrum's slot system wasn't respecting layout preferences
- Flexbox approaches failed due to internal component structure
- Grid provides absolute control over element positioning

### Interactive Element Cursors

#### Problem
Dropdowns and checkboxes weren't showing pointer cursors on hover, making them feel less interactive.

#### Solution
Combined approach using both CSS and inline styles:

**For Pickers (inline styles required):**
```tsx
<Picker
    UNSAFE_style={{ cursor: 'pointer' }}
    // ... other props
>
```

**For Checkboxes (CSS worked):**
```css
.spectrum-Checkbox,
.spectrum-Checkbox *,
input[type="checkbox"],
input[type="checkbox"] + label {
    cursor: pointer !important;
}
```

**For Menu Items:**
```css
[role="option"],
[role="option"] * {
    cursor: pointer !important;
}
```

### Typography Sizing

#### Problem
Checkbox labels were too small (11px) compared to the checkbox size, creating visual imbalance.

#### Solution
Standardized font sizes across all interactive elements:
- **Checkbox labels**: 14px (up from 11px)
- **Option titles**: 14px
- **Option descriptions**: 12px
- **Section headers**: 12px, uppercase, with letter-spacing

```tsx
// Checkbox labels
<Text UNSAFE_style={{ fontSize: '14px' }}>
    {label}
</Text>

// Section headers
<Text UNSAFE_style={{ 
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
}}>
```

## Data Population

### External Systems and App Builder Apps

#### Problem
These sections were showing "Coming soon" placeholders instead of actual options from the component registry.

#### Solution
Implemented complete data flow from `components.json` to UI:

1. **Added to components.json:**
```json
"externalSystems": [
    {
        "id": "experience-platform",
        "name": "Experience Platform",
        "description": "Adobe Experience Platform integration"
    }
],
"appBuilder": [
    {
        "id": "integration-service",
        "name": "Kukla Integration Service",
        "description": "Custom integration service"
    }
]
```

2. **Updated ComponentRegistry:**
```typescript
async getExternalSystems(): Promise<ComponentDefinition[]>
async getAppBuilder(): Promise<ComponentDefinition[]>
```

3. **Message passing through ComponentHandler:**
```typescript
const externalSystems = await this.registryManager.getExternalSystems();
const appBuilder = await this.registryManager.getAppBuilder();
```

4. **UI receives data via props:**
```tsx
const externalSystemsOptions = componentsData?.externalSystems || [];
const appBuilderOptions = componentsData?.appBuilder || [];
```

## Visual Styling Patterns

### Container Styling
Used consistent bordered containers for option groups:
```javascript
const dropdownStyle = {
    border: '1px solid var(--spectrum-global-color-gray-300)',
    borderRadius: '4px',
    backgroundColor: 'var(--spectrum-global-color-gray-50)',
    padding: '6px 12px'
};
```

### Layout Structure
Two-column responsive layout for better space utilization:
```tsx
<Flex gap="size-300" wrap>
    <View flex="1" minWidth="300px">
        {/* Frontend section */}
    </View>
    <View flex="1" minWidth="300px">
        {/* Backend section */}
    </View>
</Flex>
```

## CSS Architecture

### File Organization
- `wizard.css`: Component-specific styles for the wizard interface
- Applied styles use high specificity with `!important` to override React Spectrum defaults
- Minimal inline styles except where required (cursor on Pickers)

### Key CSS Rules to Maintain
```css
/* Essential rules - DO NOT REMOVE */
.spectrum-Picker {
    width: 100% !important;  /* Ensures picker fills container */
}

.spectrum-Menu-itemGrid {
    display: grid !important;  /* Forces description layout */
}

.spectrum-Checkbox {
    cursor: pointer !important;  /* Interactive feedback */
}
```

## Lessons Learned

1. **React Spectrum props > CSS for component behavior**
   - Use component props like `menuWidth` rather than fighting with CSS
   - CSS should only be used for styling that props don't control

2. **CSS Grid for complex layouts**
   - When React Spectrum's layout system doesn't meet needs
   - Provides absolute control over element positioning

3. **Inline styles as last resort**
   - Use when CSS selectors can't target the right element
   - Example: Picker cursor styles required inline approach

4. **Test incrementally**
   - Each CSS change needs webpack rebuild
   - Browser DevTools essential for debugging Spectrum components

5. **Document prop values**
   - `size-4600` for menuWidth is not intuitive
   - Future developers need to know why specific values were chosen

## Wizard Layout Constraints

### Problem
Adobe Spectrum's Flex component was constraining child widths to 450px in the wizard layout, causing inconsistent step widths. Some steps (Prerequisites, Auth, Organization) appeared narrower than others (Welcome, Components, Project Details).

### Root Cause
React Spectrum's Flex component applies internal constraints that don't properly inherit parent widths in certain nested layouts. This was discovered after extensive debugging using a custom WidthDebugger component.

### Solution
Replace Adobe Spectrum Flex with standard HTML div for horizontal layouts:

```tsx
// ❌ Don't: Using Adobe Spectrum Flex constrains width
<Flex height="100%">
    <TimelineNav />
    <Content />
</Flex>

// ✅ Do: Using div preserves proper width inheritance
<div style={{ display: 'flex', height: '100%', width: '100%' }}>
    <TimelineNav />
    <Content />
</div>
```

**Key Implementation Details:**
- Always include `width: '100%'` in the style object
- Use `display: 'flex'` for flex behavior without Spectrum constraints
- Test all wizard steps to ensure consistent widths
- Keep Adobe Spectrum components for other uses where width isn't critical

### Debugging Width Issues
When encountering width problems:

1. **Create a WidthDebugger component** to trace width inheritance:
```tsx
export function WidthDebugger() {
    useEffect(() => {
        const measureWidths = () => {
            let element = containerRef.current;
            const widths = [];
            while (element) {
                widths.push({
                    tag: element.tagName,
                    offsetWidth: element.offsetWidth,
                    clientWidth: element.clientWidth,
                    computedWidth: window.getComputedStyle(element).width
                });
                element = element.parentElement;
            }
            console.table(widths);
        };
        measureWidths();
    }, []);
    return <div ref={containerRef}>Debug Container</div>;
}
```

2. **Look for constraints** in the ancestor chain
3. **Test with plain HTML elements** to isolate the issue
4. **Document the solution** for future reference

## Adobe Setup Two-Column Design

### Problem
The original Adobe Setup used separate steps for authentication, organization selection, and project selection. This created a disjointed experience with unclear progress indication and required excessive navigation.

### Solution
Implemented a two-column layout with progressive disclosure:
- **Left Column (60%)**: Active step content
- **Right Column (40%)**: Persistent configuration summary

### Implementation Details

#### Layout Structure
```tsx
// Use standard div instead of Spectrum Flex for proper width
<div style={{ display: 'flex', height: '100%', width: '100%' }}>
    <div style={{ flex: '1 1 60%', padding: '24px' }}>
        {renderLeftColumn()}
    </div>
    <div style={{ 
        flex: '0 0 40%', 
        backgroundColor: 'var(--spectrum-global-color-gray-75)',
        borderLeft: '1px solid var(--spectrum-global-color-gray-200)'
    }}>
        {renderRightColumn()}
    </div>
</div>
```

#### Progressive Steps
1. **Authentication**: Check status, show login if needed
2. **Project Selection**: List with search for 5+ items
3. **Workspace Selection**: Auto-load after project selection

#### Key UX Improvements

##### Always-Visible Edit Buttons
```css
/* Old: Hidden until hover */
.edit-button {
    opacity: 0;
}
.edit-button:hover {
    opacity: 1;
}

/* New: Always visible with subtle styling */
.edit-button {
    color: var(--spectrum-global-color-gray-600);
    transition: color 0.2s ease;
}
.edit-button:hover {
    color: var(--spectrum-global-color-blue-600);
}
```

##### Loading State Management
```typescript
// Different messages for different contexts
const loadingMessage = isLoggingIn 
    ? 'Opening browser for authentication...' 
    : 'Checking authentication status...';

// Context-aware loading with organization/project info
<Text>Loading your Adobe projects...</Text>
<Text>Fetching from organization: {state.adobeOrg.name}</Text>
```

##### Timing Optimizations
- **Auth polling**: Reduced from 3s to 1s (3x faster feedback)
- **Success display**: 2 seconds (was 800ms - too brief)
- **Transition animation**: 200ms for smooth step changes

### State Management Pattern

#### Clearing Dependent State
When switching organizations, clear all dependent data:
```typescript
const editStep = (step: SetupStep) => {
    if (step === 'auth') {
        // Clear ALL state when switching orgs
        setProjects([]);
        setWorkspaces([]);
        setSelectedProjectId(null);
        setSelectedWorkspaceId(null);
        // ... initiate re-authentication
    }
};
```

#### Immediate Loading
Start loading next data during success message display:
```typescript
if (data.isAuthenticated) {
    loadProjects(); // Start immediately
    setTimeout(() => {
        transitionToStep('project'); // Transition after delay
    }, 2000);
}
```

### Visual Design Patterns

#### Selection Highlighting
```css
.adobe-project-list [aria-selected="true"] {
    background-color: var(--spectrum-global-color-blue-100);
    border-left: 3px solid var(--spectrum-global-color-blue-600);
    padding-left: 13px;
}
```

#### Summary Panel Sections
- Clear section headers with uppercase text
- Checkmark icons for completed selections
- Edit buttons aligned to the right
- Dividers between sections

### Lessons from Implementation
1. **Immediate feedback is crucial**: Users need to see something happening within 1 second
2. **Context prevents confusion**: Show what's being loaded from where
3. **Progressive disclosure reduces overwhelm**: Show options only when relevant
4. **Persistent summary provides confidence**: Users always see their configuration

## Layout Components with Spectrum Tokens

### Overview

As of v1.7.0, the project's layout components (`GridLayout`, `TwoColumnLayout`) support Adobe Spectrum design tokens for dimension properties. This provides type-safe, design-system-aligned values while maintaining backward compatibility.

### Using Spectrum Tokens

#### GridLayout with Tokens

```tsx
// Recommended: Use Spectrum tokens
<GridLayout
  columns={3}
  gap="size-300"      // 24px
  padding="size-400"  // 32px
  maxWidth="size-6000" // 480px
>
  <TileCard />
  <TileCard />
</GridLayout>

// Also works: Backward compatible with pixel values
<GridLayout gap="24px" padding={32}>
  <TileCard />
</GridLayout>
```

#### TwoColumnLayout with Tokens

```tsx
// Recommended: Use Spectrum tokens
<TwoColumnLayout
  gap="size-300"           // 24px gap between columns
  leftPadding="size-400"   // 32px padding
  leftMaxWidth="size-6000" // 480px max width
  leftContent={<ProjectList />}
  rightContent={<Summary />}
/>

// Mixed usage: Tokens + pixel values
<TwoColumnLayout
  gap="size-300"
  leftPadding="24px"  // Still works
  leftContent={<Form />}
  rightContent={<Preview />}
/>
```

### Supported Tokens

The following 13 Spectrum size tokens are supported (based on codebase analysis):

| Token | Pixel Value | Common Use Case |
|-------|-------------|-----------------|
| `size-50` | 4px | Extra small spacing |
| `size-100` | 8px | Small spacing |
| `size-115` | 9.2px | Rare, specific components |
| `size-130` | 10.4px | Rare, specific components |
| `size-150` | 12px | Medium-small spacing |
| `size-160` | 12.8px | Rare, specific components |
| `size-200` | 16px | Medium spacing |
| `size-300` | 24px | **Large spacing (most common)** |
| `size-400` | 32px | Extra large spacing |
| `size-500` | 40px | Section spacing |
| `size-600` | 48px | Large section spacing |
| `size-1000` | 80px | Very large spacing |
| `size-6000` | 480px | Maximum width constraints |

### Type Safety

Using invalid tokens causes TypeScript compilation errors:

```tsx
// ✅ Compiles: Valid token
<GridLayout gap="size-300" />

// ❌ Compile error: Invalid token
<GridLayout gap="size-999" />
// Type '"size-999"' is not assignable to type 'DimensionValue'

// ✅ Compiles: Numeric and pixel string values still work
<GridLayout gap={24} />
<GridLayout gap="24px" />
```

### Migration Examples

#### Before (WelcomeScreen)
```tsx
// Bug: gap={24} rendered as "24" (no unit), CSS interpreted as 24px anyway
<GridLayout columns={2} gap={24}>
```

#### After (WelcomeScreen)
```tsx
// Fixed: gap="size-300" translates to "24px"
<GridLayout columns={2} gap="size-300">
```

#### Before (AdobeProjectStep)
```tsx
// Hardcoded pixel values
<TwoColumnLayout
  leftMaxWidth="800px"
  leftPadding="24px"
  rightPadding="24px"
/>
```

#### After (AdobeProjectStep)
```tsx
// Design system tokens
<TwoColumnLayout
  leftMaxWidth="800px"  // No token for 800px yet
  leftPadding="size-300"
  rightPadding="size-300"
/>
```

### Implementation Details

The translation utility (`webview-ui/src/shared/utils/spectrumTokens.ts`) handles three value types:

1. **Spectrum tokens**: `"size-300"` → `"24px"`
2. **Pixel strings**: `"24px"` → `"24px"` (pass-through)
3. **Numbers**: `24` → `"24px"` (automatic unit)

This ensures backward compatibility while enabling design system alignment.

### When to Use Tokens vs Pixels

**Use Tokens When:**
- Value matches a standard Spectrum size (check table above)
- Building new features or refactoring
- You want compile-time validation

**Use Pixels When:**
- Value doesn't match any token (e.g., `800px`, `1200px`)
- Working with specific pixel-perfect requirements
- Dealing with calculated values

## Future Considerations

- Consider creating a custom Picker wrapper component with our standard props
- Investigate React Spectrum theming for more systematic customization
- Monitor React Spectrum updates that might provide better native solutions
- Implement caching for projects/workspaces to improve performance
- Add keyboard navigation for accessibility
- Expand token support as more Spectrum sizes are needed (YAGNI principle)