/**
 * A working `vscode.EventEmitter` for suites that mock `vscode` wholesale.
 *
 * Three DaLiveAuthService suites build their own minimal `vscode` mock. When the
 * service gained `onDidSignIn`, all three broke on `EventEmitter is not a
 * constructor` — the constructor runs for every instantiation, so a missing
 * class fails the whole suite, not just the tests that use the event.
 *
 * Deliberately REAL rather than a jest.fn() stub: an emitter whose `fire()` was
 * swallowed would let the production emitter be wired to nothing and still pass
 * every assertion. Listeners actually run.
 *
 * Safe inside a hoisted `jest.mock` factory, which may `require` but may not
 * close over outer variables:
 *
 *     jest.mock('vscode', () => ({
 *         Uri: { parse: jest.fn((s: string) => s) },
 *         EventEmitter: require('../../helpers/vscodeEventEmitter').VscodeEventEmitter,
 *     }));
 */
export class VscodeEventEmitter<T = unknown> {
    private listeners: Array<(data: T) => void> = [];

    get event() {
        return (listener: (data: T) => void) => {
            this.listeners.push(listener);
            return {
                dispose: () => {
                    this.listeners = this.listeners.filter((l) => l !== listener);
                },
            };
        };
    }

    fire(data?: T) {
        this.listeners.forEach((listener) => listener(data as T));
    }

    dispose() {
        this.listeners = [];
    }
}
