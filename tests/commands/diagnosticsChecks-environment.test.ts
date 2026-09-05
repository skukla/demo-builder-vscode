/**
 * The parts of the diagnostics report that read the MACHINE rather than a CLI —
 * system, VS Code, environment, orphaned settings, and the two capability tests.
 *
 * `os`, `fs` and the VS Code surfaces are handed in through module mocks so the
 * assertions can be exact: a report that prints the host's real memory can only
 * be checked against the same call that produced it, which tests nothing.
 *
 * `jest.mock` is declared HERE rather than in `diagnosticsChecks.testUtils`
 * because these three mocks belong to this suite alone — the sibling suites
 * drive the same module against a real `os` and would have to opt back out.
 */

jest.mock('os', () => ({
    ...jest.requireActual('os'),
    platform: jest.fn(() => 'darwin'),
    release: jest.fn(() => '25.6.0'),
    arch: jest.fn(() => 'arm64'),
    cpus: jest.fn(() => [{}, {}, {}, {}]),
    totalmem: jest.fn(() => 16 * 1024 * 1024 * 1024),
    homedir: jest.fn(() => '/nowhere/home'),
    tmpdir: jest.fn(() => '/nowhere/tmp'),
}));
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    promises: {
        writeFile: jest.fn(),
        readFile: jest.fn(),
        unlink: jest.fn(),
    },
}));
jest.mock('vscode', () => ({
    ...jest.requireActual('vscode'),
    version: '1.95.3',
    env: {
        ...jest.requireActual('vscode').env,
        appName: 'Visual Studio Code',
        language: 'en',
        machineId: 'machine-1234567890abcdef',
        sessionId: 'session-abcdef1234567890',
    },
    extensions: { getExtension: jest.fn() },
}));

import { promises as fs } from 'fs';
import * as os from 'os';
import { delimiter } from 'path';
import * as vscode from 'vscode';

import { mockExecute, ranCommands } from './diagnosticsChecks.testUtils';
import {
    checkOrphanedSettings,
    getEnvironment,
    getSystemInfo,
    getVSCodeInfo,
    runTests,
    testBrowserLaunch,
    testFileSystem,
} from '@/commands/diagnosticsChecks';

const getExtension = vscode.extensions.getExtension as jest.Mock;
const getConfiguration = vscode.workspace.getConfiguration as jest.Mock;
const writeFile = fs.writeFile as jest.Mock;
const readFile = fs.readFile as jest.Mock;
const unlink = fs.unlink as jest.Mock;
const platform = os.platform as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    platform.mockReturnValue('darwin');
    mockExecute.mockResolvedValue({ stdout: '', stderr: '', code: 0 });
    writeFile.mockResolvedValue(undefined);
    readFile.mockResolvedValue('test');
    unlink.mockResolvedValue(undefined);
});

describe('getSystemInfo', () => {
    it('reports each host fact from the slot that holds it', async () => {
        expect(await getSystemInfo()).toEqual({
            platform: 'darwin',
            release: '25.6.0',
            arch: 'arm64',
            cpus: 4,
            memory: '16GB',
            homedir: '/nowhere/home',
            tmpdir: '/nowhere/tmp',
            shell: process.env.SHELL || 'unknown',
        });
    });

    it('reports memory in whole gigabytes', async () => {
        // Bytes -> GiB is a division by 1024 three times; every other
        // arrangement of those operators lands on a different number.
        (os.totalmem as jest.Mock).mockReturnValue(34_359_738_368);

        expect((await getSystemInfo()).memory).toBe('32GB');
    });

    it('names the login shell', async () => {
        const previous = process.env.SHELL;
        process.env.SHELL = '/bin/zsh';
        try {
            expect((await getSystemInfo()).shell).toBe('/bin/zsh');
        } finally {
            process.env.SHELL = previous;
        }
    });

    it('says "unknown" when no shell is set', async () => {
        const previous = process.env.SHELL;
        delete process.env.SHELL;
        try {
            expect((await getSystemInfo()).shell).toBe('unknown');
        } finally {
            process.env.SHELL = previous;
        }
    });
});

describe('getVSCodeInfo', () => {
    it('reports the editor build and truncates both machine identifiers', () => {
        // The ids are truncated because a full machineId identifies the host,
        // and diagnostics reports get pasted into shared threads.
        expect(getVSCodeInfo()).toEqual({
            version: '1.95.3',
            appName: 'Visual Studio Code',
            language: 'en',
            machineId: 'machine-...',
            sessionId: 'session-...',
        });
    });
});

describe('getEnvironment', () => {
    it('splits PATH into its entries and passes the rest through', () => {
        const previous = { PATH: process.env.PATH, FNM_DIR: process.env.FNM_DIR };
        process.env.PATH = ['/usr/bin', '/opt/homebrew/bin'].join(delimiter);
        process.env.FNM_DIR = '/nowhere/.fnm';
        try {
            const env = getEnvironment();

            expect(env.PATH).toEqual(['/usr/bin', '/opt/homebrew/bin']);
            expect(env.FNM_DIR).toBe('/nowhere/.fnm');
        } finally {
            process.env.PATH = previous.PATH;
            if (previous.FNM_DIR === undefined) delete process.env.FNM_DIR;
            else process.env.FNM_DIR = previous.FNM_DIR;
        }
    });

    it('reports an EMPTY path list rather than undefined when PATH is unset', () => {
        // The report iterates this list; handing it undefined turns a
        // diagnostic into the failure it was called to explain.
        const previous = process.env.PATH;
        delete process.env.PATH;
        try {
            expect(getEnvironment().PATH).toEqual([]);
        } finally {
            process.env.PATH = previous;
        }
    });
});

