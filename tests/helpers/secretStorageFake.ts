/**
 * The canonical `vscode.SecretStorage` fake, with real storage behind it.
 *
 * WHY IT EXISTS. The compiler named it: converting the HandlerContext casts on
 * 2026-09-01 left 51 files failing `typecheck:tests`, and `SecretStorage` was the
 * LARGEST single blocker at 21 failures — more than any other collaborator. Every
 * one of those sites hand-rolls `{ get: jest.fn(), store: jest.fn() }`, which is not
 * a `SecretStorage`: the real interface also has `delete` and `onDidChange`, and the
 * cast is what stopped anyone finding out.
 *
 * IT REMEMBERS, deliberately. A bare `jest.fn()` for `get` returns undefined
 * forever, so a suite that stores a token and reads it back — which is what
 * credential code DOES — has to hand-roll a Map anyway. Three DaLive auth suites
 * each grew their own for `globalState` before `createStatefulGlobalState` existed;
 * this starts where that ended up rather than repeating the arc.
 *
 * The store is returned alongside, because a test asserting "the token was saved"
 * reads better against the map than through `secrets.get` — and because asserting
 * on `store.mock.calls` couples the test to call order it does not care about.
 *
 * @param initial - seed entries, for a suite that starts already signed in.
 * @see tests/helpers/extensionContextFake.ts — `createStatefulGlobalState`, same shape
 * @see .rptc/backlog/2026-09-01-cast-and-builder-worklog.md — section B
 */

import type * as vscode from 'vscode';

export function createMockSecretStorage(initial: Record<string, string> = {}): {
    secrets: jest.Mocked<vscode.SecretStorage>;
    store: Map<string, string>;
} {
    const store = new Map<string, string>(Object.entries(initial));

    const secrets = {
        get: jest.fn(async (key: string) => store.get(key)),
        store: jest.fn(async (key: string, value: string) => {
            store.set(key, value);
        }),
        delete: jest.fn(async (key: string) => {
            store.delete(key);
        }),
        // Real `onDidChange` returns a Disposable. Returning one keeps a caller that
        // registers a listener in a `subscriptions` array from blowing up on
        // `undefined.dispose` — a failure that reads like a bug in the code under
        // test rather than a hole in the fake.
        onDidChange: jest.fn(() => ({ dispose: jest.fn() })),
    } as unknown as jest.Mocked<vscode.SecretStorage>;

    return { secrets, store };
}
