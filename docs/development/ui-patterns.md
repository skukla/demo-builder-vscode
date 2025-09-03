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

## Future Considerations

- Consider creating a custom Picker wrapper component with our standard props
- Investigate React Spectrum theming for more systematic customization
- Monitor React Spectrum updates that might provide better native solutions
- Create standard layout components that avoid Spectrum Flex constraints