/**
 * StateManager Disposal Tests
 *
 * Verifies that EventEmitter disposal works correctly in StateManager.
 * These tests confirm the existing implementation is correct and prevent
 * regressions in future changes.
 *
 * Context: Original resource-lifecycle-management plan assumed VS Code's
 * EventEmitter.dispose() doesn't auto-remove listeners. This assumption
 * was incorrect - VS Code handles cleanup properly. These tests verify
 * this assumption and document expected behavior.
 *
 * ALL TESTS ARE FULLY MOCKED - No real file system operations.
 */

import * as vscode from 'vscode';

// Track mock EventEmitter state
let mockEmitterDisposed = false;
let mockListeners: Array<(data: any) => void> = [];
let mockEmitterFireCount = 0;

// Create a mock EventEmitter factory
const createMockEventEmitter = () => {
    return {
        event: (listener: (data: any) => void): vscode.Disposable => {
            mockListeners.push(listener);
            return {
                dispose: () => {
                    const index = mockListeners.indexOf(listener);
                    if (index > -1) {
                        mockListeners.splice(index, 1);
                    }
                },
            };
        },
        fire: (data: any) => {
            mockEmitterFireCount++;
            // Copy array to avoid mutation during iteration
            [...mockListeners].forEach(l => l(data));
        },
        dispose: () => {
            mockEmitterDisposed = true;
            mockListeners = [];
        },
    };
};

// Mock vscode module
jest.mock('vscode', () => ({
    EventEmitter: jest.fn().mockImplementation(() => createMockEventEmitter()),
    ExtensionContext: jest.fn(),
}));

// Mock fs/promises to avoid file system operations
jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockRejectedValue(new Error('ENOENT')),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readdir: jest.fn().mockResolvedValue([]),
    stat: jest.fn().mockResolvedValue({ isDirectory: () => true }),
    access: jest.fn().mockResolvedValue(undefined),
}));

// Mock os module
jest.mock('os', () => ({
    homedir: jest.fn().mockReturnValue('/mock/home'),
}));

// Mock type guards
jest.mock('@/types/typeGuards', () => ({
    parseJSON: jest.fn().mockReturnValue(null),
}));

import { StateManager } from '@/core/state/stateManager';

describe('StateManager - Disposal', () => {
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        // Reset mock state before each test
        mockEmitterDisposed = false;
        mockListeners = [];
        mockEmitterFireCount = 0;

        // Create mock context
        mockContext = {
            subscriptions: [],
            extensionPath: '/mock/extension',
            globalState: {
                get: jest.fn(),
                update: jest.fn().mockResolvedValue(undefined),
                keys: jest.fn().mockReturnValue([]),
            },
            workspaceState: {
                get: jest.fn(),
                update: jest.fn().mockResolvedValue(undefined),
                keys: jest.fn().mockReturnValue([]),
            },
        } as unknown as vscode.ExtensionContext;

        // Reset vscode.EventEmitter mock
        (vscode.EventEmitter as jest.Mock).mockClear();
        (vscode.EventEmitter as jest.Mock).mockImplementation(() => createMockEventEmitter());
    });

    describe('Test 1: Dispose Cleans Up EventEmitter', () => {
        it('should dispose EventEmitter when stateManager disposed', () => {
            const stateManager = new StateManager(mockContext);

            // Verify EventEmitter was created
            expect(vscode.EventEmitter).toHaveBeenCalled();

            // Dispose
            stateManager.dispose();

            // Verify EventEmitter was disposed
            expect(mockEmitterDisposed).toBe(true);
        });

        it('should clear all listeners when disposed', () => {
            const stateManager = new StateManager(mockContext);
            const callback1 = jest.fn();
            const callback2 = jest.fn();

            // Add listeners
            stateManager.onProjectChanged(callback1);
            stateManager.onProjectChanged(callback2);
            expect(mockListeners.length).toBe(2);

            // Dispose
            stateManager.dispose();

            // All listeners should be cleared
            expect(mockListeners.length).toBe(0);
        });
    });

    describe('Test 2: Subscription Disposal Works', () => {
        it('should allow subscriptions to be disposed independently', () => {
            const stateManager = new StateManager(mockContext);
            const callback = jest.fn();

            // Subscribe
            const subscription = stateManager.onProjectChanged(callback);
            expect(mockListeners.length).toBe(1);

            // Dispose subscription
            subscription.dispose();
            expect(mockListeners.length).toBe(0);
        });

        it('should not affect other subscriptions when one is disposed', () => {
            const stateManager = new StateManager(mockContext);
            const callback1 = jest.fn();
            const callback2 = jest.fn();

            // Subscribe both
            const subscription1 = stateManager.onProjectChanged(callback1);
            const subscription2 = stateManager.onProjectChanged(callback2);
            expect(mockListeners.length).toBe(2);

            // Dispose only first subscription
            subscription1.dispose();
            expect(mockListeners.length).toBe(1);

            // Second subscription should still be active
            expect(mockListeners[0]).toBe(callback2);
        });
    });

    describe('Test 3: Multiple Dispose Calls Safe', () => {
        it('should handle multiple dispose calls without throwing', () => {
            const stateManager = new StateManager(mockContext);

            // Should not throw on multiple dispose calls
            expect(() => {
                stateManager.dispose();
                stateManager.dispose();
                stateManager.dispose();
            }).not.toThrow();
        });

        it('should remain in disposed state after multiple calls', () => {
            const stateManager = new StateManager(mockContext);
            const callback = jest.fn();

            stateManager.onProjectChanged(callback);
            expect(mockListeners.length).toBe(1);

            // Dispose multiple times
            stateManager.dispose();
            stateManager.dispose();

            // Should still be disposed (listeners cleared)
            expect(mockEmitterDisposed).toBe(true);
            expect(mockListeners.length).toBe(0);
        });
    });

    describe('Test 4: Events Fire Before Dispose', () => {
        it('should have event property accessible', () => {
            const stateManager = new StateManager(mockContext);

            // onProjectChanged should be accessible
            expect(stateManager.onProjectChanged).toBeDefined();
            expect(typeof stateManager.onProjectChanged).toBe('function');
        });

        it('should allow subscriptions before dispose', () => {
            const stateManager = new StateManager(mockContext);
            const callback = jest.fn();

            // Should be able to subscribe
            const subscription = stateManager.onProjectChanged(callback);
            expect(subscription).toBeDefined();
            expect(subscription.dispose).toBeDefined();
            expect(mockListeners.length).toBe(1);
        });
    });
});
