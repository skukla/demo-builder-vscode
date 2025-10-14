# Demo Builder v1.0.0-beta.23 Release Notes

## 🐛 Fixed: Welcome Screen Conflict When Opening Project

### Issue
When clicking "Open Project" from the wizard to load the project dashboard, users would see an error notification:
```
❌ Failed to show welcome screen: Webview is disposed
```

**Debug logs showed the race condition:**
```
[Project Creation] Wizard closed
[Extension] No webviews open after disposal - opening Welcome
[Project Dashboard] Showing dashboard for project: my-commerce-demo
❌ Failed to show welcome screen: Webview is disposed
```

### Root Cause
A race condition between webview disposal and opening:

1. Wizard panel disposes
2. Extension detects "no webviews open" after 100ms delay
3. Auto-opens Welcome screen
4. Dashboard opens (after 500ms wait)
5. Welcome screen tries to initialize but is already disposed
6. User sees error notification

**Timeline:**
```
t=0ms:   Wizard disposes
t=100ms: Extension checks → no webviews → opens Welcome
t=500ms: Dashboard opens
t=600ms: Welcome fails (disposed) → Error notification
```

### Fix
Added a **webview transition flag** to prevent auto-welcome during transitions:

1. **Flag Management**: Module-level `isTransitioningWebview` flag tracks when we're transitioning between webviews
2. **Set on Transition**: `setWebviewTransitioning(true)` is called when opening project from wizard
3. **Check in Disposal**: Auto-welcome logic checks the flag before opening Welcome
4. **Safety Timeout**: Flag auto-clears after 2 seconds if not manually cleared

**Code Flow:**
```typescript
// In createProjectWebview.ts (openProject handler)
setWebviewTransitioning(true);  // Prevent auto-welcome
wizard.dispose();                // Close wizard
await openDashboard();           // Open dashboard
setWebviewTransitioning(false); // Clear flag

// In extension.ts (disposal callback)
if (activeWebviewCount === 0 && !isTransitioningWebview) {
  // Only open Welcome if NOT transitioning
  openWelcome();
}
```

### Impact
- ✅ No more "Failed to show welcome screen" errors
- ✅ Clean transition from wizard to dashboard
- ✅ Welcome screen only opens when appropriate
- ✅ Safety timeout prevents flag from getting stuck

---

**Previous Fix (v1.0.0-beta.22)**: Fixed false component update notifications for existing projects

**Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.22...v1.0.0-beta.23

