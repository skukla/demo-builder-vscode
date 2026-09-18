/**
 * runtimeCredentials — workspace Runtime namespace/auth materialization for
 * `aio app deploy`/`undeploy`, plus the oclif stderr error extractor.
 *
 * Root-caused 2026-07-09: the first live shell-app deploy died with "missing
 * Adobe I/O Runtime namespace" (catalog repos ship no .env; withOrgContext
 * only targets Console ops), and the real error was hidden behind oclif's
 * stderr spinner frames.
 */

import * as fsPromises from 'fs/promises';
import {
    ensureWorkspaceRuntime,
    aioOutputTail,
    extractAioErrorDetail,
    fetchRuntimeCredentials,
    workspaceHasRuntime,
} from '@/features/app-builder/services/runtimeCredentials';
import { sleep } from '@/core/utils/sleep';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

jest.mock('fs/promises', () => ({
    mkdtemp: jest.fn().mockResolvedValue('/tmp/db-ws-abc'),
    readFile: jest.fn(),
    rm: jest.fn().mockResolvedValue(undefined),
}));

// The re-check pause is the only observable difference between "waited between
// attempts" and "hammered the API three times in a row", so it is asserted, not slept.
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

const executeMock = jest.fn();
const commandManager = createMockCommandExecutor({ execute: executeMock });
const logger = createMockLogger() as unknown as Logger;

const WORKSPACE_JSON = JSON.stringify({
    project: {
        workspace: {
            name: 'Stage',
            details: {
                runtime: {
                    namespaces: [
                        { name: '12345-myproject-stage', auth: 'fake-test-pw-not-a-secret' },
                    ],
                },
            },
        },
    },
});

describe('fetchRuntimeCredentials', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (fsPromises.mkdtemp as jest.Mock).mockResolvedValue('/tmp/db-ws-abc');
    });

    it('downloads the workspace JSON and returns namespace + auth', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        (fsPromises.readFile as jest.Mock).mockResolvedValue(WORKSPACE_JSON);

        const creds = await fetchRuntimeCredentials(commandManager, logger, 'auto');

        expect(executeMock).toHaveBeenCalledWith(
            expect.stringMatching(/^aio console workspace download "/),
            // `shell: true` is what makes the quoted path survive the call; without it
            // the aio CLI is handed a path it cannot write to.
            expect.objectContaining({ shell: true, useNodeVersion: 'auto', enhancePath: true })
        );
        expect(creds).toEqual({
            namespace: '12345-myproject-stage',
            auth: 'fake-test-pw-not-a-secret',
        });
    });

    it('never logs the auth value', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        (fsPromises.readFile as jest.Mock).mockResolvedValue(WORKSPACE_JSON);

        await fetchRuntimeCredentials(commandManager, logger, 'auto');

        const allLogged = [logger.info, logger.debug, logger.warn, logger.error]
            .flatMap((fn) => (fn as jest.Mock).mock.calls.flat())
            .filter((arg) => typeof arg === 'string')
            .join(' ');
        expect(allLogged).not.toContain('fake-test-pw-not-a-secret');
    });

    it('always removes the downloaded file (secret hygiene), even on failure', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        (fsPromises.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

        await expect(fetchRuntimeCredentials(commandManager, logger, 'auto')).rejects.toThrow();

        expect(fsPromises.rm).toHaveBeenCalledWith(
            '/tmp/db-ws-abc',
            expect.objectContaining({ recursive: true, force: true })
        );
    });

    it('throws an actionable error when the workspace has no Runtime namespace', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        (fsPromises.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({ project: { workspace: { details: { runtime: { namespaces: [] } } } } })
        );

        await expect(fetchRuntimeCredentials(commandManager, logger, 'auto')).rejects.toThrow(
            /no Adobe I\/O Runtime namespace/
        );
    });

    it.each([
        ['a namespace with no auth key', { name: '12345-myproject-stage' }],
        ['an auth key with no namespace name', { auth: 'fake-test-pw-not-a-secret' }],
    ])('refuses half a credential — %s', async (_label, namespace) => {
        // Half a credential deploys nothing; it fails later, in `aio app deploy`,
        // where the message says nothing about the workspace.
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        (fsPromises.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({
                project: { workspace: { details: { runtime: { namespaces: [namespace] } } } },
            })
        );

        await expect(fetchRuntimeCredentials(commandManager, logger, 'auto')).rejects.toThrow(
            /no Adobe I\/O Runtime namespace/
        );
    });

    it('reports the exit code when the failing command wrote no error line', async () => {
        executeMock.mockResolvedValue({ code: 7, stdout: '', stderr: '- spinner only\n' });

        await expect(fetchRuntimeCredentials(commandManager, logger, 'auto')).rejects.toThrow(
            /exit code 7/
        );
    });

    it('surfaces the aio error line when the download command fails', async () => {
        executeMock.mockResolvedValue({
            code: 2,
            stdout: '',
            stderr: '- Downloading Workspace config...\n ›   Error: 404 - Not Found',
        });

        await expect(fetchRuntimeCredentials(commandManager, logger, 'auto')).rejects.toThrow(
            /404 - Not Found/
        );
    });
});

