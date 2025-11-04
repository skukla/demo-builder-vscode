# Core Base Module Tests

**Status:** 🔴 No tests currently exist for this module

**Purpose:** This directory will contain tests for base infrastructure classes that provide common functionality for commands and webview interactions.

## Modules to Test

### 1. baseCommand.ts
**What to test:**
- Command initialization and lifecycle
- Common command properties and methods
- Error handling in base command execution
- Integration with VS Code command system

**Test file:** `baseCommand.test.ts`

**Suggested test structure:**
```typescript
describe('BaseCommand', () => {
  describe('initialization', () => {
    it('should initialize with correct command ID')
    it('should register command with VS Code')
  })

  describe('execution', () => {
    it('should execute command logic')
    it('should handle execution errors gracefully')
  })
})
```

### 2. BaseHandlerRegistry.ts
**What to test:**
- Handler registration and retrieval
- Duplicate handler detection
- Handler removal
- Type safety of registered handlers

**Test file:** `BaseHandlerRegistry.test.ts`

**Suggested test structure:**
```typescript
describe('BaseHandlerRegistry', () => {
  describe('registration', () => {
    it('should register handler for message type')
    it('should prevent duplicate handler registration')
  })

  describe('retrieval', () => {
    it('should retrieve registered handler')
    it('should return undefined for unregistered handler')
  })
})
```

### 3. baseWebviewCommand.ts
**What to test:**
- Webview panel creation and lifecycle
- Message passing infrastructure setup
- Handler registration integration
- Webview disposal and cleanup

**Test file:** `baseWebviewCommand.test.ts`

**Suggested test structure:**
```typescript
describe('BaseWebviewCommand', () => {
  describe('webview creation', () => {
    it('should create webview panel with correct options')
    it('should set up message passing')
  })

  describe('message handling', () => {
    it('should register message handlers')
    it('should route messages to correct handlers')
  })

  describe('cleanup', () => {
    it('should dispose webview on command completion')
    it('should clean up message handlers')
  })
})
```

## Test Coverage Goals

- **Overall Target:** 85%+
- **Critical Paths:** 100% (command registration, message routing)
- **Edge Cases:** Error handling, disposal, lifecycle management

## Dependencies for Testing

- VS Code test framework (`@vscode/test-electron`)
- Mock webview panel creation
- Message passing test utilities
- Path aliases: `@/core/base/*`

## Notes

- Base classes are foundational - comprehensive testing critical
- Focus on integration between base classes and VS Code APIs
- Mock VS Code APIs to isolate base class logic
- Test error propagation and handling thoroughly

## When to Create Tests

Create tests when:
1. Refactoring base classes (TDD: write tests first)
2. Adding new base class functionality
3. Debugging issues in command/webview infrastructure
4. Coverage drops below 80% for core modules

**TDD Reminder:** Write tests BEFORE implementing changes to these modules.
