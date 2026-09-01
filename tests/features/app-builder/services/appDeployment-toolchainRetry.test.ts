/**
 * Toolchain refresh-and-retry (the PL-6 bridge, 2026-08-27).
 *
 * A build failure carrying a CLI-staleness signature triggers ONE consent-gated
 * refresh (`npm install -g @adobe/aio-cli`) and ONE retry, all inside a single
 * deployAppComponent call — so the caller's first try still succeeds on
 * machines that needed healing. Everything else fails straight through.
 *
 * The signature fixture is the REAL one, measured live: webpack 5.107.2
 * (frozen in an old install of a version-current CLI) fails the kit's
 * generated actions with this text; a fresh install of the SAME version fixes
 * it.
 */

// appDeployment imports `promises` from 'fs'; runtimeCredentials imports
// 'fs/promises' — both forms must resolve to the SAME mock or the credential
// download silently uses the real filesystem (it did, on this suite's first
// run: a real mkdtemp under /var/folders and an ENOENT that replaced every
// expected failure).
jest.mock('fs', () => ({
    promises: {
        access: jest.fn(),
        readFile: jest.fn(),
        mkdtemp: jest.fn(),
        rm: jest.fn(),
    },
}));
// Alias, hoist-safe: both import forms resolve to the ONE mock above.
jest.mock('fs/promises', () => jest.requireMock('fs').promises);

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { NORMAL: 1000, LONG: 2000, VERY_LONG: 3000 },
}));

import * as fs from 'fs';
import {
    deployAppComponent,
    isToolchainStalenessError,
} from '@/features/app-builder/services/appDeployment';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

const mockFs = fs.promises as jest.Mocked<typeof fs.promises>;

const STALE_ERROR =
    'action build failed, webpack compilation errors: ' +
    '"CodeGenerationError: Self-reference dependency has unused export name"';

const WORKSPACE_JSON = JSON.stringify({
    project: {
        workspace: {
            name: 'Stage',
            details: {
                runtime: { namespaces: [{ name: 'ns-1', auth: 'fake-test-pw-not-a-secret' }] },
            },
        },
    },
});

const GET_URL_JSON = JSON.stringify({ runtime: { 'web/action': 'https://ns-1.example/api' } });

function makeLogger() {
    return createMockLogger();
}

/**
 * Executor whose `aio app deploy` fails with the staleness signature until
 * `npm install -g @adobe/aio-cli` has run, then succeeds — the measured
 * behaviour of the real machine on 2026-08-27.
 */
function makeHealableExecutor() {
    let refreshed = false;
    const execute = jest.fn().mockImplementation((command: string) => {
        if (command.startsWith('npm install -g @adobe/aio-cli')) {
            refreshed = true;
            return Promise.resolve({ code: 0, stdout: '', stderr: '' });
        }
        if (command.includes('workspace download')) {
            mockFs.readFile.mockResolvedValue(WORKSPACE_JSON as never);
            return Promise.resolve({ code: 0, stdout: '', stderr: '' });
        }
        if (command.includes('get-url')) {
            return Promise.resolve({ code: 0, stdout: GET_URL_JSON, stderr: '' });
        }
        if (command.includes('app deploy')) {
            return refreshed
                ? Promise.resolve({ code: 0, stdout: 'Successful deployment', stderr: '' })
                : Promise.resolve({ code: 1, stdout: '', stderr: `› Error: ${STALE_ERROR}` });
        }
        return Promise.resolve({ code: 0, stdout: '', stderr: '' });
    });
    return { execute };
}

beforeEach(() => {
    jest.clearAllMocks();
    // No build script → buildComponent is a no-op; no legacy .env reads.
    mockFs.access.mockRejectedValue(new Error('ENOENT'));
    mockFs.readFile.mockResolvedValue(WORKSPACE_JSON as never);
    mockFs.mkdtemp.mockResolvedValue('/tmp/db-test' as never);
    mockFs.rm.mockResolvedValue(undefined as never);
});

describe('isToolchainStalenessError', () => {
    it('matches the measured self-reference signature and nothing generic', () => {
        expect(isToolchainStalenessError(STALE_ERROR)).toBe(true);
        expect(isToolchainStalenessError('plain deploy failure: network timeout')).toBe(false);
        expect(isToolchainStalenessError(undefined)).toBe(false);
    });
});


