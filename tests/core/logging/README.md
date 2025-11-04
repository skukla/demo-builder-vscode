# Core Logging Module Tests

**Status:** 🔴 No tests currently exist for this module

**Purpose:** This directory will contain tests for logging infrastructure (debug, error, step logging).

## Modules to Test

### 1. logger.ts
**What to test:**
- Log message formatting
- Log level filtering
- Output channel integration
- Timestamp generation

**Test file:** `logger.test.ts`

### 2. debugLogger.ts
**What to test:**
- Debug message logging
- Debug channel creation
- Debug context tracking
- Conditional debug logging (enabled/disabled)

**Test file:** `debugLogger.test.ts`

### 3. errorLogger.ts
**What to test:**
- Error logging with stack traces
- Error formatting
- Error categorization
- Integration with VS Code error notifications

**Test file:** `errorLogger.test.ts`

### 4. stepLogger.ts
**What to test:**
- Step-based logging (wizard steps, prerequisites, etc.)
- Configuration-driven message templates
- Step context management
- Progress tracking integration

**Test file:** `stepLogger.test.ts`

**Suggested test structure (example for stepLogger):**
```typescript
describe('StepLogger', () => {
  describe('step logging', () => {
    it('should log step start with template')
    it('should log step completion')
    it('should log step errors with context')
  })

  describe('template loading', () => {
    it('should load message templates from config')
    it('should handle missing templates gracefully')
  })

  describe('context tracking', () => {
    it('should track current step context')
    it('should clear context on step completion')
  })
})
```

## Test Coverage Goals

- **Overall Target:** 85%+
- **Critical Paths:** 100% (error logging, step tracking)
- **Edge Cases:** Missing templates, null contexts, output channel failures

## Dependencies for Testing

- Mock VS Code output channels
- Mock configuration loader
- Test message templates
- Path aliases: `@/core/logging/*`

## Notes

- Logging critical for debugging - thorough testing essential
- Mock output channels to avoid VS Code API dependencies
- Test message formatting and template substitution
- Verify error handling doesn't throw (logging should never crash)

## When to Create Tests

Create tests when:
1. Adding new logging functionality
2. Changing log message formats
3. Debugging logging-related issues
4. Implementing new loggers (e.g., performance logger)

**TDD Reminder:** Write tests BEFORE implementing logging changes.
