/**
 * Unit Tests for DisposableStore - Basic Operations
 *
 * Tests proper LIFO disposal ordering, idempotent disposal,
 * and late addition handling.
 */

import { DisposableStore } from '@/core/utils/disposableStore';
import type * as vscode from 'vscode';

// Mock logger
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

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
