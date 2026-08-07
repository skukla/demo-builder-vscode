/**
 * `checkAuthenticationStatus` — does Diagnostics know the user is signed in?
 *
 * LIVE 2026-08-07: the report said `Authenticated: No` for a user whose token was
 * valid until the next day and whose `aio console org list` returned their org.
 * The check reads `ims.contexts.aio-cli-plugin-auth`, which the CLI no longer
 * populates — it stores auth under `ims.contexts.cli`. Nothing covered this
 * function, so it shipped probing a context that is simply empty.
 *
 * A diagnostic that reports the opposite of the truth is worse than one that says
 * nothing: it sent this session's verification run chasing a sign-in that had
 * already happened.
 */

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        logCommand: jest.fn(),
    })),
}));

const mockExecute = jest.fn();
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: () => ({ execute: (...a: unknown[]) => mockExecute(...a) }),
    },
}));

import { checkAuthenticationStatus } from '@/commands/diagnosticsChecks';
import type { AdobeCLIInfo } from '@/commands/diagnosticsReport';

/** Answer only the named `aio config get` path; every other read comes back empty. */
function respondTo(path: string, output: string) {
    mockExecute.mockImplementation(async (cmd: string) =>
        cmd.includes(path)
            ? { stdout: output, stderr: '', code: 0 }
            : { stdout: '', stderr: '', code: 0 }
    );
}

const TOKEN_BLOB = JSON.stringify({
    access_token: { token: 'eyJhbGciOi.fake', expiry: Date.now() + 3_600_000 },
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('checkAuthenticationStatus', () => {
    it('reports authenticated when the token lives under the `cli` context', async () => {
        // Where aio 11.x actually stores it — proven live: `aio config get
        // ims.contexts.aio-cli-plugin-auth` was empty while `ims.contexts.cli`
        // held a token and `aio console org list` succeeded.
        respondTo('ims.contexts.cli', TOKEN_BLOB);
        const adobe = {} as AdobeCLIInfo;

        await checkAuthenticationStatus(adobe);

        expect(adobe.authConfigured).toBe(true);
    });

    it('still reports authenticated for the legacy plugin context', async () => {
        respondTo('ims.contexts.aio-cli-plugin-auth', TOKEN_BLOB);
        const adobe = {} as AdobeCLIInfo;

        await checkAuthenticationStatus(adobe);

        expect(adobe.authConfigured).toBe(true);
    });

    it('reports NOT authenticated when no context holds a token', async () => {
        respondTo('nothing-matches', '');
        const adobe = {} as AdobeCLIInfo;

        await checkAuthenticationStatus(adobe);

        expect(adobe.authConfigured).toBe(false);
    });
});
