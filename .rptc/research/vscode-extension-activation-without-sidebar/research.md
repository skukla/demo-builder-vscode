# Research: VS Code Extension Activation Without Sidebar

**Research Date:** 2025-11-30
**Topic:** VS Code extension activation patterns - show welcome screen when clicking extension icon instead of sidebar
**Scope:** Hybrid (Codebase + Web)
**Goal:** Solve specific problem
**Focus Areas:** Architecture, UX patterns, VS Code API

---

## Executive Summary

**The short answer is: No, you cannot have an Activity Bar icon directly open an editor webview panel.** This is explicitly marked "out of scope" by the VS Code team (GitHub Issue #149556). However, there ARE effective alternatives that achieve a similar UX.

The recommended approach is the **Sidebar Launcher Pattern**: a minimal sidebar webview with a "Get Started" button that launches the full Welcome panel in the editor area.

---

## Codebase Analysis

### Recent Change (Commit 0564e55)

- **Removed:** `onStartupFinished` from `activationEvents`
- **Current:** Only `workspaceContains:.demo-builder` remains
- **Location:** `package.json:29-31`

```json
"activationEvents": [
  "workspaceContains:.demo-builder"
]
```

### Current Sidebar Configuration

**File:** `package.json:125-136`

```json
"viewsContainers": {
  "activitybar": [{
    "id": "demoBuilder",
    "title": "Demo Builder",
    "icon": "media/adobe-icon-dark.svg"
  }]
},
"views": {
  "demoBuilder": [{
    "id": "demoBuilder.components",
    "name": "Components"
  }]
}
```

### Current Activation Flow

**File:** `extension.ts:240-266`

- Extension activates → Shows Welcome webview in editor area
- Components TreeView is always registered but shows "Get Started" when empty

### Key Files Reference

| Feature | File Path | Lines |
|---------|-----------|-------|
| Activation config | `package.json` | 29-31, 120-136 |
| Activation flow | `src/extension.ts` | 22-294 |
| Welcome command | `src/features/welcome/commands/showWelcome.ts` | 1-198 |
| Welcome UI | `src/features/welcome/ui/WelcomeScreen.tsx` | 1-120+ |
| Components tree | `src/features/components/providers/componentTreeProvider.ts` | 1-134 |
| Command registration | `src/commands/commandManager.ts` | 43-340 |
| Webview base class | `src/core/base/baseWebviewCommand.ts` | 1-436+ |

---

## Web Research: Key Findings

### Critical Limitation

**Activity Bar icons CANNOT directly open editor webview panels.** The Activity Bar is designed for view switching (sidebar), not arbitrary actions.

- **Source:** [GitHub Issue #149556](https://github.com/microsoft/vscode/issues/149556) - VS Code team explicitly marked this "out of scope"

### Available Activation Events

| Event | Description | Use Case |
|-------|-------------|----------|
| `onView:viewId` | Activates when view is expanded | **Recommended for lazy loading** |
| `onCommand:commandId` | Activates when command is run | Command-driven extensions |
| `workspaceContains:pattern` | Activates when workspace has matching file | Project-aware extensions |
| `onStartupFinished` | Activates after VS Code starts | Background tasks (better than `*`) |
| `*` | Always activates | **Avoid - impacts startup time** |

### Available Patterns

| Pattern | Description | Fits Your Need? |
|---------|-------------|-----------------|
| **`WebviewViewProvider`** | Show rich HTML content IN the sidebar | Partial - sidebar, not editor |
| **`viewsWelcome`** | Show text + command buttons in empty TreeView | Lightweight alternative |
| **Conditional Views** | Show/hide views based on state via `when` clauses | Yes - can hide TreeView |
| **Sidebar Launcher** | Sidebar webview with button that opens editor panel | **Yes - two-step UX** |
| **Walkthroughs** | VS Code's native onboarding system | Alternative approach |

---

## Implementation Options

### Option A: Sidebar Webview (Replace TreeView with Webview)

**How it works:** Replace the Components TreeView with a `WebviewViewProvider` that shows a welcome screen in the sidebar. Use `when` clauses to conditionally show the TreeView after a project loads.

```json
{
  "activationEvents": [
    "onView:demoBuilder.welcome"
  ],
  "views": {
    "demoBuilder": [
      {
        "type": "webview",
        "id": "demoBuilder.welcome",
        "name": "Welcome",
        "when": "!demoBuilder.projectLoaded"
      },
      {
        "id": "demoBuilder.components",
        "name": "Components",
        "when": "demoBuilder.projectLoaded"
      }
    ]
  }
}
```

**Pros:**
- True lazy activation (no `*` or `onStartupFinished`)
- User clicks Activity Bar → sees welcome immediately
- Seamless transition to TreeView when project loads

**Cons:**
- Welcome content constrained to sidebar width (~300px)
- Need to redesign welcome UI for narrow space

---

### Option B: Sidebar Launcher Pattern (Recommended)

**How it works:** Show a minimal sidebar webview with a prominent "Get Started" button that launches the full Welcome panel in the editor area.

```typescript
// WebviewViewProvider for sidebar
class WelcomeLauncherProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = `
      <!DOCTYPE html>
      <html>
        <body style="text-align: center; padding: 20px;">
          <h2>Demo Builder</h2>
          <p>Create and manage Adobe Commerce demos</p>
          <button onclick="vscode.postMessage({command:'openWelcome'})"
                  style="padding: 10px 20px; font-size: 14px;">
            Get Started
          </button>
        </body>
        <script>
          const vscode = acquireVsCodeApi();
        </script>
      </html>
    `;

    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'openWelcome') {
        vscode.commands.executeCommand('demoBuilder.showWelcome');
      }
    });
  }
}
```

**Pros:**
- Keeps existing Welcome webview panel design
- One-click to open full editor experience
- Activity Bar icon activates extension
- No redesign of Welcome panel needed

**Cons:**
- Two-step interaction (click icon → click button)
- Sidebar still visible (though minimal)

---

### Option C: `viewsWelcome` (Lightweight)

**How it works:** Use native VS Code welcome content when TreeView is empty.

```json
{
  "viewsWelcome": [{
    "view": "demoBuilder.components",
    "contents": "Welcome to Demo Builder!\n\n[Create New Project](command:demoBuilder.createProject)\n[Open Existing Project](command:demoBuilder.openProject)",
    "when": "!demoBuilder.hasProject"
  }]
}
```

**Pros:**
- No custom webview needed
- Native VS Code look and feel
- Very lightweight

**Cons:**
- Limited to text + command links
- Can't match current Welcome screen design

---

## Comparison & Gap Analysis

| Aspect | Current Implementation | VS Code Best Practice |
|--------|----------------------|----------------------|
| Activation Event | `workspaceContains` only | `onView:viewId` recommended |
| Sidebar Type | TreeView | WebviewView for rich content |
| Welcome Display | Editor webview panel | Sidebar webview or `viewsWelcome` |
| Conditional Views | Manual logic in extension.ts | Declarative `when` clauses |

**Gap:** Your current architecture shows Welcome as an editor panel, but VS Code's Activity Bar is designed to show sidebar content. The "click icon → see welcome" pattern requires the welcome to BE in the sidebar OR use a launcher pattern.

---

## Recommended Approach

Based on your requirements, **Option B (Sidebar Launcher)** is the best fit:

1. **Add `onView:demoBuilder.components`** to activation events (lazy loading)
2. **Create a minimal sidebar WebviewViewProvider** that shows when Components is empty
3. **Sidebar has "Get Started" button** that executes `demoBuilder.showWelcome`
4. **Keep existing Welcome panel** in editor area (no redesign needed)

This achieves:
- ✅ No auto-activation on VS Code startup
- ✅ Extension activates when user clicks Activity Bar icon
- ✅ User sees immediate feedback (sidebar with launcher)
- ✅ Welcome screen appears in editor area (existing design works)
- ✅ Sidebar TreeView appears after project is loaded

---

## Implementation Plan Outline

### Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `onView:demoBuilder.components` to activationEvents |
| `package.json` | Add second view with `type: webview` and `when` clause |
| New file | Create `WelcomeLauncherProvider` implementing `WebviewViewProvider` |
| `extension.ts` | Register `WelcomeLauncherProvider` |

### package.json Changes

```json
{
  "activationEvents": [
    "workspaceContains:.demo-builder",
    "onView:demoBuilder.launcher",
    "onView:demoBuilder.components"
  ],
  "contributes": {
    "viewsContainers": {
      "activitybar": [{
        "id": "demoBuilder",
        "title": "Demo Builder",
        "icon": "media/adobe-icon-dark.svg"
      }]
    },
    "views": {
      "demoBuilder": [
        {
          "type": "webview",
          "id": "demoBuilder.launcher",
          "name": "Get Started",
          "when": "!demoBuilder.projectLoaded"
        },
        {
          "id": "demoBuilder.components",
          "name": "Components",
          "when": "demoBuilder.projectLoaded"
        }
      ]
    }
  }
}
```

---

## Common Pitfalls

### Pitfall 1: Activity Bar Cannot Directly Open Editor Webview Panels

**Problem:** Developers expect clicking an Activity Bar icon to open a webview panel in the editor, but this is not supported.

**Source:** [GitHub Issue #149556](https://github.com/microsoft/vscode/issues/149556)

**Solution:** Use a sidebar webview with a button that triggers `createWebviewPanel`, or accept the sidebar as your primary UI location.

### Pitfall 2: Forgetting `type: "webview"` in View Declaration

**Problem:** Extension fails with "There is no data provider registered that can provide view data" error.

**Solution:** Always explicitly specify `"type": "webview"` for webview views:

```json
{
  "views": {
    "myContainer": [{
      "type": "webview",  // REQUIRED for webview views
      "id": "myExtension.myView",
      "name": "My View"
    }]
  }
}
```

### Pitfall 3: Using `*` Activation When Not Needed

**Problem:** Extension activates on every VS Code startup, degrading performance.

**Solution:** Use `onView:viewId` for sidebar-activated extensions, `onCommand:commandId` for command-activated extensions.

### Pitfall 4: Welcome Content Not Showing

**Problem:** `viewsWelcome` content doesn't appear despite correct configuration.

**Solution:** Ensure `TreeDataProvider.getChildren()` returns `[]` (empty array) and `TreeView.message` is not set.

### Pitfall 5: Confusing WebviewPanel vs WebviewView

| Use Case | API |
|----------|-----|
| Editor area (tabs) | `createWebviewPanel()` |
| Sidebar / Panel area | `registerWebviewViewProvider()` |

---

## Real-World Examples

### GitLens Welcome Pattern

GitLens uses a dedicated Activity Bar icon that shows a "Home View" with onboarding content. The actual Git functionality appears in the Source Control sidebar.

**Key lessons:**
- Separate onboarding from functional views
- Provide command to re-access welcome screen
- Use Activity Bar for extension identity, not just features

### Remote Development Extensions

Remote extensions show a welcome webview in the sidebar until a remote connection is established, then transition to connection-specific views.

**Key lessons:**
- Conditional views based on state work well
- `when` clauses effectively hide/show views
- Welcome content guides users to first action

---

## Key Takeaways

1. **Activity Bar icons CANNOT directly open editor webview panels** - This is a VS Code architectural limitation, not a bug
2. **`onView:viewId` activation** enables true lazy loading without `*`
3. **Sidebar WebviewView + Launcher button** is the recommended pattern for your use case
4. **Conditional `when` clauses** can hide the TreeView until a project exists
5. **No redesign of Welcome panel needed** - just add a sidebar launcher

---

## Sources

### Official Documentation
- [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events)
- [VS Code Contribution Points](https://code.visualstudio.com/api/references/contribution-points)
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view)
- [VS Code Views UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/views)
- [VS Code When Clause Contexts](https://code.visualstudio.com/api/references/when-clause-contexts)

### GitHub Issues
- [GitHub Issue #149556 - Activity Bar WebView Panel (Out of Scope)](https://github.com/microsoft/vscode/issues/149556)
- [vscode-extension-samples/webview-view-sample](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-view-sample)
- [vscode-extension-samples/welcome-view-content-sample](https://github.com/microsoft/vscode-extension-samples/tree/main/welcome-view-content-sample)

### Stack Overflow
- [VS Code Extension - How to add a WebviewPanel to the sidebar?](https://stackoverflow.com/questions/67150547/vs-code-extension-how-to-add-a-webviewpanel-to-the-sidebar)
- [VsCode how to add webview to activity bar](https://stackoverflow.com/questions/66329470/vscode-how-to-add-webview-to-activity-bar)

---

_Research completed: 2025-11-30_
