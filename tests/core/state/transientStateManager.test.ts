/**
 * TransientStateManager tests
 *
 * The module is a two-method wrapper over VS Code's globalState Memento. It makes
 * exactly one decision — `get` guards on `!== undefined`, so a stored falsy value
 * is a value and not a miss — and the rest is delegation. The tables below are the
 * inputs to that delegation: they pin that neither direction coerces, wraps or
 * drops what it is handed.
 */

import * as vscode from 'vscode';
import { TransientStateManager } from '@/core/state/transientStateManager';
import {
    createMockExtensionContext,
    createStatefulGlobalState,
} from '../../helpers/extensionContextFake';

/**
 * Named a HARNESS, not a context: it returns the backing store alongside the
 * context, which four same-shaped `create…Context` builders do not.
 */
function createTransientStateHarness(initial: Record<string, unknown> = {}): {
    manager: TransientStateManager;
    store: Map<string, unknown>;
} {
    const { globalState, store } = createStatefulGlobalState(initial);
    const context: vscode.ExtensionContext = createMockExtensionContext({ globalState });

    return { manager: new TransientStateManager(context), store };
}

/**
 * Values that survive a Memento round trip unchanged. `set` is one `update` call
 * and `get` is one `get` call, so a row failing here means the wrapper acquired a
 * type it does not have.
 */
const ROUND_TRIP_VALUES = [
    ['a string', 'storedValue'],
    ['a number', 42],
    ['an object', { name: 'test', nested: { data: 123 } }],
    ['an array', [1, 2, 3]],
] as const;

/**
 * The module's one decision. `get` guards on `!== undefined`, NOT on truthiness,
 * so each of these must come back as itself; a truthiness guard would hand back
 * the default for all four.
 */
const FALSY_BUT_STORED = [
    ['zero', 0],
    ['the empty string', ''],
    ['false', false],
    ['null', null],
] as const;

describe('TransientStateManager - get', () => {
    it('returns the default when the key was never written', async () => {
        const { manager } = createTransientStateHarness();

        expect(await manager.get('nonexistent', 'default')).toBe('default');
    });

    it.each(FALSY_BUT_STORED)(
        'returns %s rather than the default — the guard is !== undefined, not truthiness',
        async (_label, stored) => {
            const { manager } = createTransientStateHarness({ key: stored });

            expect(await manager.get<unknown>('key', 'default')).toEqual(stored);
        }
    );

    it.each(ROUND_TRIP_VALUES)('returns %s that was already stored', async (_label, stored) => {
        const { manager } = createTransientStateHarness({ key: stored });

        expect(await manager.get<unknown>('key', 'default')).toEqual(stored);
    });

    it('reads only the requested key', async () => {
        const { manager } = createTransientStateHarness({ key1: 'value1', key2: 'value2' });

        expect(await manager.get('key1', 'default')).toBe('value1');
        expect(await manager.get('key2', 'default')).toBe('value2');
    });
});

describe('TransientStateManager - set', () => {
    it.each(ROUND_TRIP_VALUES)('writes %s through to globalState', async (_label, value) => {
        const { manager, store } = createTransientStateHarness();

        await manager.set('key', value);

        expect(store.get('key')).toEqual(value);
    });

    it('overwrites an existing value', async () => {
        const { manager, store } = createTransientStateHarness({ key: 'oldValue' });

        await manager.set('key', 'newValue');

        expect(store.get('key')).toBe('newValue');
    });

    it('writes only the key it was given', async () => {
        const { manager, store } = createTransientStateHarness({ key2: 'value2' });

        await manager.set('key1', 'value1');

        expect([...store.entries()]).toEqual([
            ['key2', 'value2'],
            ['key1', 'value1'],
        ]);
    });
});

describe('TransientStateManager - round trip', () => {
    it.each(ROUND_TRIP_VALUES)('reads back %s it just wrote', async (_label, value) => {
        const { manager } = createTransientStateHarness();

        await manager.set('key', value);

        expect(await manager.get<unknown>('key', 'default')).toEqual(value);
    });
});
