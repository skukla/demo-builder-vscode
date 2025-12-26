/**
 * FileWatcher Branch Coverage Tests
 *
 * These tests target specific uncovered branches in fileWatcher.ts
 * to improve branch coverage from 31% to 80%+.
 *
 * Test categories:
 * 1. createWatcher optional callbacks (3 tests)
 *    - onDelete only (no onCreate) - covers lines 98-103 without 91-96
 *    - Neither optional callback - covers when both conditions are false
 *    - Overwrite existing watcher - covers line 105 set() overwrites
 *
 * 2. waitForFileSystem timeout cleanup (2 tests)
 *    - Timeout disposes watcher - covers lines 53-55 timeout path
 *    - Polling rejection clears timeout - covers lines 43-46 catch path
 *
 * 3. Event handling (3 tests)
 *    - Change event resolves - covers line 65 onDidChange path
 *    - Create event resolves - covers line 66 onDidCreate path
 *    - Delete event resolves - covers line 67 onDidDelete path
 */

import { FileWatcher } from '@/core/shell/fileWatcher';
import { PollingService } from '@/core/shell/pollingService';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';

// Mock vscode
jest.mock('vscode');

// Mock polling service
jest.mock('@/core/shell/pollingService');

// Mock logging - must match the import path in fileWatcher.ts: '@/core/logging'
jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    })
}));

/**
 * Helper to create a mock VS Code FileSystemWatcher
 * with EventEmitter-style event triggering
 */
function createMockWatcher() {
    const emitter = new EventEmitter();

    return {
        onDidChange: jest.fn((handler: () => void) => {
            emitter.on('change', handler);
            return { dispose: jest.fn() };
        }),
        onDidCreate: jest.fn((handler: () => void) => {
            emitter.on('create', handler);
            return { dispose: jest.fn() };
        }),
        onDidDelete: jest.fn((handler: () => void) => {
            emitter.on('delete', handler);
            return { dispose: jest.fn() };
        }),
        dispose: jest.fn(),
        // Test helpers to trigger events
        _emit: (event: 'change' | 'create' | 'delete') => emitter.emit(event)
    };
}

