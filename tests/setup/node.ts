/**
 * Global test setup for Node.js tests
 *
 * This file runs after each test to ensure proper cleanup and prevent test pollution.
 * Key responsibilities:
 * - Restore fake timers to real timers
 * - Clear pending timers
 * - Restore all spies and mocks
 */

afterEach(() => {
    // Clear any pending timers before switching to real timers
    // Use try-catch because some tests may leave globals in an inconsistent state
    try {
        // Check if fake timers are active by testing if setTimeout exists and is mocked
        // Note: jest.spyOn(global, 'setTimeout') can leave setTimeout undefined after restore
        if (typeof setTimeout !== 'undefined' && jest.isMockFunction(setTimeout)) {
            // Run any pending timers to prevent them from leaking
            jest.runOnlyPendingTimers();
            // Clear all scheduled timers
            jest.clearAllTimers();
            // Restore real timers
            jest.useRealTimers();
        }
    } catch {
        // If timer operations fail, still try to restore real timers
        try {
            jest.useRealTimers();
        } catch {
            // Ignore - timers may already be real
        }
    }

    // Ensure all spies are restored
    // This is in addition to restoreMocks: true in jest.config.js
    // to handle edge cases where spies may not be properly cleaned up
    jest.restoreAllMocks();
});
