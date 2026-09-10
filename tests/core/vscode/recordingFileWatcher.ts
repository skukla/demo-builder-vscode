/**
 * A `vscode.FileSystemWatcher` stand-in that RECORDS its listeners.
 *
 * Both watcher suites in this directory need one and had a byte-identical
 * 25-line copy: `envFileWatcherService.testUtils` and
 * `workspaceWatcherManager.mocked.test`. They cannot share a wall — the testUtils
 * mocks `@/core/vscode/workspaceWatcherManager`, which is the very module the
 * other suite is testing — so what is shared is this factory, called from inside
 * each suite's own `vscode` wall.
 *
 * IT IS REACHED WITH `require`, NOT AN IMPORT. A `jest.mock` factory is hoisted
 * above every import in its module, so an imported binding is not available when
 * the factory runs; `require` inside the factory resolves at call time, which is
 * after the module graph is up. Same pattern as `debugLogger.testUtils` in
 * `tests/core/logging`.
 *
 * The watcher pushes itself onto the array it is given and splices itself out on
 * dispose, so a suite can assert on live watchers by reading that array.
 *
 * `_simulateChange` came from the envFileWatcher copy and is absent from the
 * other. Keeping it costs the workspaceWatcher suite an unused member and saves
 * a second watcher shape; the two copies were otherwise identical, and jscpd
 * matched only the 25 lines they shared — treating that block as the whole
 * watcher is what broke six tests on the first attempt at this extraction.
 */

/** The members the two suites read off a watcher. Loose on purpose — it stands
 * in for a `vscode.FileSystemWatcher`, and nothing here reads the rest. */
export interface RecordingWatcher {
    pattern: string;
    _disposed: boolean;
    _listeners: {
        onCreate: ((...args: unknown[]) => unknown)[];
        onChange: ((...args: unknown[]) => unknown)[];
        onDelete: ((...args: unknown[]) => unknown)[];
    };
    onDidCreate: jest.Mock;
    onDidChange: jest.Mock;
    onDidDelete: jest.Mock;
    dispose: jest.Mock;
    /** Fire every registered change listener, as a real file edit would. */
    _simulateChange: (uri: unknown) => void;
}

/**
 * Build the `createFileSystemWatcher` stand-in a `vscode` wall installs.
 *
 * THE REGISTRY ARRIVES AS A GETTER, not the array. The wall's factory runs when
 * `vscode` is first required, which can be before the suite's `const
 * mockWatchers = []` has executed — passing the array directly fails with
 * "Cannot access 'mockWatchers' before initialization". Reading it per watcher
 * defers the lookup past that window.
 *
 * @param registry - returns the array watchers append themselves to
 */
export function createRecordingWatcherFactory(registry: () => RecordingWatcher[]) {
    return jest.fn((pattern: string): RecordingWatcher => {
        const watcher: RecordingWatcher = {
            pattern,
            _disposed: false,
            _listeners: { onCreate: [], onChange: [], onDelete: [] },
            onDidCreate: jest.fn((listener: (...args: unknown[]) => unknown) => {
                watcher._listeners.onCreate.push(listener);
                return { dispose: () => {} };
            }),
            onDidChange: jest.fn((listener: (...args: unknown[]) => unknown) => {
                watcher._listeners.onChange.push(listener);
                return { dispose: () => {} };
            }),
            onDidDelete: jest.fn((listener: (...args: unknown[]) => unknown) => {
                watcher._listeners.onDelete.push(listener);
                return { dispose: () => {} };
            }),
            _simulateChange: (uri: unknown) => {
                watcher._listeners.onChange.forEach((listener) => listener(uri));
            },
            dispose: jest.fn(() => {
                watcher._disposed = true;
                const list = registry();
                const idx = list.indexOf(watcher);
                if (idx !== -1) list.splice(idx, 1);
            }),
        };
        registry().push(watcher);
        return watcher;
    });
}