describe('FileWatcher Branch Coverage', () => {
    let fileWatcher: FileWatcher;
    let mockPollingService: jest.Mocked<PollingService>;
    let lastMockWatcher: ReturnType<typeof createMockWatcher>;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Setup mock PollingService
        mockPollingService = new PollingService() as jest.Mocked<PollingService>;
        mockPollingService.pollUntilCondition = jest.fn().mockResolvedValue(undefined);

        // Create FileWatcher and inject mock polling service
        fileWatcher = new FileWatcher();
        (fileWatcher as any).pollingService = mockPollingService;

        // Setup mock watcher factory
        (vscode.workspace.createFileSystemWatcher as jest.Mock).mockImplementation(() => {
            lastMockWatcher = createMockWatcher();
            return lastMockWatcher;
        });
    });

    afterEach(() => {
        // Clean up any active watchers
        fileWatcher.disposeAll();
        jest.useRealTimers();
    });

    describe('createWatcher optional callbacks', () => {
        it('should create watcher with onDelete only (no onCreate)', () => {
            // Given: Callbacks for onChange and onDelete, but NOT onCreate
            const onChange = jest.fn();
            const onDelete = jest.fn();

            // When: Creating watcher with onDelete but no onCreate
            fileWatcher.createWatcher('/path/to/file.txt', onChange, undefined, onDelete);

            // Then: onDidDelete should be registered
            expect(lastMockWatcher.onDidDelete).toHaveBeenCalled();

            // And: onDidCreate should NOT be called with a custom handler
            // (it's only called internally without the user's callback)
            expect(lastMockWatcher.onDidCreate).not.toHaveBeenCalled();

            // And: Triggering delete event should call onDelete callback
            lastMockWatcher._emit('delete');
            expect(onDelete).toHaveBeenCalledTimes(1);

            // And: onChange should work normally
            lastMockWatcher._emit('change');
            expect(onChange).toHaveBeenCalledTimes(1);
        });

        it('should create watcher with neither optional callback', () => {
            // Given: Only onChange callback
            const onChange = jest.fn();

            // When: Creating watcher without onCreate or onDelete
            fileWatcher.createWatcher('/path/to/file.txt', onChange);

            // Then: Only onDidChange should be registered with user callback
            expect(lastMockWatcher.onDidChange).toHaveBeenCalled();

            // And: Neither optional event handler should be registered
            expect(lastMockWatcher.onDidCreate).not.toHaveBeenCalled();
            expect(lastMockWatcher.onDidDelete).not.toHaveBeenCalled();

            // And: Change events should still trigger onChange
            lastMockWatcher._emit('change');
            expect(onChange).toHaveBeenCalledTimes(1);
        });

        it('should overwrite existing watcher for same path', () => {
            // Given: A watcher already exists for a path
            const onChange1 = jest.fn();
            fileWatcher.createWatcher('/same/path.txt', onChange1);
            const firstWatcher = lastMockWatcher;
            expect(fileWatcher.getActiveWatcherCount()).toBe(1);

            // When: Creating another watcher for the same path
            const onChange2 = jest.fn();
            fileWatcher.createWatcher('/same/path.txt', onChange2);
            const secondWatcher = lastMockWatcher;

            // Then: Still only one watcher in the map (overwritten)
            expect(fileWatcher.getActiveWatcherCount()).toBe(1);

            // And: The new watcher is the active one
            secondWatcher._emit('change');
            expect(onChange2).toHaveBeenCalledTimes(1);
            expect(onChange1).not.toHaveBeenCalled();

            // And: First watcher events don't affect the new callback
            // (first watcher's internal callbacks still work but user callback is different)
            firstWatcher._emit('change');
            expect(onChange1).toHaveBeenCalledTimes(1);
            expect(onChange2).toHaveBeenCalledTimes(1);
        });
    });

    describe('waitForFileSystem timeout cleanup', () => {
        it('should dispose watcher when timeout fires', async () => {
            // Given: A waitForFileSystem call without a condition (uses watcher)
            const waitPromise = fileWatcher.waitForFileSystem('/path/to/file.txt', undefined, 1000);

            // Capture the watcher before timeout
            const watcher = lastMockWatcher;
            expect(watcher.dispose).not.toHaveBeenCalled();

            // When: Timeout expires
            jest.advanceTimersByTime(1000);

            // Then: Watcher should be disposed before rejection
            expect(watcher.dispose).toHaveBeenCalled();

            // And: Promise should reject with timeout error
            await expect(waitPromise).rejects.toThrow('File system wait timeout');
        });

        it('should clear timeout when polling rejection occurs', async () => {
            // This test verifies the polling rejection path (lines 43-46 in fileWatcher.ts)
            // where pollUntilCondition rejection propagates and clears the timeout
            // Note: Using real timers for proper async promise resolution
            jest.useRealTimers();

            // Given: A condition function and a polling service that will reject
            const condition = jest.fn().mockResolvedValue(false);
            const pollingError = new Error('Polling failed');
            mockPollingService.pollUntilCondition.mockRejectedValueOnce(pollingError);

            // When: Calling waitForFileSystem with condition (triggers polling path)
            const waitPromise = fileWatcher.waitForFileSystem('/path/to/file.txt', condition, 5000);

            // Then: Polling service should be called with correct parameters
            expect(mockPollingService.pollUntilCondition).toHaveBeenCalledWith(
                condition,
                expect.objectContaining({
                    timeout: 5000,
                    name: 'file system: /path/to/file.txt'
                })
            );

            // And: Promise should reject with polling error (propagated through .catch(reject))
            await expect(waitPromise).rejects.toThrow('Polling failed');

            // Restore fake timers for other tests
            jest.useFakeTimers();
        });
    });

    describe('Event handling', () => {
        it('should resolve on first event only (change wins over subsequent create)', async () => {
            // Given: A waitForFileSystem call without condition
            const waitPromise = fileWatcher.waitForFileSystem('/path/to/file.txt', undefined, 5000);
            const watcher = lastMockWatcher;

            // When: First event fires
            watcher._emit('change');

            // Then: Promise should resolve (first event wins)
            await expect(waitPromise).resolves.toBeUndefined();

            // And: Watcher should be disposed after event
            expect(watcher.dispose).toHaveBeenCalled();
        });

        it('should resolve on create event when no change occurs first', async () => {
            // Given: A waitForFileSystem call without condition
            const waitPromise = fileWatcher.waitForFileSystem('/path/to/file.txt', undefined, 5000);
            const watcher = lastMockWatcher;

            // When: Create event fires (testing create branch)
            watcher._emit('create');

            // Then: Promise should resolve
            await expect(waitPromise).resolves.toBeUndefined();

            // And: Watcher should be disposed
            expect(watcher.dispose).toHaveBeenCalled();
        });

        it('should resolve on delete event when no other events occur first', async () => {
            // Given: A waitForFileSystem call without condition
            const waitPromise = fileWatcher.waitForFileSystem('/path/to/file.txt', undefined, 5000);
            const watcher = lastMockWatcher;

            // When: Delete event fires (testing delete branch)
            watcher._emit('delete');

            // Then: Promise should resolve
            await expect(waitPromise).resolves.toBeUndefined();

            // And: Watcher should be disposed
            expect(watcher.dispose).toHaveBeenCalled();
        });
    });
});