describe('deployAppComponent — refresh-and-retry', () => {
    it('consent yes: refreshes the CLI once and the SAME call succeeds', async () => {
        const cm = makeHealableExecutor();
        const consent = jest.fn().mockResolvedValue(true);

        const result = await deployAppComponent('/app', cm as never, makeLogger(), {
            confirmToolchainRefresh: consent,
        });

        expect(consent).toHaveBeenCalledTimes(1);
        const commands = cm.execute.mock.calls.map((c) => c[0] as string);
        expect(commands.filter((c) => c.startsWith('npm install -g @adobe/aio-cli'))).toHaveLength(
            1
        );
        expect(result.success).toBe(true);
    });

    it('consent no: fails with the remedy hint appended, CLI untouched', async () => {
        const cm = makeHealableExecutor();
        const consent = jest.fn().mockResolvedValue(false);

        const result = await deployAppComponent('/app', cm as never, makeLogger(), {
            confirmToolchainRefresh: consent,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Self-reference dependency');
        expect(result.error).toContain('refreshCli: true');
        const commands = cm.execute.mock.calls.map((c) => c[0] as string);
        expect(commands.some((c) => c.startsWith('npm install -g'))).toBe(false);
    });

    it('no consent source at all: same hint, no prompt-shaped behaviour', async () => {
        const cm = makeHealableExecutor();

        const result = await deployAppComponent('/app', cm as never, makeLogger(), {});

        expect(result.success).toBe(false);
        expect(result.error).toContain('out-of-date Adobe CLI toolchain');
    });

    it('retries exactly ONCE — a persistent failure returns the second error', async () => {
        // An executor whose deploy fails with the signature FOREVER.
        const execute = jest.fn().mockImplementation((command: string) => {
            if (command.includes('app deploy')) {
                return Promise.resolve({ code: 1, stdout: '', stderr: `› Error: ${STALE_ERROR}` });
            }
            if (command.includes('get-url')) {
                return Promise.resolve({ code: 0, stdout: GET_URL_JSON, stderr: '' });
            }
            return Promise.resolve({ code: 0, stdout: '', stderr: '' });
        });
        const consent = jest.fn().mockResolvedValue(true);

        const result = await deployAppComponent(
            '/app',
            createMockCommandExecutor({ execute }),
            makeLogger(),
            {
                confirmToolchainRefresh: consent,
            }
        );

        expect(result.success).toBe(false);
        // One refresh, two deploy attempts, no loop.
        const commands = execute.mock.calls.map((c) => c[0] as string);
        expect(commands.filter((c) => c.startsWith('npm install -g'))).toHaveLength(1);
        expect(commands.filter((c) => c.includes('app deploy'))).toHaveLength(2);
        expect(consent).toHaveBeenCalledTimes(1);
    });

    it('a NON-staleness failure never consults consent', async () => {
        const execute = jest.fn().mockImplementation((command: string) => {
            if (command.includes('app deploy')) {
                return Promise.resolve({ code: 1, stdout: '', stderr: '› Error: quota exceeded' });
            }
            return Promise.resolve({ code: 0, stdout: '', stderr: '' });
        });
        const consent = jest.fn();

        const result = await deployAppComponent(
            '/app',
            createMockCommandExecutor({ execute }),
            makeLogger(),
            {
                confirmToolchainRefresh: consent,
            }
        );

        expect(result.success).toBe(false);
        expect(consent).not.toHaveBeenCalled();
        expect(result.error).not.toContain('refreshCli');
    });

    it('a failed refresh reports both failures and does not retry', async () => {
        const execute = jest.fn().mockImplementation((command: string) => {
            if (command.startsWith('npm install -g')) {
                return Promise.resolve({ code: 1, stdout: '', stderr: 'EACCES' });
            }
            if (command.includes('app deploy')) {
                return Promise.resolve({ code: 1, stdout: '', stderr: `› Error: ${STALE_ERROR}` });
            }
            return Promise.resolve({ code: 0, stdout: '', stderr: '' });
        });

        const result = await deployAppComponent(
            '/app',
            createMockCommandExecutor({ execute }),
            makeLogger(),
            {
                confirmToolchainRefresh: async () => true,
            }
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Adobe CLI update failed');
        expect(result.error).toContain('EACCES');
        expect(
            execute.mock.calls.filter((c) => (c[0] as string).includes('app deploy'))
        ).toHaveLength(1);
    });
});
