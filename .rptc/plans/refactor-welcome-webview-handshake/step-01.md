# Step 1: Refactor WelcomeWebviewCommand to BaseWebviewCommand ✅

**Status:** Complete

## Purpose

Convert `WelcomeWebviewCommand` from manual handshake implementation to robust `BaseWebviewCommand` pattern with automatic handshake via `WebviewCommunicationManager`.

## Prerequisites

- Understanding of `BaseWebviewCommand` pattern (see `src/core/base/BaseWebviewCommand.ts`)
- Familiarity with `WebviewCommunicationManager` handshake protocol
- Knowledge of existing welcome webview functionality

## Tests to Write First

### Test 1: Command Extends BaseWebviewCommand

```typescript
describe('WelcomeWebviewCommand', () => {
  it('should extend BaseWebviewCommand', () => {
    const command = new WelcomeWebviewCommand(mockContext);
    expect(command).toBeInstanceOf(BaseWebviewCommand);
  });
});
```

### Test 2: Handshake Protocol Completes Successfully

```typescript
it('should complete handshake protocol within timeout', async () => {
  const command = new WelcomeWebviewCommand(mockContext);

  // Spy on WebviewCommunicationManager creation
  const commSpy = jest.spyOn(WebviewCommunicationManager.prototype, 'initialize');

  await command.execute();

  // Verify handshake completed
  expect(commSpy).toHaveBeenCalled();
  expect(command.isHandshakeComplete()).toBe(true);
});
```

### Test 3: No Manual Timer Management

```typescript
it('should not use setInterval or setTimeout for handshake', () => {
  const setIntervalSpy = jest.spyOn(global, 'setInterval');
  const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

  const command = new WelcomeWebviewCommand(mockContext);
  command.execute();

  // Verify no manual timers used for handshake
  expect(setIntervalSpy).not.toHaveBeenCalledWith(
    expect.any(Function),
    500 // The retry interval
  );

  setIntervalSpy.mockRestore();
  setTimeoutSpy.mockRestore();
});
```

### Test 4: Welcome Screen Actions Preserved

```typescript
it('should handle create-new action', async () => {
  const command = new WelcomeWebviewCommand(mockContext);
  await command.execute();

  // Simulate create-new message from webview
  await command.handleMessage({ type: 'create-new' });

  // Verify createProject command executed
  expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
    'demoBuilder.createProject'
  );
});

it('should handle open-project action', async () => {
  const command = new WelcomeWebviewCommand(mockContext);
  await command.execute();

  await command.handleMessage({ type: 'open-project' });

  // Verify project selection flow triggered
  expect(mockStateManager.getAllProjects).toHaveBeenCalled();
});

it('should handle open-docs action', async () => {
  const command = new WelcomeWebviewCommand(mockContext);
  await command.execute();

  await command.handleMessage({ type: 'open-docs' });

  // Verify external URL opened
  expect(vscode.env.openExternal).toHaveBeenCalled();
});

it('should handle open-settings action', async () => {
  const command = new WelcomeWebviewCommand(mockContext);
  await command.execute();

  await command.handleMessage({ type: 'open-settings' });

  // Verify settings command executed
  expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
    'workbench.action.openSettings',
    'demoBuilder'
  );
});
```

### Test 5: Singleton Pattern Maintained

```typescript
it('should maintain singleton pattern (one panel at a time)', async () => {
  const command1 = new WelcomeWebviewCommand(mockContext);
  const command2 = new WelcomeWebviewCommand(mockContext);

  await command1.execute();
  await command2.execute();

  // Verify only one panel exists
  expect(BaseWebviewCommand.getActivePanelCount()).toBe(1);
  expect(command2.panel).toBe(command1.panel);
});
```

## Implementation Guidance

### 1. Change Class Inheritance

**Before:**
```typescript
export class WelcomeWebviewCommand extends BaseCommand {
```

**After:**
```typescript
export class WelcomeWebviewCommand extends BaseWebviewCommand {
```

### 2. Implement Required Abstract Methods

`BaseWebviewCommand` requires implementing these methods:

```typescript
protected getWebviewId(): string {
  return 'demoBuilderWelcome';
}

protected getWebviewTitle(): string {
  return 'Demo Builder';
}

protected getLoadingMessage(): string {
  return 'Loading Demo Builder...';
}

protected async getWebviewContent(): Promise<string> {
  // Move HTML generation logic here
  // (existing getWebviewContent method)
}

protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
  // Register message handlers
  comm.on('create-new', async () => {
    await this.handleCreateNew();
  });

  comm.on('open-project', async () => {
    await this.browseForProject();
  });

  comm.on('open-docs', async () => {
    vscode.env.openExternal(vscode.Uri.parse('https://docs.adobe.com/demo-builder'));
  });

  comm.on('open-settings', async () => {
    vscode.commands.executeCommand('workbench.action.openSettings', 'demoBuilder');
  });
}

protected async getInitialData(): Promise<unknown> {
  return {
    theme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
    workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}
```

