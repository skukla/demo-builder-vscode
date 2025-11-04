# Core Dependency Injection Module Tests

**Status:** 🔴 No tests currently exist for this module

**Purpose:** This directory will contain tests for dependency injection and service location.

## Modules to Test

### 1. serviceLocator.ts
**What to test:**
- Service registration
- Service retrieval
- Singleton vs transient service lifecycle
- Dependency resolution
- Circular dependency detection
- Service disposal/cleanup

**Test file:** `serviceLocator.test.ts`

**Suggested test structure:**
```typescript
describe('ServiceLocator', () => {
  describe('registration', () => {
    it('should register service factory')
    it('should register singleton service')
    it('should prevent duplicate registration')
  })

  describe('retrieval', () => {
    it('should return registered service instance')
    it('should return same instance for singleton')
    it('should return new instance for transient')
    it('should throw for unregistered service')
  })

  describe('dependency resolution', () => {
    it('should resolve service dependencies')
    it('should detect circular dependencies')
  })

  describe('cleanup', () => {
    it('should dispose all services')
    it('should call dispose on disposable services')
  })
})
```

## Test Coverage Goals

- **Overall Target:** 90%+ (DI is core infrastructure)
- **Critical Paths:** 100% (service resolution, lifecycle management)
- **Edge Cases:** Circular dependencies, disposal order, missing services

## Dependencies for Testing

- Mock service implementations
- Disposable service test doubles
- Path aliases: `@/core/di/*`

## Notes

- Service locator pattern central to extension architecture
- Test various service lifecycle scenarios (singleton, transient)
- Verify proper cleanup on disposal
- Test error handling for missing/circular dependencies

## When to Create Tests

Create tests when:
1. Adding new services to locator
2. Changing service lifecycle management
3. Debugging service resolution issues
4. Implementing new DI features

**TDD Reminder:** Write tests BEFORE implementing DI changes.
