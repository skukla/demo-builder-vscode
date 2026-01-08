import { FileWatcher } from '@/core/shell/fileWatcher';
import { PollingService } from '@/core/shell/pollingService';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';

jest.mock('vscode');
jest.mock('@/core/shell/pollingService');
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    })
}));

describe('FileWatcher', () => {
    let fileWatcher: FileWatcher;
    let mockPollingService: jest.Mocked<PollingService>;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockPollingService = new PollingService() as jest.Mocked<PollingService>;
        mockPollingService.pollUntilCondition = jest.fn().mockResolvedValue(undefined);

        fileWatcher = new FileWatcher();
        (fileWatcher as any).pollingService = mockPollingService;

        // Mock vscode.workspace.createFileSystemWatcher to return proper event methods
        const mockWatcherFactory = () => {
            const watcher = new EventEmitter() as any;
            watcher.dispose = jest.fn();
            watcher.onDidChange = jest.fn((cb) => {
                watcher.on('change', cb);
                return { dispose: jest.fn() };
            });
            watcher.onDidCreate = jest.fn((cb) => {
                watcher.on('create', cb);
                return { dispose: jest.fn() };
            });
            watcher.onDidDelete = jest.fn((cb) => {
                watcher.on('delete', cb);
                return { dispose: jest.fn() };
            });
            return watcher;
        };
        (vscode.workspace.createFileSystemWatcher as jest.Mock).mockImplementation(mockWatcherFactory);
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    describe('waitForFileSystem', () => {
        it('should wait for file system change without condition', async () => {
            const promise = fileWatcher.waitForFileSystem('/path/to/file.txt');

            // Get the created watcher and emit change event using fake timers
            setTimeout(() => {
                const mockCall = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
                mockCall.emit('change');
            }, 100);

            // Advance fake timers to trigger the setTimeout callback
            jest.advanceTimersByTime(100);

            await promise;
        });

        it('should wait for file creation', async () => {
            const promise = fileWatcher.waitForFileSystem('/path/to/newfile.txt');

            // Get the created watcher and emit create event using fake timers
            setTimeout(() => {
                const mockCall = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
                mockCall.emit('create');
            }, 100);

            // Advance fake timers to trigger the setTimeout callback
            jest.advanceTimersByTime(100);

            await promise;
        });

        it('should wait for file deletion', async () => {
            const promise = fileWatcher.waitForFileSystem('/path/to/oldfile.txt');

            // Get the created watcher and emit delete event using fake timers
            setTimeout(() => {
                const mockCall = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
                mockCall.emit('delete');
            }, 100);

            // Advance fake timers to trigger the setTimeout callback
            jest.advanceTimersByTime(100);

            await promise;
        });

        it('should timeout if no change occurs', async () => {
            const promise = fileWatcher.waitForFileSystem('/path/to/file.txt', undefined, 100);

            // Advance fake timers to trigger the timeout
            jest.advanceTimersByTime(100);

            await expect(promise).rejects.toThrow('File system wait timeout');
        });

        it('should poll for expected condition', async () => {
            const expectedCondition = jest.fn().mockResolvedValue(true);

            await fileWatcher.waitForFileSystem(
                '/path/to/file.txt',
                expectedCondition,
                5000
            );

            expect(mockPollingService.pollUntilCondition).toHaveBeenCalledWith(
                expectedCondition,
                expect.objectContaining({
                    timeout: 5000,
                    name: 'file system: /path/to/file.txt'
                })
            );
        });

        it('should reject on polling timeout', async () => {
            const expectedCondition = jest.fn().mockResolvedValue(false);
            mockPollingService.pollUntilCondition.mockRejectedValue(
                new Error('Polling timeout for: file system')
            );

            await expect(
                fileWatcher.waitForFileSystem('/path/to/file.txt', expectedCondition, 100)
            ).rejects.toThrow('Polling timeout');
        });
    });

    describe('createWatcher', () => {
        it('should create persistent watcher with all callbacks', () => {
            // Use the factory mock from beforeEach, reset call count
            (vscode.workspace.createFileSystemWatcher as jest.Mock).mockClear();

            const onChange = jest.fn();
            const onCreate = jest.fn();
            const onDelete = jest.fn();

            const disposable = fileWatcher.createWatcher(
                '/path/to/file.txt',
                onChange,
                onCreate,
                onDelete
            );

            // Get the created watcher and simulate events
            const mockWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
            mockWatcher.emit('change');
            mockWatcher.emit('create');
            mockWatcher.emit('delete');

            expect(onChange).toHaveBeenCalled();
            expect(onCreate).toHaveBeenCalled();
            expect(onDelete).toHaveBeenCalled();
        });

        it('should create watcher with only onChange callback', () => {
            // Use the factory mock from beforeEach, reset call count
            (vscode.workspace.createFileSystemWatcher as jest.Mock).mockClear();

            const onChange = jest.fn();

            fileWatcher.createWatcher('/path/to/file.txt', onChange);

            const mockWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
            mockWatcher.emit('change');

            expect(onChange).toHaveBeenCalled();
        });

        it('should track watchers in map', () => {
            // Use the factory mock from beforeEach, reset call count
            (vscode.workspace.createFileSystemWatcher as jest.Mock).mockClear();

            expect(fileWatcher.getActiveWatcherCount()).toBe(0);

            fileWatcher.createWatcher('/path/to/file.txt', jest.fn());

            expect(fileWatcher.getActiveWatcherCount()).toBe(1);
        });
    });

    describe('disposeWatcher', () => {
        it('should dispose specific watcher', () => {
            (vscode.workspace.createFileSystemWatcher as jest.Mock).mockClear();

            fileWatcher.createWatcher('/path/to/file.txt', jest.fn());

            expect(fileWatcher.getActiveWatcherCount()).toBe(1);

            fileWatcher.disposeWatcher('/path/to/file.txt');

            const mockWatcher = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
            expect(mockWatcher.dispose).toHaveBeenCalled();
            expect(fileWatcher.getActiveWatcherCount()).toBe(0);
        });

        it('should handle disposing non-existent watcher', () => {
            expect(() => {
                fileWatcher.disposeWatcher('/nonexistent/path.txt');
            }).not.toThrow();
        });
    });

    describe('disposeAll', () => {
        it('should dispose all watchers', () => {
            (vscode.workspace.createFileSystemWatcher as jest.Mock).mockClear();

            fileWatcher.createWatcher('/path/to/file1.txt', jest.fn());
            fileWatcher.createWatcher('/path/to/file2.txt', jest.fn());

            expect(fileWatcher.getActiveWatcherCount()).toBe(2);

            fileWatcher.disposeAll();

            const mockWatcher1 = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
            const mockWatcher2 = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[1].value;
            expect(mockWatcher1.dispose).toHaveBeenCalled();
            expect(mockWatcher2.dispose).toHaveBeenCalled();
            expect(fileWatcher.getActiveWatcherCount()).toBe(0);
        });

        it('should handle disposing when no watchers exist', () => {
            expect(() => {
                fileWatcher.disposeAll();
            }).not.toThrow();
        });
    });

    describe('getActiveWatcherCount', () => {
        it('should return correct count', () => {
            (vscode.workspace.createFileSystemWatcher as jest.Mock).mockClear();

            expect(fileWatcher.getActiveWatcherCount()).toBe(0);

            fileWatcher.createWatcher('/path1.txt', jest.fn());
            expect(fileWatcher.getActiveWatcherCount()).toBe(1);

            fileWatcher.createWatcher('/path2.txt', jest.fn());
            expect(fileWatcher.getActiveWatcherCount()).toBe(2);

            fileWatcher.disposeWatcher('/path1.txt');
            expect(fileWatcher.getActiveWatcherCount()).toBe(1);

            fileWatcher.disposeAll();
            expect(fileWatcher.getActiveWatcherCount()).toBe(0);
        });
    });
});
