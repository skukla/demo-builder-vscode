/**
 * Shared setup for the storefrontSyncService suites.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import the
 * service and the exec fakes from HERE and declare no jest.mock of their own —
 * jest.mock hoists above the imports of the module it appears in, NOT across
 * modules, so an import left behind in a spec loads the real child_process
 * before these mocks register.
 *
 * Extracted 2026-09-06 when the single suite passed the 750-line limit.
 */

import * as childProcess from 'child_process';
import { previewAndPublishPage } from '@/features/eds/services/helix/helixApiClient';
import { credentialedUrlShape } from '../../../../helpers/credentialShapes';

jest.mock('child_process', () => ({
    execFile: jest.fn(),
}));

jest.mock('@/features/eds/services/helix/helixApiClient', () => ({
    previewAndPublishPage: jest.fn(),
}));

export {
    GitOperationError,
    PushRejectedError,
    rebaseOntoRemote,
    syncAndPublish,
} from '@/features/eds/services/storefront/storefrontSyncService';

// `util.promisify(execFile)` returns a Promise-returning wrapper. The mock above
// is the callback form; suites drive it by configuring the implementation.
export const execFileMock = childProcess.execFile as unknown as jest.Mock;
export const previewMock = previewAndPublishPage as jest.Mock;

export const STOREFRONT = '/projects/demo/components/eds-storefront';

/** The remote `git remote get-url origin` reports in these fakes. */
export const REMOTE_URL = 'https://github.com/owner/repo.git\n';

/**
 * Exactly what `injectTokenIntoUrl` produces for that remote — assembled by parts.
 *
 * Written as a literal this is a userinfo URL, which GitGuardian reads as a credential
 * whatever it spells; `tests/sop/no-credential-shaped-fixtures.test.ts` bans the shape and
 * names this builder as the way through. Same string, nothing for a scanner to match.
 */
export const TOKENIZED_REMOTE = credentialedUrlShape(
    REMOTE_URL.trim(),
    'gh-token-abc',
    'x-oauth-basic'
);

/** The callback shape `promisify` expects back from the mocked execFile. */
type ExecCallback = (err: Error | null, result?: { stdout: string; stderr: string }) => void;

/** A git failure carrying the streams the service reads off it. */
export function gitFailure(streams: { stderr?: string; stdout?: string }): Error {
    const err = new Error('Command failed') as NodeJS.ErrnoException & {
        stderr?: string;
        stdout?: string;
    };
    if (streams.stderr !== undefined) err.stderr = streams.stderr;
    if (streams.stdout !== undefined) err.stdout = streams.stdout;
    return err;
}

/**
 * Every git command succeeds, and `remote get-url` answers with {@link REMOTE_URL}.
 *
 * `fail` names one subcommand to fail instead — matched against the argv the
 * service passes, which is what a caller would have to get right for real.
 */
export function execImpl(fail?: { when: (args: string[]) => boolean; error: Error }): void {
    execFileMock.mockImplementation((cmd: string, args: string[], cb: ExecCallback) => {
        if (args.includes('remote') && args.includes('get-url')) {
            cb(null, { stdout: REMOTE_URL, stderr: '' });
            return;
        }
        if (fail?.when(args)) {
            cb(fail.error);
            return;
        }
        cb(null, { stdout: '', stderr: '' });
    });
}

/** Every git command succeeds. */
export function defaultExecImpl(): void {
    execImpl();
}

/** `git commit` fails with `message` on stderr. */
export function execImplWithCommitFailure(message: string): void {
    execImpl({ when: (args) => args.includes('commit'), error: gitFailure({ stderr: message }) });
}

/** `git push` fails with an arbitrary stderr, for rejection-classification tests. */
export function execImplWithPushStderr(stderr: string): void {
    execImpl({ when: (args) => args.includes('push'), error: gitFailure({ stderr }) });
}

/** `git push` fails the way a remote that moved ahead reports it. */
export function execImplWithPushRejected(): void {
    execImplWithPushStderr(
        '! [rejected] main -> main (non-fast-forward)\nerror: failed to push some refs'
    );
}
