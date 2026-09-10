/**
 * Node-binary resolution for the MCP entry.
 *
 * `process.execPath` inside VS Code is the Electron helper, not node, so the
 * generated `.mcp.json` shells out to find the real binary and then resolves
 * the symlink chain (fnm hands out per-PID multishell paths that do not
 * survive a reboot). Every suite in this family passes `nodePath` in, so none
 * of that ran under test: this one mocks `child_process` and drives it.
 *
 * `nodePath ?? resolve()` is the seam that matters twice — the writer and the
 * shared entry builder both take a pre-resolved binary so a sweep over many
 * projects resolves once. Both are pinned with a supplied path that DIFFERS
 * from what resolution would return, which is the only way a test can tell the
 * two apart.
 */

jest.mock('child_process', () => ({ execFile: jest.fn() }));

import { fsPromises, writeMcpConfigs } from './mcpConfigWriter.testUtils';
import * as childProcess from 'child_process';
import { makeEdsProject } from './aiBundleFixtures';
import { makeTestWriter } from './generatedFileWriter.testUtils';
import {
    buildDemoBuilderMcpEntry,
    resolveNodePath,
} from '@/features/project-creation/services/aiBundle/mcpConfigWriter';

const EXTENSION_DIST = '/path/to/extension/dist';
const WHICH_RESULT = '/usr/local/bin/node';
const REALPATH_RESULT = '/versions/v22/installation/bin/node';

type ExecCallback = (err: Error | null, out?: { stdout: string }) => void;

const execFileMock = childProcess.execFile as unknown as jest.Mock;

/**
 * Answer `which` and `realpath` with raw stdout (trailing newline included —
 * that is what a real shell returns, and trimming it is a decision the module
 * makes). Pass `null` for a command that is unavailable.
 */
function mockShell(which: string | null, realpath: string | null): void {
    execFileMock.mockImplementation((cmd: string, _args: string[], cb: ExecCallback) => {
        const stdout = cmd === 'which' ? which : realpath;
        if (stdout === null) {
            cb(new Error(`${cmd}: command not found`));
            return;
        }
        cb(null, { stdout });
    });
}

/** The `command` the writer put in the generated demo-builder MCP entry. */
function writtenCommand(): string {
    const call = (fsPromises.writeFile as jest.Mock).mock.calls.find(([p]: [string]) =>
        String(p).endsWith('.mcp.json')
    );
    const config = JSON.parse(String(call![1])) as {
        mcpServers: Record<string, { command: string }>;
    };
    return config.mcpServers['demo-builder'].command;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('resolveNodePath', () => {
    it('follows the symlink chain and returns the stable realpath', async () => {
        mockShell(`${WHICH_RESULT}\n`, `${REALPATH_RESULT}\n`);

        await expect(resolveNodePath()).resolves.toBe(REALPATH_RESULT);

        expect(execFileMock).toHaveBeenCalledWith('which', ['node'], expect.any(Function));
        // The trimmed which result — an untrimmed path is not a path.
        expect(execFileMock).toHaveBeenCalledWith(
            'realpath',
            [WHICH_RESULT],
            expect.any(Function)
        );
    });

    it('keeps the which result when realpath is unavailable', async () => {
        mockShell(`${WHICH_RESULT}\n`, null);

        await expect(resolveNodePath()).resolves.toBe(WHICH_RESULT);
    });

    it('keeps the which result when realpath answers with a relative path', async () => {
        mockShell(`${WHICH_RESULT}\n`, 'installation/bin/node\n');

        await expect(resolveNodePath()).resolves.toBe(WHICH_RESULT);
    });

    it('falls back to process.execPath when which answers with nothing', async () => {
        mockShell('\n', null);

        await expect(resolveNodePath()).resolves.toBe(process.execPath);
    });

    it('falls back to process.execPath when which answers with a relative path', async () => {
        mockShell('node\n', null);

        await expect(resolveNodePath()).resolves.toBe(process.execPath);
    });

    it('falls back to process.execPath when node is not on PATH', async () => {
        mockShell(null, null);

        await expect(resolveNodePath()).resolves.toBe(process.execPath);
    });
});

describe('nodePath threading', () => {
    it('writeMcpConfigs resolves the binary itself when none is supplied', async () => {
        mockShell(`${WHICH_RESULT}\n`, `${REALPATH_RESULT}\n`);

        await writeMcpConfigs(
            '/projects/test',
            makeEdsProject(),
            EXTENSION_DIST,
            makeTestWriter('/projects/test')
        );

        expect(writtenCommand()).toBe(REALPATH_RESULT);
    });

    it('writeMcpConfigs uses the supplied binary and never shells out', async () => {
        mockShell(`${WHICH_RESULT}\n`, `${REALPATH_RESULT}\n`);

        await writeMcpConfigs(
            '/projects/test',
            makeEdsProject(),
            EXTENSION_DIST,
            makeTestWriter('/projects/test'),
            '/supplied/bin/node'
        );

        expect(writtenCommand()).toBe('/supplied/bin/node');
        expect(execFileMock).not.toHaveBeenCalled();
    });

    it('buildDemoBuilderMcpEntry resolves the binary itself when none is supplied', async () => {
        mockShell(`${WHICH_RESULT}\n`, `${REALPATH_RESULT}\n`);

        const entry = await buildDemoBuilderMcpEntry(EXTENSION_DIST, '/tmp/demo.sock');

        expect(entry.command).toBe(REALPATH_RESULT);
    });

    it('buildDemoBuilderMcpEntry uses the supplied binary and never shells out', async () => {
        mockShell(`${WHICH_RESULT}\n`, `${REALPATH_RESULT}\n`);

        const entry = await buildDemoBuilderMcpEntry(
            EXTENSION_DIST,
            '/tmp/demo.sock',
            '/supplied/bin/node'
        );

        expect(entry.command).toBe('/supplied/bin/node');
        expect(execFileMock).not.toHaveBeenCalled();
    });
});
