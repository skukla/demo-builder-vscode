/**
 * Tests for signInToAdobe — the ONE Sign In that a screen's button, the Sign In
 * command and the agent's `sign_in` tool all run.
 *
 * Its mode is a parameter (who is asking), never a decision a door makes: a person
 * sees the browser notice and is told about DA.live by the notification the sign-in
 * raises itself; an agent sees no notice and gets the DA.live notices in its result.
 * It never forces: only the org switch does.
 */

jest.mock(
    'vscode',
    () => ({
        window: {
            withProgress: jest.fn(
                async (_options: unknown, task: (progress: unknown, token: unknown) => unknown) =>
                    task(
                        { report: jest.fn() },
                        { isCancellationRequested: false, onCancellationRequested: jest.fn() }
                    )
            ),
        },
        ProgressLocation: { Notification: 15, Window: 10 },
    }),
    { virtual: true }
);

import { reportSignInNotice } from '@/core/auth/signInNotices';
import { signInToAdobe } from '@/features/authentication/handlers/signInToAdobe';
import { createMockLogger } from '../../../helpers/loggerFake';

const DA_LIVE_ENDED = 'Your DA.live sign-in ended.';

/** A login that also reports what it ended elsewhere, as the DA.live watch does. */
function loginReporting(result: boolean): jest.Mock {
    return jest.fn(async () => {
        reportSignInNotice(DA_LIVE_ENDED);
        return result;
    });
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('signInToAdobe', () => {
    it('signs in without forcing — only the org switch forces', async () => {
        const login = jest.fn(async () => true);

        const outcome = await signInToAdobe({ login }, createMockLogger(), 'person');

        expect(login).toHaveBeenCalledTimes(1);
        expect(login).toHaveBeenCalledWith();
        expect(outcome.success).toBe(true);
    });

    it('shows the browser notice when a person asked', async () => {
        const vscodeMock = jest.requireMock('vscode');

        await signInToAdobe({ login: jest.fn(async () => true) }, createMockLogger(), 'person');

        expect(vscodeMock.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: expect.stringMatching(/browser/i) }),
            expect.any(Function)
        );
    });

    it('leaves DA.live notices to the notification when a person asked', async () => {
        const outcome = await signInToAdobe(
            { login: loginReporting(true) },
            createMockLogger(),
            'person'
        );

        expect(outcome.notices).toStrictEqual([]);
    });

    it('hands an agent the DA.live notices and shows no browser notice', async () => {
        const vscodeMock = jest.requireMock('vscode');

        const outcome = await signInToAdobe(
            { login: loginReporting(true) },
            createMockLogger(),
            'agent'
        );

        expect(outcome).toStrictEqual({ success: true, notices: [DA_LIVE_ENDED] });
        expect(vscodeMock.window.withProgress).not.toHaveBeenCalled();
    });

    it('reports a cancelled sign-in as not signed in', async () => {
        const outcome = await signInToAdobe(
            { login: jest.fn(async () => false) },
            createMockLogger(),
            'person'
        );

        expect(outcome.success).toBe(false);
    });

    it('reports a sign-in that threw as not signed in, and leaves a line in the log', async () => {
        const logger = createMockLogger();

        const outcome = await signInToAdobe(
            { login: jest.fn(async () => Promise.reject(new Error('aio crashed'))) },
            logger,
            'person'
        );

        expect(outcome.success).toBe(false);
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('answers not signed in when there is no auth service', async () => {
        const outcome = await signInToAdobe(undefined, createMockLogger(), 'agent');

        expect(outcome).toStrictEqual({ success: false, notices: [] });
    });
});
