# Core VS Code Integration Module Tests

**Status:** 🔴 No tests currently exist for this module

**Purpose:** This directory will contain tests for VS Code API integrations and UI components.

## Modules to Test

### 1. StatusBarManager.ts
**What to test:**
- Status bar item creation
- Status bar updates (text, tooltip, icon)
- Status bar commands (click handlers)
- Status bar disposal/cleanup
- Status bar visibility toggling

**Test file:** `StatusBarManager.test.ts`

**Suggested test structure:**
```typescript
describe('StatusBarManager', () => {
  describe('initialization', () => {
    it('should create status bar item with correct alignment')
    it('should set initial text and tooltip')
  })

  describe('updates', () => {
    it('should update status bar text')
    it('should update tooltip')
    it('should update icon')
  })

  describe('commands', () => {
    it('should register click command')
    it('should execute command on click')
  })

  describe('visibility', () => {
    it('should show status bar item')
    it('should hide status bar item')
  })

  describe('cleanup', () => {
    it('should dispose status bar item')
  })
})
```

## Test Coverage Goals

- **Overall Target:** 85%+
- **Critical Paths:** 100% (status bar updates, command handling)
- **Edge Cases:** Rapid updates, disposal during updates, missing icons

## Dependencies for Testing

- Mock VS Code status bar API
- Mock VS Code window API
- Mock command registration
- Path aliases: `@/core/vscode/*`

## Notes

- VS Code integrations require extensive mocking
- Test state management (visibility, text, commands)
- Verify proper disposal to prevent memory leaks
- Test command registration and execution flow

## When to Create Tests

Create tests when:
1. Adding new VS Code UI integrations
2. Changing status bar behavior
3. Debugging VS Code API issues
4. Implementing new VS Code features (progress indicators, notifications, etc.)

**TDD Reminder:** Write tests BEFORE implementing VS Code integration changes.
