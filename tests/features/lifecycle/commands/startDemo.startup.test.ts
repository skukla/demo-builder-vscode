/**
 * StartDemoCommand — the start itself, decision by decision (PL-22, MUT-08).
 *
 * The lifecycle and error suites prove the happy path and the guards fire.
 * This one pins the edges and the hand-offs: the lock's early return, the
 * Cancel answer to "create a project?", the port bounds at 1 and 65535, the
 * Node version fallback, which .env files are handed to the hash baseline,
 * the projects-panel notification, and the final progress line.
 */

import * as vscode from 'vscode';
import {
    StartDemoCommand,
    accessMock as access,
    mockCommandExecutor,
    mockWindow,
    setupStartDemo,
    startableProject,
} from './startDemo.testUtils';
import type { StartDemoHarness } from './startDemo.testUtils';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import type { Project } from '@/types/base';

const executeCommand = () => vscode.commands.executeCommand as jest.Mock;

let harness: StartDemoHarness;
let command: StartDemoCommand;
let report: jest.Mock;

function withFrontend(overrides: Record<string, unknown>, extra: Record<string, unknown> = {}): Project {
    const project = startableProject();
    const instances = project.componentInstances as unknown as Record<string, Record<string, unknown>>;
    instances.headless = { ...instances.headless, ...overrides };
    Object.assign(instances, extra);
    return project;
}

function setup(project = startableProject()): void {
    harness = setupStartDemo(project);
    command = harness.command;
    report = jest.fn();
    mockWindow.withProgress = jest
        .fn()
        .mockImplementation(async (_o: unknown, task: (p: unknown) => unknown) => task({ report }));
    // Port free before the start, in use right after it: the demo comes up at once.
    mockCommandExecutor.isPortAvailable.mockResolvedValueOnce(true).mockResolvedValue(false);
    mockCommandExecutor.execute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
}

async function run(): Promise<void> {
    const done = command.execute();
    await jest.advanceTimersByTimeAsync(5000);
    await done;
}

const fnmLine = () =>
    harness.mockTerminal.sendText.mock.calls.map((c: string[]) => c[0]).find((l: string) => l.includes('fnm'));

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    access.mockRejectedValue(new Error('ENOENT'));
    setup();
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('the guards', () => {
    it('a second call while one is running returns at once and does not queue', async () => {
        // The first run parks on the startup poll; the second must not even read the project.
        mockCommandExecutor.isPortAvailable.mockReset().mockResolvedValue(true);
        const first = command.execute();
        await jest.advanceTimersByTimeAsync(10);

        await command.execute();

        expect(harness.mockStateManager.getCurrentProject).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(40000);
        await first;
    });

    it('does not create a project when the SC declines the offer', async () => {
        harness.mockStateManager.getCurrentProject.mockResolvedValue(undefined);
        mockWindow.showInformationMessage = jest.fn().mockResolvedValue('Cancel');

        await command.execute();

        expect(executeCommand()).not.toHaveBeenCalledWith('demoBuilder.createProject');
    });

    it.each([1, 65535])('accepts port %i, the edge of the valid range', async (port) => {
        setup(withFrontend({ port }));

        await run();

        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        expect(mockCommandExecutor.isPortAvailable).toHaveBeenCalledWith(port);
        expect(report).toHaveBeenCalledWith({ message: `✓ Started at http://localhost:${port}` });
    });
});

describe('the Node version', () => {
    it('defaults to 20 when the frontend has no metadata', async () => {
        setup(withFrontend({ metadata: undefined }));

        await run();

        expect(fnmLine()).toBe('eval "$(fnm env)" && fnm use 20 && npm run dev');
    });

    it('defaults to 20 when the recorded version is not a string', async () => {
        setup(withFrontend({ metadata: { nodeVersion: 24 } }));

        await run();

        expect(fnmLine()).toBe('eval "$(fnm env)" && fnm use 20 && npm run dev');
    });
});

describe('after the demo is up', () => {
    it('hands the hash baseline exactly the .env files that exist, skipping instances without a path', async () => {
        setup(
            withFrontend({}, {
                mesh: { id: 'mesh', name: 'Mesh', type: 'dependency', status: 'ready', path: '/test/path/mesh' },
                ghost: { id: 'ghost', name: 'Ghost', type: 'dependency', status: 'ready' },
            })
        );
        access.mockImplementation(async (p: string) => {
            if (p === '/test/path/frontend/.env' || p === '/test/path/mesh/.env.local') return;
            throw new Error('ENOENT');
        });

        await run();

        expect(executeCommand()).toHaveBeenCalledWith('demoBuilder._internal.initializeFileHashes', [
            '/test/path/frontend/.env',
            '/test/path/mesh/.env.local',
        ]);
        expect(access).not.toHaveBeenCalledWith(expect.stringContaining('undefined'));
    });

    it('does not initialise hashes when no .env file exists', async () => {
        await run();

        expect(executeCommand()).not.toHaveBeenCalledWith(
            'demoBuilder._internal.initializeFileHashes',
            expect.anything()
        );
        expect(executeCommand()).toHaveBeenCalledWith('demoBuilder._internal.demoStarted');
        expect(executeCommand()).toHaveBeenCalledWith('demoBuilder._internal.restartActionTaken');
    });

    it('tells an open Projects Dashboard which project is now running', async () => {
        const postMessage = jest.fn().mockResolvedValue(true);
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue({
            webview: { postMessage },
        } as unknown as vscode.WebviewPanel);

        await run();

        expect(BaseWebviewCommand.getActivePanel).toHaveBeenCalledWith('demoBuilder.projectsList');
        expect(postMessage).toHaveBeenCalledWith({
            type: 'demoStateChanged',
            payload: { runningProjectPath: '/test/path' },
        });
    });

    it('finishes cleanly with no Projects Dashboard open', async () => {
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(undefined);

        await run();

        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        expect(report).toHaveBeenCalledWith({ message: '✓ Started at http://localhost:3000' });
    });
});
