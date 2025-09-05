# Troubleshooting Guide

## Overview

This guide provides solutions to common issues encountered during development of the Adobe Demo Builder VS Code Extension. Each section includes symptoms, diagnosis steps, and proven solutions.

## Table of Contents

1. [Using Diagnostics](#using-diagnostics)
2. [Platform-Specific Issues](#platform-specific-issues)
3. [Authentication Issues](#authentication-issues)
4. [Width Constraint Issues](#width-constraint-issues)
5. [Scroll Behavior Problems](#scroll-behavior-problems)
6. [UI Consistency Challenges](#ui-consistency-challenges)
7. [React Spectrum Component Issues](#react-spectrum-component-issues)
8. [Prerequisites UI Issues](#prerequisites-ui-issues)

## Using Diagnostics

### Running the Diagnostics Command

**When to Use:**
- Extension behaves differently on different systems
- Authentication or browser launch issues
- Tool detection problems
- Before reporting bugs

**How to Run:**
1. Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
2. Run "Demo Builder: Diagnostics"
3. Check output in both channels:
   - "Demo Builder: Logs" - Summary information
   - "Demo Builder: Debug" - Detailed diagnostic data

**What It Checks:**
- System information (OS, architecture, memory)
- VS Code version and environment
- Tool installations (Node.js, npm, fnm, git, Adobe CLI)
- Adobe authentication status and token validity
- Environment variables and PATH
- Browser launch capability
- File system permissions

**Exporting Logs:**
- Choose "Export Log" when prompted after diagnostics
- Save the file for sharing with support
- Includes all Debug channel content

## Platform-Specific Issues

### Node.js Not Detected Despite Being Installed

**Symptoms:**
- Prerequisites show Node.js as not installed
- `node --version` works in terminal but not in extension

**Diagnosis:**
1. Run diagnostics to check PATH
2. Look in Debug channel for exact command output
3. Check if version manager (fnm/nvm) is configured

**Solutions:**
- Ensure PATH includes Node.js location
- For fnm: Check shell configuration (.zshrc/.bashrc)
- Restart VS Code after PATH changes
- Try launching VS Code from terminal: `code .`

### Adobe CLI Browser Not Opening

**Symptoms:**
- Clicking "Sign In with Adobe" doesn't open browser
- Authentication hangs indefinitely

**Diagnosis:**
1. Run diagnostics to check Adobe CLI
2. Review Debug channel for `aio auth login -f` execution
3. Check browser launch test results

**Solutions:**
- Verify `aio` CLI is in PATH
- Check if `-f` flag is supported: `aio auth login --help`
- macOS: Check Gatekeeper permissions
- Windows: Verify default browser settings
- Linux: Check xdg-open configuration

## Authentication Issues

### Authentication Check Shows Not Authenticated

**Symptoms:**
- Already logged in but extension shows not authenticated
- Token exists but not recognized

**Diagnosis:**
1. Check Debug channel for token parsing
2. Look for expiry time calculations
3. Verify token context path

**Debug Output Example:**
```
[2025-01-10T15:30:00.123Z] DEBUG: Starting Adobe authentication check
[2025-01-10T15:30:00.125Z] DEBUG: Executing: aio config get ims.contexts.cli.access_token.token
[2025-01-10T15:30:00.500Z] DEBUG: Token expiry check:
{
  "expiryTime": 1704935445000,
  "currentTime": 1704892245000,
  "isValid": false
}
```

**Solutions:**
- Force re-authentication: Switch organizations
- Check system time is correct
- Clear Adobe CLI cache: `aio auth logout --force`
- Verify correct context: `aio auth ctx`

### Authentication Success Not Showing

**Symptoms:**
- No success message when already authenticated
- Quick flash then immediate project loading

**Solution:**
This has been fixed in v1.3.0. Update to the latest version.

## Width Constraint Issues

### Problem: Inconsistent Step Widths in Wizard

**Symptoms:**
- Some wizard steps appear narrower (450px) than others (800px)
- Prerequisites, Auth, and Organization steps are constrained
- Welcome, Components, and Project Details steps display full width

**Diagnosis:**
1. Create a WidthDebugger component to trace element widths:
```tsx
export function WidthDebugger() {
    const containerRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        if (!containerRef.current) return;
        
        let element: HTMLElement | null = containerRef.current;
        const widths = [];
        
        while (element) {
            widths.push({
                tag: element.tagName,
                class: element.className,
                offsetWidth: element.offsetWidth,
                clientWidth: element.clientWidth,
                computedWidth: window.getComputedStyle(element).width
            });
            element = element.parentElement;
        }
        
        console.table(widths);
    }, []);
    
    return <div ref={containerRef}>Width Debug</div>;
}
```

2. Look for elements with unexpected width constraints
3. Check for Adobe Spectrum Flex components in the ancestor chain

**Solution:**
Replace Adobe Spectrum Flex with standard HTML div:

```tsx
// In WizardContainer.tsx
// Before (constrains width to 450px):
<Flex height="100%">
    <TimelineNav />
    <ContentArea />
</Flex>

// After (preserves full width):
<div style={{ display: 'flex', height: '100%', width: '100%' }}>
    <TimelineNav />
    <ContentArea />
</div>
```

**Root Cause:**
Adobe Spectrum's Flex component applies internal width constraints that don't properly inherit parent widths in certain nested layouts.

## Scroll Behavior Problems

### Problem: Container vs Page Scrolling

**Symptoms:**
- Page scrolls when only container should scroll
- Auto-scroll during prerequisite checking scrolls entire page
- Success message causes unwanted page scroll

**Diagnosis:**
1. Check if container has proper height constraints
2. Verify overflow-y is set correctly
3. Ensure parent elements don't have conflicting scroll settings

**Solution:**
Implement proper container scrolling:

```tsx
// Prerequisites container with constrained scrolling
<div 
    ref={scrollContainerRef}
    className="prerequisites-container"
    style={{
        maxHeight: '360px',
        overflowY: 'auto',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '4px',
        padding: '12px'
    }}
>
    {/* Content */}
</div>
```

**Auto-scroll Implementation:**
```tsx
// Scroll to current checking item
useEffect(() => {
    if (status === 'checking' && itemRefs.current[index] && scrollContainerRef.current) {
        const item = itemRefs.current[index];
        const container = scrollContainerRef.current;
        
        const itemRect = item.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Calculate relative positions
        const itemTop = item.offsetTop;
        const itemHeight = item.offsetHeight;
        const containerHeight = container.clientHeight;
        const containerScrollTop = container.scrollTop;
        
        // Only scroll if item is not fully visible
        if (itemTop + itemHeight > containerScrollTop + containerHeight) {
            const scrollTo = itemTop + itemHeight - containerHeight + 10;
            container.scrollTo({ 
                top: Math.max(0, scrollTo), 
                behavior: 'smooth' 
            });
        }
    }
}, [currentCheckIndex]);
```

### Problem: Recheck Button Cut Off

**Symptoms:**
- Recheck button partially visible or cut off at bottom
- Footer overlaps with content
- Inadequate spacing between elements

**Solution:**
Adjust container heights and spacing:

```css
.prerequisites-container {
    max-height: 360px;  /* Reduced from 400px */
    margin-bottom: 30px; /* Increased spacing */
}
```

## UI Consistency Challenges

### Problem: Inconsistent Status Message Display

**Symptoms:**
- Node.js versions displayed on single line with commas
- Adobe I/O CLI errors not parsed properly
- Mixed icon and text color patterns

**Diagnosis:**
1. Check how status messages are rendered
2. Review icon usage patterns
3. Analyze text formatting consistency

**Solution:**
Standardize status display with icons:

```tsx
// Display Node versions on separate lines with icons
{check.nodeVersionStatus.map((item, idx) => (
    <Flex key={idx} alignItems="center" marginBottom="size-50">
        <Text UNSAFE_className={cn('text-sm')}>
            {item.version}
            {item.component && ` (${item.component})`}
        </Text>
        {item.installed ? (
            <CheckmarkCircle size="XS" UNSAFE_className="text-green-600" marginStart="size-50" />
        ) : (
            <CloseCircle size="XS" UNSAFE_className="text-red-600" marginStart="size-50" />
        )}
    </Flex>
))}
```

**Error Message Parsing:**
```tsx
// Parse Adobe I/O CLI error messages
const match = check.message.match(/Node\s+([\d.]+)\s*(?:\(([^)]+)\))?/g);
if (match) {
    return match.map((versionStr, idx) => {
        const versionMatch = versionStr.match(/Node\s+([\d.]+)\s*(?:\(([^)]+)\))?/);
        const version = versionMatch?.[1] || '';
        const component = versionMatch?.[2] || '';
        return (
            <Flex key={idx} alignItems="center" marginBottom="size-50">
                <Text UNSAFE_className={cn('text-sm')}>
                    Node {version}
                    {component && ` (${component})`}
                </Text>
                <CloseCircle size="XS" UNSAFE_className="text-red-600" marginStart="size-50" />
            </Flex>
        );
    });
}
```

## React Spectrum Component Issues

### Problem: Component Props Not Working as Expected

**Symptoms:**
- CSS styles not applying to Spectrum components
- Width/height props being ignored
- Layout props not affecting component

**Common Issues and Solutions:**

1. **Picker Menu Width:**
   - Use `menuWidth` prop, not CSS
   - Example: `<Picker menuWidth="size-4600">`

2. **Cursor Styles:**
   - Some components require inline styles
   - Example: `<Picker UNSAFE_style={{ cursor: 'pointer' }}>`

3. **Custom Styling:**
   - Always use `UNSAFE_className` for custom CSS
   - Use `!important` in CSS to override Spectrum styles

### Problem: Flex Component Constraints

**Symptoms:**
- Child components not expanding to full width
- Unexpected width constraints (often 450px)
- Layout breaking in nested flex containers

**Solution:**
Use standard HTML elements for critical layouts:

```tsx
// For horizontal layouts with full width
<div style={{ display: 'flex', width: '100%' }}>
    {children}
</div>

// For vertical layouts
<View UNSAFE_className={cn('flex', 'flex-column')}>
    {children}
</View>
```

## Prerequisites UI Issues

### Problem: Prerequisites List Not Scrollable

**Symptoms:**
- Long prerequisite lists overflow container
- Can't see all items
- No scroll indicator

**Solution:**
Add proper container styling:

```css
.prerequisites-container {
    max-height: 360px;
    overflow-y: auto;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    padding: 12px;
    margin-top: 20px;
    margin-bottom: 30px;
}

/* Custom scrollbar for better visibility */
.prerequisites-container::-webkit-scrollbar {
    width: 8px;
}

.prerequisites-container::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
}

.prerequisites-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 4px;
}

.prerequisites-container::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.4);
}
```

### Problem: Success Message Not Visible

**Symptoms:**
- Success message appears below visible area
- User doesn't see completion status
- No auto-scroll to success message

**Solution:**
Implement auto-scroll on completion:

```tsx
// Scroll to bottom when all prerequisites succeed
useEffect(() => {
    if (allSuccessful && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        setTimeout(() => {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
    }
}, [allSuccessful]);
```

## Debug Techniques

### Console Logging Best Practices

```typescript
// Group related logs
console.group('Width Debug');
console.log('Container:', containerWidth);
console.log('Content:', contentWidth);
console.table(widthMeasurements);
console.groupEnd();

// Use descriptive labels
console.log('🔍 Checking step:', stepName, { width, expectedWidth });

// Conditional logging for development
if (process.env.NODE_ENV === 'development') {
    console.log('Debug:', data);
}
```

### Using Browser DevTools

1. **Element Inspector:**
   - Right-click → Inspect to check computed styles
   - Look for unexpected constraints in Box Model
   - Check inherited styles from parent elements

2. **Console Debugging:**
   - Use `$0` to reference selected element
   - `getComputedStyle($0)` to see all styles
   - `$0.getBoundingClientRect()` for dimensions

3. **Performance Monitoring:**
   - Use Performance tab to identify render bottlenecks
   - Check for excessive reflows/repaints
   - Monitor scroll performance

## Common Mistakes to Avoid

1. **Don't rely on Adobe Spectrum Flex for critical layouts**
   - Use standard HTML div with flex styles instead

2. **Don't use inline styles for component styling**
   - Create CSS classes in custom-spectrum.css
   - Use cn() utility for conditional classes

3. **Don't forget !important in CSS overrides**
   - React Spectrum uses inline styles with high specificity
   - Override requires !important flag

4. **Don't scroll the page when container should scroll**
   - Ensure proper height constraints on containers
   - Use container.scrollTo() not window.scrollTo()

5. **Don't hardcode dimensions without testing**
   - Test with different content lengths
   - Verify responsive behavior
   - Check in both light and dark themes

## Getting Help

If you encounter issues not covered in this guide:

1. **Check the logs:**
   - VS Code: View → Output → Demo Builder Logs
   - Browser Console: Look for error messages

2. **Enable debug mode:**
   - Set `DEBUG=true` in environment
   - Add WidthDebugger component to problematic areas

3. **Document the issue:**
   - Take screenshots/recordings
   - Note the exact steps to reproduce
   - Include relevant code snippets

4. **Seek assistance:**
   - Check existing GitHub issues
   - Ask in the team Slack channel
   - Create a detailed bug report

## Contributing

When you solve a new issue:

1. Document the problem and solution
2. Add it to this troubleshooting guide
3. Update relevant component documentation
4. Consider adding automated tests