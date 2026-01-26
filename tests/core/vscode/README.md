# Core VS Code Integration Module Tests

**Status:** 🔴 No tests currently exist for this module

**Purpose:** This directory will contain tests for VS Code API integrations and file watcher services.

## Modules to Test

### 1. WorkspaceWatcherManager.ts
**What to test:**
- File watcher creation and disposal
- Workspace-scoped file watching
- Event handling for file changes
- Multiple watcher management
- Proper cleanup on disposal

**Test file:** `workspaceWatcherManager.test.ts`

**Suggested test structure:**
```typescript
describe('WorkspaceWatcherManager', () => {
  describe('initialization', () => {
    it('should create watcher for given glob pattern')
    it('should scope watcher to workspace')
  })

  describe('file changes', () => {
    it('should trigger callback on file create')
    it('should trigger callback on file change')
    it('should trigger callback on file delete')
  })

  describe('cleanup', () => {
    it('should dispose all watchers')
    it('should not trigger callbacks after disposal')
  })
})
```

### 2. EnvFileWatcherService.ts
**What to test:**
- .env file change detection
- Hash-based change validation
- Notification suppression for programmatic writes
- Grace period handling
- Session-based notification tracking

**Test file:** `envFileWatcherService.test.ts`

**Suggested test structure:**
```typescript
describe('EnvFileWatcherService', () => {
  describe('change detection', () => {
    it('should detect .env file changes')
    it('should ignore changes with same hash')
    it('should detect content changes via hash')
  })

  describe('notification management', () => {
    it('should suppress notifications for programmatic writes')
    it('should show notification once per session')
    it('should respect grace period on startup')
  })

  describe('cleanup', () => {
    it('should dispose watcher on cleanup')
  })
})
```

## Test Coverage Goals

- **Overall Target:** 85%+
- **Critical Paths:** 100% (file change detection, notification management)
- **Edge Cases:** Rapid changes, concurrent modifications, hash collisions

## Dependencies for Testing

- Mock VS Code workspace API
- Mock VS Code file system API
- Mock notification API
- Path aliases: `@/core/vscode/*`

## Notes

- VS Code integrations require extensive mocking
- Test state management (file hashes, notification state)
- Verify proper disposal to prevent memory leaks
- Test grace period and suppression logic

## When to Create Tests

Create tests when:
1. Adding new VS Code file watcher features
2. Changing notification behavior
3. Debugging file system API issues
4. Implementing new VS Code integrations

**TDD Reminder:** Write tests BEFORE implementing VS Code integration changes.
