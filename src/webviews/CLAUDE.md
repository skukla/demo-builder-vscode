# Webviews Module

## Overview

The webviews module contains the React-based UI layer for the Demo Builder extension. It uses Adobe Spectrum components to provide a native Adobe experience within VS Code.

## Architecture

```
webviews/
├── app/                    # Application setup
│   ├── App.tsx            # Root React component
│   ├── index.tsx          # Entry point
│   └── vscodeApi.ts       # VS Code API wrapper
├── components/            # React components
│   ├── wizard/           # Wizard container
│   ├── steps/            # Individual wizard steps
│   ├── common/           # Shared components
│   └── debug/            # Debug utilities
├── styles/               # CSS and styling
│   ├── custom-spectrum.css  # Spectrum overrides
│   ├── wizard.css          # Wizard-specific styles
│   └── index.css          # Entry point
├── types/                # TypeScript definitions
└── utils/                # UI utilities
    └── classNames.ts     # CSS class utilities
```

## Key Components

### WizardContainer (`components/wizard/WizardContainer.tsx`)

**Purpose**: Main wizard orchestrator

**Critical Implementation Details**:
```typescript
// IMPORTANT: Use div, not Adobe Spectrum Flex for layout
// Spectrum Flex constrains width to 450px
<div style={{ display: 'flex', height: '100%', width: '100%' }}>
    <TimelineNav />
    <ContentArea />
</div>
```

**State Management**:
- Maintains wizard state across steps
- Handles navigation between steps
- Validates step completion

### Wizard Steps (`components/steps/`)

1. **WelcomeStep**: Project name and template selection
2. **ComponentSelectionStep**: Choose project components
3. **PrerequisitesStep**: Check and install requirements
4. **AdobeAuthStep**: Adobe authentication
5. **OrgSelectionStep**: Select Adobe organization
6. **ProjectSelectionStep**: Choose Adobe project
7. **CommerceConfigStep**: Commerce-specific settings
8. **ReviewStep**: Review selections
9. **CreatingStep**: Project creation progress

### PrerequisitesStep Implementation

**Scrollable Container Pattern**:
```tsx
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
    {/* Prerequisites list */}
</div>
```

**Auto-scroll Logic**:
```typescript
// Scroll to current checking item
if (itemTop + itemHeight > containerScrollTop + containerHeight) {
    const scrollTo = itemTop + itemHeight - containerHeight + 10;
    container.scrollTo({ top: scrollTo, behavior: 'smooth' });
}
```

**Status Display Pattern**:
```tsx
// Standardized sub-item display with icons
<Flex alignItems="center" marginBottom="size-50">
    <Text UNSAFE_className={cn('text-sm')}>
        Node {version}
    </Text>
    {installed ? (
        <CheckmarkCircle size="XS" UNSAFE_className="text-green-600" />
    ) : (
        <CloseCircle size="XS" UNSAFE_className="text-red-600" />
    )}
</Flex>
```

## Adobe Spectrum Integration

### Critical Issues & Solutions

**Width Constraint Problem**:
- **Issue**: Spectrum Flex limits children to 450px
- **Solution**: Use standard HTML div with flex styles
- **Details**: See `docs/troubleshooting.md`

**Component Prop Patterns**:
```tsx
// Use component props, not CSS
<Picker menuWidth="size-4600">  // ✅ Correct

// Not CSS
<Picker className="wide-menu">  // ❌ Won't work
```

**Cursor Styling**:
```tsx
// Some components need inline styles
<Picker UNSAFE_style={{ cursor: 'pointer' }}>

// Others work with CSS
<Checkbox UNSAFE_className="cursor-pointer">
```

## Message Protocol

### With Handshake Protocol (Recommended)

The new vscodeApi.ts includes handshake protocol support:

```typescript
// In webview - Wait for handshake before sending messages
import { vscode } from './vscodeApi';

// Wait for handshake to complete
await vscode.ready();

// Send message (fire-and-forget)
vscode.postMessage('action', { data: 'value' });

// Send request and wait for response
const result = await vscode.request<ResponseType>('getData', { id: 123 });
```

