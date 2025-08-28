# Technical Documentation

## Architecture Overview

Adobe Demo Builder VSCode Extension is built with:
- TypeScript for type safety
- React with Adobe Spectrum for webview UI
- VSCode Extension API for IDE integration
- Webpack for bundling

## Webview Loading System

### The Challenge
VSCode displays "Initializing web view..." by default when creating webview panels. This message appears until HTML content is set, creating a poor user experience.

### The Solution
We implemented a centralized loading state management system in `/src/utils/loadingHTML.ts` that:

1. **Waits 100ms after panel creation** - This delay allows VSCode to complete internal initialization
2. **Sets loading HTML immediately** - Custom spinner HTML prevents the default message
3. **Ensures minimum display time** - 1500ms minimum ensures users see clear feedback
4. **Transitions to actual content** - Smooth transition after content loads

### Why Not Use React Components for Initial Loading?

The initial loading state must be pure HTML/CSS because:
- React bundles haven't loaded yet when the webview first opens
- VSCode needs immediate HTML to prevent showing its default message
- The spinner must work before any JavaScript framework initializes

Our `CustomSpinner` React component was removed as it couldn't serve this purpose. Instead, we use:
- Pure HTML/CSS for initial loading (before React)
- React Spectrum's `ProgressCircle` component once React loads

### Implementation Pattern

```typescript
// In webview commands
await setLoadingState(
    this.panel,
    () => this.getWebviewContent(),
    'Loading Demo Builder...',
    this.logger
);
```

This single function call handles:
- VSCode initialization delay
- Loading HTML display
- Minimum visibility timing
- Content transition

## Key Timing Values

### 100ms Initialization Delay
- **Purpose**: Prevent "Initializing web view..." message
- **Discovery**: Shorter delays (10ms, 50ms) were insufficient
- **Impact**: Completely eliminates the default VSCode message

### 1500ms Minimum Display Time
- **Purpose**: Ensure loading feedback is clearly visible
- **Rationale**: 
  - Allows 1.5 full rotations of the spinner animation
  - Long enough to be clearly perceived
  - Short enough to not feel sluggish
- **User Testing**: Tested at 300ms, 1000ms, and 2000ms

## Webview Architecture

### Bundle Structure
- `main-bundle.js` - Main wizard application
- `welcome-bundle.js` - Welcome screen application

### Component Organization
```
src/webviews/
├── components/
│   ├── wizard/        # Wizard-specific components
│   ├── steps/         # Individual wizard steps
│   ├── feedback/      # Feedback components
│   └── spectrum-extended/  # Custom Spectrum-style components
├── styles/           # CSS modules
└── app/             # Application setup
```

### Message Passing
Webviews communicate with the extension host through VSCode's message API:
- Extension → Webview: `panel.webview.postMessage()`
- Webview → Extension: `vscode.postMessage()`

## State Management

### Extension State
- Managed by `StateManager` class
- Persisted to workspace state
- Includes project configuration, status, etc.

### Webview State
- React component state for UI
- Message-based updates from extension
- No direct file system access

## Security Considerations

### Content Security Policy
Strict CSP is enforced for webviews:
- No inline scripts (except with nonce)
- No external resources
- Controlled script execution

### Secret Storage
- License keys use VSCode Secret Storage API
- API keys never logged or exposed
- Encrypted at rest by VSCode

## Development Workflow

### Building
- `npm run compile` - Compile TypeScript
- `npm run compile:webview` - Build webview bundles
- `npm run watch:all` - Watch mode for development

### Testing Webviews
1. Set breakpoints in webview code
2. Use Chrome DevTools (Help → Toggle Developer Tools → Webview)
3. Check console for message passing
4. Monitor network tab for resource loading

### Common Issues and Solutions

#### "Initializing web view..." Still Appears
- Ensure 100ms delay is present
- Check that HTML is set synchronously
- Verify no async operations before setting HTML

#### Spinner Not Visible
- Check minimum display time (currently 1500ms)
- Verify CSS animation keyframes
- Ensure theme detection is working

#### React Components Not Loading
- Check webpack bundle generation
- Verify CSP allows script execution
- Check for console errors in webview

## Future Improvements

### Potential Enhancements
- Progressive loading states for slow operations
- Skeleton screens for content areas
- Optimistic UI updates
- WebAssembly for performance-critical operations

### Technical Debt
- Consider migrating to single webview with routing
- Evaluate newer bundling tools (esbuild, etc.)
- Implement comprehensive error boundaries