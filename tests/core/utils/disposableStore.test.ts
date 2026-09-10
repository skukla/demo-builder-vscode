/**
 * Unit Tests for DisposableStore - Basic Operations
 *
 * Tests proper LIFO disposal ordering, idempotent disposal,
 * and late addition handling.
 */

import { DisposableStore } from '@/core/utils/disposableStore';
import type * as vscode from 'vscode';

// Mock logger

describe('DisposableStore - Basic Operations', () => {
    describe('Add and Dispose', () => {
        it('should dispose single added disposable', () => {
            const store = new DisposableStore();
            const mockDisposable: vscode.Disposable = {
                dispose: jest.fn()
            };

            store.add(mockDisposable);
            store.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('LIFO Disposal Ordering', () => {
        it('should dispose multiple items in LIFO order', () => {
            const store = new DisposableStore();
            const disposalOrder: string[] = [];

            const itemA: vscode.Disposable = {
                dispose: () => disposalOrder.push('A')
            };
            const itemB: vscode.Disposable = {
                dispose: () => disposalOrder.push('B')
            };
            const itemC: vscode.Disposable = {
                dispose: () => disposalOrder.push('C')
            };

            store.add(itemA);
            store.add(itemB);
            store.add(itemC);
            store.dispose();

            expect(disposalOrder).toEqual(['C', 'B', 'A']);
        });
    });

    describe('Idempotent Disposal', () => {
        it('should be safe to dispose multiple times (idempotent)', () => {
            const store = new DisposableStore();
            const mockDisposable: vscode.Disposable = {
                dispose: jest.fn()
            };

            store.add(mockDisposable);
            store.dispose();
            store.dispose(); // Second disposal
            store.dispose(); // Third disposal

            // Dispose should only be called once
            expect(mockDisposable.dispose).toHaveBeenCalledTimes(1);
        });

        it('should handle disposing empty store without error', () => {
            const store = new DisposableStore();

            expect(() => store.dispose()).not.toThrow();
        });
    });

    describe('Late Additions', () => {
        it('should immediately dispose items added after store disposed', () => {
            const store = new DisposableStore();
            store.dispose(); // Dispose empty store

            const lateDisposable: vscode.Disposable = {
                dispose: jest.fn()
            };

            store.add(lateDisposable);

            // Should be disposed immediately
            expect(lateDisposable.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('Return Value Chaining', () => {
        it('should return added disposable for chaining', () => {
            const store = new DisposableStore();
            const mockDisposable: vscode.Disposable = {
                dispose: jest.fn()
            };

            const returned = store.add(mockDisposable);

            expect(returned).toBe(mockDisposable);
        });
    });

    /**
     * A disposable that tears down its OWNER — a child command disposing the
     * store it lives in — re-enters dispose() while the outer LIFO walk is still
     * on the stack. The disposed guard is what makes that re-entry a no-op; take
     * it away and the inner call drains the remaining items, so a sibling is
     * disposed underneath an item that has not finished disposing yet. That is
     * the ordering LIFO exists to provide.
     */
    describe('Re-entrant Disposal', () => {
        it('should treat dispose() called during disposal as a no-op', () => {
            const store = new DisposableStore();
            const order: string[] = [];

            const parent: vscode.Disposable = {
                dispose: () => order.push('parent')
            };
            const child: vscode.Disposable = {
                dispose: () => {
                    order.push('child-start');
                    store.dispose();
                    order.push('child-end');
                }
            };

            store.add(parent);
            store.add(child);
            store.dispose();

            expect(order).toStrictEqual(['child-start', 'child-end', 'parent']);
        });
    });

    /**
     * reset() exists for singleton commands that run more than once: the same
     * store is disposed at the end of one execution and has to accept new
     * disposables at the start of the next. It deliberately does NOT dispose
     * what it drops.
     */
    describe('Reset for reuse', () => {
        it('should clear the disposed flag so the store accepts additions again', () => {
            const store = new DisposableStore();
            store.dispose();

            store.reset();

            expect(store.disposed).toBe(false);
        });

        it('should not dispose an item added after reset', () => {
            const store = new DisposableStore();
            store.dispose();
            store.reset();

            const afterReset: vscode.Disposable = { dispose: jest.fn() };
            store.add(afterReset);

            // Without the reset the store is still disposed and add() would
            // dispose it on the spot — the second execution would tear down the
            // resources it had just created.
            expect(afterReset.dispose).not.toHaveBeenCalled();
            expect(store.count).toBe(1);
        });

        it('should start from an empty list, not from the previous run', () => {
            const store = new DisposableStore();
            store.add({ dispose: jest.fn() });

            store.reset();

            expect(store.count).toBe(0);
        });

        it('should dispose only what the current run added', () => {
            const store = new DisposableStore();
            const firstRun: vscode.Disposable = { dispose: jest.fn() };
            store.add(firstRun);
            store.dispose();
            expect(firstRun.dispose).toHaveBeenCalledTimes(1);

            store.reset();
            const secondRun: vscode.Disposable = { dispose: jest.fn() };
            store.add(secondRun);
            store.dispose();

            expect(secondRun.dispose).toHaveBeenCalledTimes(1);
            expect(firstRun.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('State Getters', () => {
        it('should expose disposed state via getter', () => {
            const store = new DisposableStore();

            expect(store.disposed).toBe(false);

            store.dispose();

            expect(store.disposed).toBe(true);
        });

        it('should expose count of managed disposables', () => {
            const store = new DisposableStore();
            const mockDisposable1: vscode.Disposable = { dispose: jest.fn() };
            const mockDisposable2: vscode.Disposable = { dispose: jest.fn() };

            expect(store.count).toBe(0);

            store.add(mockDisposable1);
            expect(store.count).toBe(1);

            store.add(mockDisposable2);
            expect(store.count).toBe(2);

            store.dispose();
            expect(store.count).toBe(0);
        });
    });
});