**Message Structure with IDs**:
```typescript
interface Message {
    id: string;              // Unique message ID
    type: string;            // Message type
    payload?: any;           // Message data
    timestamp: number;       // When sent
    isResponse?: boolean;    // Is this a response
    responseToId?: string;   // ID of message being responded to
    expectsResponse?: boolean; // Does sender expect response
}
```

### Legacy Message Protocol

For components not yet migrated:

### Extension → Webview
```typescript
// In extension
panel.webview.postMessage({
    type: 'updateState',
    payload: { step: 'prerequisites', data: {...} }
});

// In webview
useEffect(() => {
    const handler = (event) => {
        const message = event.data;
        switch(message.type) {
            case 'updateState':
                setState(message.payload);
                break;
        }
    };
    window.addEventListener('message', handler);
}, []);
```

### Webview → Extension
```typescript
// In webview
vscode.postMessage({
    type: 'installPrerequisite',
    prereqId: 'node'
});

// In extension
panel.webview.onDidReceiveMessage(message => {
    switch(message.type) {
        case 'installPrerequisite':
            await this.installPrereq(message.prereqId);
            break;
    }
});
```

### Handshake Protocol Flow

1. **Extension Ready**: Extension sends `__extension_ready__` when webview loads
2. **Webview Ready**: Webview responds with `__webview_ready__` when React initializes
3. **Handshake Complete**: Extension confirms with `__handshake_complete__`
4. **Message Queue**: Messages sent before handshake are queued and sent after

This ensures no messages are lost during initialization and both sides are ready to communicate.

## Styling System

### CSS Architecture
- **custom-spectrum.css**: Adobe Spectrum overrides
- **wizard.css**: Wizard-specific styles
- **Component styles**: Use UNSAFE_className with cn() utility

### Class Name Utility
```typescript
import { cn } from '../../utils/classNames';

// Usage
<View UNSAFE_className={cn(
    'base-class',
    isActive && 'active-class',
    'spacing-class'
)}>
```

### Dark Mode Borders
```css
/* Use rgba for dark mode visibility */
.container {
    border: 1px solid rgba(255, 255, 255, 0.2);
}
```

## State Management Patterns

### Local State (React Hooks)
```typescript
const [state, setState] = useState<WizardState>({
    currentStep: 'welcome',
    projectName: '',
    // ...
});
```

### Message-Based State Sync
```typescript
// Send state to extension
const updateExtensionState = (updates: Partial<WizardState>) => {
    vscode.postMessage({
        type: 'updateState',
        state: { ...state, ...updates }
    });
};
```

## Performance Optimizations

1. **Lazy Loading**: Load step components on demand
2. **Memoization**: Use React.memo for expensive components
3. **Debouncing**: Debounce rapid state changes
4. **Virtual Scrolling**: For long lists (planned)

## Common Issues & Solutions

### Prerequisites Container Scrolling
- **Issue**: Page scrolls instead of container
- **Solution**: Constrain container height, use overflow-y: auto

### Width Inconsistencies
- **Issue**: Some steps 450px, others 800px
- **Solution**: Replace Spectrum Flex with div

### Success Message Not Visible
- **Issue**: Below scroll area
- **Solution**: Auto-scroll to bottom on completion

## Testing Approach

### Manual Testing Checklist
- [ ] All steps render correctly
- [ ] Navigation works (back/forward)
- [ ] Cancel button functions
- [ ] State persists across steps
- [ ] Messages sent/received correctly
- [ ] Error states display properly
- [ ] Dark/light theme compatibility

### Debug Tools
- **WidthDebugger**: Component to trace width inheritance
- **Console logging**: Structured message logging
- **React DevTools**: Component inspection

## Adding New Components

1. Create component in appropriate directory
2. Add to step sequence if wizard step
3. Update WizardContainer routing
4. Add message handlers if needed
5. Update types for new state
6. Document in this file

## Build Process

1. **Webpack Bundle**: Compiles React app
2. **CSS Processing**: Combines all styles
3. **HTML Generation**: Creates webview HTML
4. **Resource Paths**: Updates for VS Code context

---

For styling details, see `docs/development/styling-guide.md`
For component patterns, see `docs/development/ui-patterns.md`
For troubleshooting, see `docs/troubleshooting.md`