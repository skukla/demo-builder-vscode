/**
 * One Adobe sign-in at a time, and a sign-in that gives up asks whether the user
 * is signed in anyway.
 *
 * 2026-09-19: the Integrations screen's sign-in and the sign-in helper ran at once,
 * each with its own browser tab. The user finished the helper's; the screen's timed
 * out a minute later and it reported "Session expired" over a token valid for 24h.
 */

import { createSignInGate } from '@/features/authentication/services/signInGate';
import { createMockLogger } from '../../../helpers/loggerFake';

/** A sign-in the test finishes by hand. */
function pendingSignIn() {
    let finish: (ok: boolean) => void = () => undefined;
    const promise = new Promise<boolean>((resolve) => {
        finish = resolve;
    });
    return { promise, finish };
}

function gate(overrides: Partial<Parameters<typeof createSignInGate>[0]> = {}) {
    const deps = {
        run: jest.fn(async (_force: boolean) => true),
        signedInNow: jest.fn(async () => false),
        adoptSignIn: jest.fn(),
        logger: createMockLogger(),
        ...overrides,
    };
    return { signIn: createSignInGate(deps), deps };
}

describe('createSignInGate — one sign-in at a time', () => {
    it('a second request while one runs joins it, and opens no second browser tab', async () => {
        const first = pendingSignIn();
        const { signIn, deps } = gate({ run: jest.fn(() => first.promise) });

        const screen = signIn(false);
        const helper = signIn(false);
        first.finish(true);

        expect(await Promise.all([screen, helper])).toEqual([true, true]);
        expect(deps.run).toHaveBeenCalledTimes(1);
    });

    // An org switch needs the account chooser only a forced sign-in shows; joining a
    // normal one would sign the user back into the org they are leaving.
    it('a forced request waits for a normal one to end, then opens its own', async () => {
        const first = pendingSignIn();
        const run = jest.fn((force: boolean) => (force ? Promise.resolve(true) : first.promise));
        const { signIn } = gate({ run });

        const normal = signIn(false);
        const forced = signIn(true);
        expect(run).toHaveBeenCalledTimes(1);
        first.finish(true);

        expect(await Promise.all([normal, forced])).toEqual([true, true]);
        expect(run.mock.calls).toEqual([[false], [true]]);
    });

    it('a normal request joins a forced one', async () => {
        const first = pendingSignIn();
        const { signIn, deps } = gate({ run: jest.fn(() => first.promise) });

        const forced = signIn(true);
        const normal = signIn(false);
        first.finish(true);

        expect(await Promise.all([forced, normal])).toEqual([true, true]);
        expect(deps.run).toHaveBeenCalledTimes(1);
    });

    it('starts a fresh sign-in once the last one has ended', async () => {
        const { signIn, deps } = gate();

        await signIn(false);
        await signIn(false);

        expect(deps.run).toHaveBeenCalledTimes(2);
    });

    it('ends even when the sign-in throws, so the next request is not stuck behind it', async () => {
        const { signIn, deps } = gate({
            run: jest.fn().mockRejectedValueOnce(new Error('spawn failed')).mockResolvedValue(true),
        });

        await expect(signIn(false)).rejects.toThrow('spawn failed');
        await expect(signIn(false)).resolves.toBe(true);
        expect(deps.run).toHaveBeenCalledTimes(2);
    });
});

describe('createSignInGate — a sign-in that gives up', () => {
    it('counts as success when the user is signed in anyway, and takes that sign-in up', async () => {
        const { signIn, deps } = gate({
            run: jest.fn(async () => false),
            signedInNow: jest.fn(async () => true),
        });

        await expect(signIn(false)).resolves.toBe(true);
        expect(deps.adoptSignIn).toHaveBeenCalledTimes(1);
    });

    it('fails when nobody signed in', async () => {
        const { signIn, deps } = gate({ run: jest.fn(async () => false) });

        await expect(signIn(false)).resolves.toBe(false);
        expect(deps.adoptSignIn).not.toHaveBeenCalled();
    });

    // A forced sign-in is an org switch: a token for the OLD org is not a switch.
    it('does not rescue a forced sign-in with a token that was already there', async () => {
        const { signIn, deps } = gate({
            run: jest.fn(async () => false),
            signedInNow: jest.fn(async () => true),
        });

        await expect(signIn(true)).resolves.toBe(false);
        expect(deps.signedInNow).not.toHaveBeenCalled();
    });

    it('does not ask again after a sign-in that worked', async () => {
        const { signIn, deps } = gate();

        await signIn(false);

        expect(deps.signedInNow).not.toHaveBeenCalled();
    });
});
