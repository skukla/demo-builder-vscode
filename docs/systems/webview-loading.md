# Webview Loading System

## Overview

The webview loading system manages the initialization and display of VS Code webview panels, preventing the default "Initializing web view..." message and providing smooth loading transitions.

## The Challenge

VSCode displays "Initializing web view..." by default when creating webview panels. This message appears until HTML content is set, creating a poor user experience.

## The Solution

We implemented a centralized loading state management system in `/src/utils/loadingHTML.ts` that:

1. **Waits 100ms after panel creation** - This delay allows VSCode to complete internal initialization
2. **Sets loading HTML immediately** - Custom spinner HTML prevents the default message
3. **Ensures minimum display time** - 1500ms minimum ensures users see clear feedback
4. **Transitions to actual content** - Smooth transition after content loads

## Why Not Use React Components for Initial Loading?

The initial loading state must be pure HTML/CSS because:
- React bundles haven't loaded yet when the webview first opens
- VSCode needs immediate HTML to prevent showing its default message
- The spinner must work before any JavaScript framework initializes

Our `CustomSpinner` React component was removed as it couldn't serve this purpose. Instead, we use:
- Pure HTML/CSS for initial loading (before React)
- React Spectrum's `ProgressCircle` component once React loads

## Implementation Pattern

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

## Common Issues and Solutions

### "Initializing web view..." Still Appears
- Ensure 100ms delay is present
- Check that HTML is set synchronously
- Verify no async operations before setting HTML

### Spinner Not Visible
- Check minimum display time (currently 1500ms)
- Verify CSS animation keyframes
- Ensure theme detection is working

### React Components Not Loading
- Check webpack bundle generation
- Verify CSP allows script execution
- Check for console errors in webview

## Implementation Details

The loading system uses a combination of:
1. **Timing Control**: Ensures proper initialization sequence
2. **Theme Detection**: Adapts spinner colors to VS Code theme
3. **Smooth Transitions**: Seamless change from loading to content
4. **Error Handling**: Graceful fallback if content fails to load

## Bundle Loading with getWebviewHTMLWithBundles()

The extension uses a centralized helper function for generating webview HTML with the 4-bundle webpack pattern. This eliminates code duplication across webview commands and ensures consistent CSP handling.

### Usage Pattern

```typescript
import { getWebviewHTMLWithBundles, type BundleUris } from '@/core/utils/getWebviewHTMLWithBundles';

protected async getWebviewContent(): Promise<string> {
    const webviewPath = path.join(this.context.extensionPath, 'dist', 'webview');

    const bundleUris: BundleUris = {
        runtime: this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'runtime-bundle.js'))
        ),
        vendors: this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'vendors-bundle.js'))
        ),
        common: this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'common-bundle.js'))
        ),
        feature: this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(webviewPath, 'wizard-bundle.js'))
        ),
    };

    const nonce = this.getNonce();

    return getWebviewHTMLWithBundles({
        bundleUris,
        nonce,
        cspSource: this.panel!.webview.cspSource,
        title: 'My Webview',
    });
}
```

### Bundle Loading Order

The helper ensures bundles load in the correct dependency order:
1. **runtime-bundle.js** - Webpack runtime
2. **vendors-bundle.js** - Third-party dependencies
3. **common-bundle.js** - Shared code across webviews
4. **feature-bundle.js** - Feature-specific code

This order is critical for preventing race conditions and ensuring dependencies are available before feature code executes.

### CSP Compliance

The helper automatically generates Content Security Policy headers with:
- Nonce-based script execution for security
- Proper source allowances for styles, images, and fonts
- No inline script execution (all scripts use nonces)

### Why This Prevents Timeouts

The 4-bundle pattern with proper loading order ensures:
- Smaller individual bundles load faster than single large bundle
- Webpack runtime initializes before feature code attempts to use it
- Dependencies are guaranteed available before dependent code executes
- Webview JavaScript loads completely before sending `__webview_ready__` signal

## Future Improvements

- Progressive loading states for slow operations
- Skeleton screens for content areas
- Optimistic UI updates
- Preloading strategies for faster perceived performance