const NO_NS_JSON = JSON.stringify({
    project: { workspace: { details: { runtime: { namespaces: [] } } } },
});

describe('workspaceHasRuntime', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (fsPromises.mkdtemp as jest.Mock).mockResolvedValue('/tmp/db-ws-abc');
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    });

    it('is true when the workspace has a Runtime namespace', async () => {
        (fsPromises.readFile as jest.Mock).mockResolvedValue(WORKSPACE_JSON);
        await expect(workspaceHasRuntime(commandManager, 'auto')).resolves.toBe(true);
    });

    it('is false when the workspace has none', async () => {
        (fsPromises.readFile as jest.Mock).mockResolvedValue(NO_NS_JSON);
        await expect(workspaceHasRuntime(commandManager, 'auto')).resolves.toBe(false);
    });

    // The download JSON is read defensively at six levels, and every one of them is a
    // shape the CLI really returns: an un-provisioned workspace stops at `details`, a
    // Runtime-less one at `runtime`. A workspace that answers a partial shape must come
    // back "no namespace" — never a crash, which the deploy path would report as a bug.
    it.each([
        ['unparseable output', 'not json at all {'],
        ['no project', '{}'],
        ['no workspace', JSON.stringify({ project: {} })],
        ['no details', JSON.stringify({ project: { workspace: {} } })],
        ['no runtime block', JSON.stringify({ project: { workspace: { details: {} } } })],
        [
            'no namespaces list',
            JSON.stringify({ project: { workspace: { details: { runtime: {} } } } }),
        ],
    ])('is false, not a crash, when the download has %s', async (_label, raw) => {
        (fsPromises.readFile as jest.Mock).mockResolvedValue(raw);
        await expect(workspaceHasRuntime(commandManager, 'auto')).resolves.toBe(false);
    });
});

describe('ensureWorkspaceRuntime (provision-if-missing)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (fsPromises.mkdtemp as jest.Mock).mockResolvedValue('/tmp/db-ws-abc');
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    });

    it('does NOT provision when the workspace already has a namespace', async () => {
        (fsPromises.readFile as jest.Mock).mockResolvedValue(WORKSPACE_JSON);
        const provision = jest.fn().mockResolvedValue(undefined);

        await ensureWorkspaceRuntime(commandManager, logger, 'auto', provision, 0);

        expect(provision).not.toHaveBeenCalled();
    });

    it('provisions once when missing, then succeeds when the re-check finds it', async () => {
        // Absent on the first check, present after provisioning.
        (fsPromises.readFile as jest.Mock)
            .mockResolvedValueOnce(NO_NS_JSON)
            .mockResolvedValue(WORKSPACE_JSON);
        const provision = jest.fn().mockResolvedValue(undefined);

        await ensureWorkspaceRuntime(commandManager, logger, 'auto', provision, 0);

        expect(provision).toHaveBeenCalledTimes(1);
    });

    it('throws the provision-failed message when the namespace never appears', async () => {
        (fsPromises.readFile as jest.Mock).mockResolvedValue(NO_NS_JSON); // always absent
        const provision = jest.fn().mockResolvedValue(undefined);

        await expect(
            ensureWorkspaceRuntime(commandManager, logger, 'auto', provision, 0)
        ).rejects.toThrow(/Could not provision an Adobe I\/O Runtime namespace/);
        expect(provision).toHaveBeenCalledTimes(1);
    });

    it('waits for the THIRD re-check — provisioning lags, and giving up early is a lie', async () => {
        (fsPromises.readFile as jest.Mock)
            .mockResolvedValueOnce(NO_NS_JSON) // the pre-provision check
            .mockResolvedValueOnce(NO_NS_JSON) // re-check 1
            .mockResolvedValueOnce(NO_NS_JSON) // re-check 2
            .mockResolvedValue(WORKSPACE_JSON); // re-check 3 — it landed
        const provision = jest.fn().mockResolvedValue(undefined);

        await expect(
            ensureWorkspaceRuntime(commandManager, logger, 'auto', provision, 0)
        ).resolves.toBeUndefined();
    });

    it('pauses between re-checks, but not after the last one', async () => {
        (fsPromises.readFile as jest.Mock).mockResolvedValue(NO_NS_JSON);
        const provision = jest.fn().mockResolvedValue(undefined);

        await expect(
            ensureWorkspaceRuntime(commandManager, logger, 'auto', provision, 250)
        ).rejects.toThrow();

        // Three attempts, two gaps. A pause after the final attempt delays the failure
        // for nothing; no pause at all re-reads the same stale answer three times.
        expect(sleep).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledWith(250);
    });
});