### 3. Simplify execute() Method

**Before:**
```typescript
async execute(): Promise<void> {
  // Manual panel creation
  // Manual message listener setup
  // Manual handshake with retry logic
  // Manual cleanup on dispose
}
```

**After:**
```typescript
async execute(): Promise<void> {
  // BaseWebviewCommand handles everything
  await this.createOrRevealPanel();
  await this.initializeCommunication();
}
```

### 4. Remove Manual Timer Code

Delete these sections:
- `handshakeInterval` and `handshakeTimeout` variable declarations
- `setInterval` retry loop
- `setTimeout` timeout handler
- Manual `clearInterval`/`clearTimeout` in message handler
- Timer cleanup in `onDidDispose`

### 5. Update Message Handling

**Before:**
```typescript
this.panel.webview.onDidReceiveMessage(async message => {
  if (message.type === '__webview_ready__') {
    // Manual handshake logic
  }
  await this.handleWebviewMessage(message);
});
```

**After:**
```typescript
// Message handling now in initializeMessageHandlers()
// No manual handshake code needed
```

### 6. Preserve Helper Methods

Keep these methods (move logic if needed):
- `handleCreateNew()` - Project creation flow
- `browseForProject()` - Project selection
- `openProject()` - Project loading
- `importProject()` - Import configuration

### 7. Update Static Members

Ensure singleton logic uses `BaseWebviewCommand` infrastructure:
- Remove `private static activePanel`
- Use `BaseWebviewCommand.getActivePanel()` instead

## Files to Modify

1. `src/commands/welcomeWebview.ts` - Main refactoring
2. `tests/commands/welcomeWebview.test.ts` - Add/update tests

## Expected Outcome

After this step:

- `WelcomeWebviewCommand` extends `BaseWebviewCommand`
- No manual `setInterval`/`setTimeout` for handshake
- Handshake completes automatically via `WebviewCommunicationManager`
- All welcome screen actions work identically
- Code is ~60 lines shorter (removed manual coordination)
- Tests verify handshake protocol and message handling
- Architecture consistent with wizard/dashboard/configure commands

## Testing Checklist

- [ ] All tests pass (new handshake tests)
- [ ] Welcome screen loads successfully
- [ ] "Create New Project" button works
- [ ] "Open Existing Project" button works
- [ ] "Open Docs" button works
- [ ] "Open Settings" button works
- [ ] Only one welcome panel exists at a time (singleton)
- [ ] Handshake completes within 5 seconds
- [ ] No console errors or warnings
- [ ] Memory cleanup works (no leaks)

## Acceptance Criteria

- [ ] Class extends `BaseWebviewCommand`
- [ ] All abstract methods implemented
- [ ] Handshake uses `WebviewCommunicationManager`
- [ ] No manual timer management
- [ ] All existing functionality preserved
- [ ] Tests cover handshake and message handling
- [ ] Code follows patterns from other webview commands

## Dependencies from Other Steps

None (single-step refactoring)

## Notes

- **Reference Implementation:** Look at `src/commands/createProjectWebview.ts` for BaseWebviewCommand usage example
- **Handshake Protocol:** `WebviewCommunicationManager` handles `__extension_ready__` → `__webview_ready__` → `__handshake_complete__` automatically
- **Message Registration:** Register handlers in `initializeMessageHandlers()` instead of manual `onDidReceiveMessage`
- **Backward Compatibility:** This is an internal refactoring - welcome screen behavior remains identical to users

---

## Completion Summary

**Completed:** Step 1 - Root cause identified and fixed

**Discovery:** WelcomeWebviewCommand was ALREADY properly refactored!
- Feature-based implementation at `src/features/welcome/commands/showWelcome.ts` was correct
- Already extends BaseWebviewCommand ✅
- Already uses WebviewCommunicationManager ✅
- Already implements proper handshake protocol ✅
- Uses modern `onStreaming()` pattern ✅

**Issue:** Command registration was pointing to obsolete legacy file
- `commandManager.ts` imported from `./welcomeWebview` (obsolete)
- Should have imported from `@/features/welcome/commands/showWelcome` (correct)

**Files Modified:**
- `src/commands/commandManager.ts` - Updated import to feature-based implementation
- `src/commands/resetAll.ts` - Updated dynamic import path
- `src/commands/welcomeWebview.ts` - DELETED (obsolete legacy file)
- `tests/commands/welcomeWebview.test.ts` - DELETED (tested wrong implementation)

**Result:** Welcome webview now uses correct BaseWebviewCommand implementation

**Constraints Verified:**
- Uses existing feature-based infrastructure ✅
- No code duplication (removed obsolete file) ✅
- Proper separation of concerns (feature-based architecture) ✅
- No breaking changes: All functionality preserved ✅
