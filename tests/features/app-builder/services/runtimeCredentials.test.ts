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
    extractAioErrorDetail,
    fetchRuntimeCredentials,
    workspaceHasRuntime,
} from '@/features/app-builder/services/runtimeCredentials';
import type { CommandExecutor } from '@/core/shell';
import type { Logger } from '@/types/logger';

jest.mock('fs/promises', () => ({
    mkdtemp: jest.fn().mockResolvedValue('/tmp/db-ws-abc'),
    readFile: jest.fn(),
    rm: jest.fn().mockResolvedValue(undefined),
}));

const executeMock = jest.fn();
const commandManager = { execute: executeMock } as unknown as CommandExecutor;
const logger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
} as unknown as Logger;

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
            expect.objectContaining({ useNodeVersion: 'auto', enhancePath: true })
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
});