describe('extractAioErrorDetail', () => {
    it('extracts the › Error: line and drops spinner frames', () => {
        const stderr =
            "- Building actions for 'application'\n" +
            "✔ Built 1 action(s) for 'application'\n" +
            "✖ Deploying actions for 'application'\n" +
            ' ›   Error: missing Adobe I/O Runtime namespace, did you set the \n' +
            ' ›   AIO_RUNTIME_NAMESPACE environment variable?';

        const detail = extractAioErrorDetail(stderr);

        expect(detail).toContain('missing Adobe I/O Runtime namespace');
        expect(detail).not.toContain('Building actions');
    });

    it('returns empty string for undefined or error-free stderr', () => {
        expect(extractAioErrorDetail(undefined)).toBe('');
        expect(extractAioErrorDetail('- spinner only\n✔ done')).toBe('');
    });

    // oclif's marker is written several ways depending on terminal width and the
    // command that emitted it. Each row below is a real spacing the extractor must
    // strip — and the last is a › that is part of the MESSAGE, which it must not touch.
    it.each([
        ['no space before the marker', '›   Error: 404 - Not Found', 'Error: 404 - Not Found'],
        ['no space after the marker', ' ›Error: 404 - Not Found', 'Error: 404 - Not Found'],
        ['space on both sides', ' ›   Error: 404 - Not Found', 'Error: 404 - Not Found'],
        [
            'a marker inside the message',
            'Error: open Console › Runtime to enable it',
            'Error: open Console › Runtime to enable it',
        ],
    ])('strips the oclif marker with %s', (_label, stderr, expected) => {
        expect(extractAioErrorDetail(stderr)).toBe(expected);
    });

    it('joins several error lines with exactly one space', () => {
        const stderr = ' ›   Error: first thing  \n ›   Error: second thing ';

        expect(extractAioErrorDetail(stderr)).toBe('Error: first thing Error: second thing');
    });
});

describe('extractAioErrorDetail — a wrapped error keeps its continuation', () => {
    // Bodea, 2026-09-18: oclif wrapped the error over two › lines and only the first
    // says "Error", so the message stopped at "Request f8339eb4… to" and lost the
    // endpoint and the status code that said what failed.
    it('keeps every › line of the block an error starts', () => {
        const stderr =
            "- Deploying database in the 'amer' region...\n" +
            ' ›   Error: Request f8339eb4-bad0-41ea-a90a-67e23387392e to\n' +
            ' ›   v1/db/provision/request failed with code 504: Gateway Timeout\n' +
            '- trailing spinner';

        expect(extractAioErrorDetail(stderr)).toBe(
            'Error: Request f8339eb4-bad0-41ea-a90a-67e23387392e to v1/db/provision/request failed with code 504: Gateway Timeout',
        );
    });

    it('does not pull a later, unmarked line into the error', () => {
        const stderr = ' ›   Error: first thing\nsome unrelated output';

        expect(extractAioErrorDetail(stderr)).toBe('Error: first thing');
    });
});

describe('aioOutputTail', () => {
    const ESC = String.fromCharCode(27);

    it('keeps the warning a failure hides, drops spinner frames and colour, collapses repeats', () => {
        const stdout = `${ESC}[33m⚠ Database status check failed: 403 Workspace authorization failed${ESC}[39m\n`;
        const stderr = '-\n\\\n|\n- Deploying...\n- Deploying...\n ›   Error: Request x to v1/db/provision/request failed with code 504';

        expect(aioOutputTail(stdout, stderr)).toBe(
            '⚠ Database status check failed: 403 Workspace authorization failed\n' +
                '- Deploying...\n' +
                ' ›   Error: Request x to v1/db/provision/request failed with code 504',
        );
    });

    it('masks token-shaped strings and keeps only the last lines', () => {
        const token = 'a'.repeat(48);
        const stdout = Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n') + `\nauth ${token}`;

        const tail = aioOutputTail(stdout, '', 5).split('\n');

        expect(tail).toStrictEqual(['line 76', 'line 77', 'line 78', 'line 79', 'auth <masked>']);
    });

    it('answers empty for no output', () => {
        expect(aioOutputTail(undefined, undefined)).toBe('');
    });
});
