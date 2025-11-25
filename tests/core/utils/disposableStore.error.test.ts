/**
 * Unit Tests for DisposableStore - Error Handling
 *
 * Tests error resilience during disposal - ensures one failing
 * disposable doesn't prevent cleanup of others.
 */

import { DisposableStore } from '@/core/utils/disposableStore';
import type * as vscode from 'vscode';
import { getLogger } from '@/core/logging';

// Create a mock logger instance that persists across calls
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// Mock logger to return the same instance
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => mockLogger,
}));

describe('DisposableStore - Error Handling', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Error Resilience', () => {
        it('should continue disposing remaining items if one throws', () => {
            const store = new DisposableStore();
            const disposalOrder: string[] = [];

            const itemA: vscode.Disposable = {
                dispose: () => disposalOrder.push('A')
            };
            const itemB: vscode.Disposable = {
                dispose: () => {
                    disposalOrder.push('B');
                    throw new Error('Disposal error');
                }
            };
            const itemC: vscode.Disposable = {
                dispose: () => disposalOrder.push('C')
            };

            store.add(itemA);
            store.add(itemB);
            store.add(itemC);

            // Should not throw
            expect(() => store.dispose()).not.toThrow();

            // All items should have been attempted (LIFO: C, B, A)
            expect(disposalOrder).toEqual(['C', 'B', 'A']);
        });

        it('should mark store as disposed even if errors occur', () => {
            const store = new DisposableStore();
            const errorDisposable: vscode.Disposable = {
                dispose: () => {
                    throw new Error('Test disposal error');
                }
            };

            store.add(errorDisposable);
            store.dispose();

            // Store should still be marked as disposed
            expect(store.disposed).toBe(true);
        });
    });

    describe('Error Logging', () => {
        it('should log errors during disposal', () => {
            const store = new DisposableStore();
            const testError = new Error('Test disposal error');

            const errorDisposable: vscode.Disposable = {
                dispose: () => {
                    throw testError;
                }
            };

            store.add(errorDisposable);
            store.dispose();

            // Verify error was logged
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error during disposal'),
                testError
            );
        });

        it('should log all errors from multiple failing disposables', () => {
            const store = new DisposableStore();
            const error1 = new Error('Error 1');
            const error2 = new Error('Error 2');

            const errorDisposable1: vscode.Disposable = {
                dispose: () => { throw error1; }
            };
            const errorDisposable2: vscode.Disposable = {
                dispose: () => { throw error2; }
            };

            store.add(errorDisposable1);
            store.add(errorDisposable2);
            store.dispose();

            // Both errors should be logged
            expect(mockLogger.error).toHaveBeenCalledTimes(2);
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error during disposal'),
                error2 // Disposed first (LIFO)
            );
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error during disposal'),
                error1 // Disposed second (LIFO)
            );
        });
    });
});