describe('checkOrphanedSettings', () => {
    /** A manifest contributing exactly the named keys. */
    function manifestWith(...keys: string[]) {
        const properties: Record<string, unknown> = {};
        for (const key of keys) properties[key] = { type: 'string' };
        return { packageJSON: { contributes: { configuration: { properties } } } };
    }

    /**
     * The user's resolved `demoBuilder` tree, plus what `inspect` says of it.
     *
     * `inspect` answers only for LEAF keys — VS Code returns undefined for a
     * container like `demoBuilder.daLive`, and that undefined is what tells the
     * walk to descend rather than stop.
     */
    function userSettings(leaves: Record<string, boolean>, tree: Record<string, unknown>) {
        const inspect = jest.fn((key: string) => {
            if (!(key in leaves)) return undefined;
            return leaves[key] ? { globalValue: 'set-by-user' } : { defaultValue: '' };
        });
        getConfiguration.mockImplementation((section?: string) =>
            section === undefined ? { inspect } : tree,
        );
    }

    it('names the key the user set that nothing contributes any more', () => {
        // The rename that earned this check: `daLive.AEMRepositoryId` became
        // `daLive.aemAuthorUrl`, the old value stayed in settings.json, and
        // every site was bound to the shipped default for six months.
        getExtension.mockReturnValue(manifestWith('demoBuilder.daLive.aemAuthorUrl'));
        userSettings(
            {
                'demoBuilder.daLive.aemAuthorUrl': true,
                'demoBuilder.daLive.AEMRepositoryId': true,
            },
            { daLive: { aemAuthorUrl: 'a', AEMRepositoryId: 'b' } },
        );

        expect(checkOrphanedSettings()).toEqual(['demoBuilder.daLive.AEMRepositoryId']);
    });

    it('accuses nothing when the manifest contributes no settings at all', () => {
        // Without the manifest every key the user set looks orphaned. Saying
        // nothing is the only safe answer.
        getExtension.mockReturnValue({ packageJSON: {} });
        userSettings(
            { 'demoBuilder.daLive.AEMRepositoryId': true },
            { daLive: { AEMRepositoryId: 'b' } },
        );

        expect(checkOrphanedSettings()).toEqual([]);
    });

    it('accuses nothing when reading the configuration throws', () => {
        getExtension.mockReturnValue(manifestWith('demoBuilder.daLive.aemAuthorUrl'));
        getConfiguration.mockImplementation(() => {
            throw new Error('workspace not ready');
        });

        expect(checkOrphanedSettings()).toEqual([]);
    });
});

describe('testFileSystem', () => {
    it('writes, reads back and cleans up a probe file in the temp directory', async () => {
        const result = await testFileSystem();

        expect(writeFile).toHaveBeenCalledWith('/nowhere/tmp/demo-builder-test.txt', 'test');
        expect(readFile).toHaveBeenCalledWith('/nowhere/tmp/demo-builder-test.txt', 'utf8');
        expect(unlink).toHaveBeenCalledWith('/nowhere/tmp/demo-builder-test.txt');
        expect(result).toEqual({ canWrite: true, canRead: true, tempDir: '/nowhere/tmp' });
    });

    it('reports that it cannot read when the file comes back changed', async () => {
        readFile.mockResolvedValue('something else');

        expect(await testFileSystem()).toEqual({
            canWrite: true,
            canRead: false,
            tempDir: '/nowhere/tmp',
        });
    });

    it('reports the failure when the write is refused', async () => {
        writeFile.mockRejectedValue(new Error('EACCES: permission denied'));

        expect(await testFileSystem()).toEqual({
            canWrite: false,
            canRead: false,
            error: 'EACCES: permission denied',
            tempDir: '/nowhere/tmp',
        });
    });
});

describe('testBrowserLaunch', () => {
    it('probes for `open` on macOS', async () => {
        platform.mockReturnValue('darwin');

        expect(await testBrowserLaunch()).toEqual({
            platform: 'darwin',
            command: 'open',
            available: true,
        });
        expect(ranCommands()).toEqual(['command -v open']);
    });

    it('probes for `xdg-open` on Linux', async () => {
        platform.mockReturnValue('linux');

        expect(await testBrowserLaunch()).toEqual({
            platform: 'linux',
            command: 'xdg-open',
            available: true,
        });
        expect(ranCommands()).toEqual(['command -v xdg-open']);
    });

    it('probes for `start` on Windows', async () => {
        platform.mockReturnValue('win32');

        expect(await testBrowserLaunch()).toEqual({
            platform: 'win32',
            command: 'start',
            available: true,
        });
        expect(ranCommands()).toEqual(['start /?']);
    });

    it('reports the opener unavailable when the probe fails', async () => {
        mockExecute.mockResolvedValue({ stdout: '', stderr: 'not found', code: 1 });

        expect((await testBrowserLaunch()).available).toBe(false);
    });
});

describe('runTests', () => {
    it('runs all three capability tests and returns each result under its own key', async () => {
        const results = await runTests();

        expect(results).toEqual({
            browserLaunch: { platform: 'darwin', command: 'open', available: true },
            adobeLoginCommand: { available: true, supportsForceFlag: false },
            fileSystem: { canWrite: true, canRead: true, tempDir: '/nowhere/tmp' },
        });
    });

    it('probes the browser before the Adobe login command', async () => {
        await runTests();

        expect(ranCommands()).toEqual(['command -v open', 'aio auth login --help']);
    });
});
