/**
 * StopDemoCommand — the decisions along the stop, one by one (PL-22, MUT-08).
 *
 * The lifecycle, process and error suites prove the flow; this one pins what
 * each step hands its collaborators and each edge: the lock's early return,
 * a 'starting' demo being stoppable, the exact lsof call and the port bounds,
 * how a PID is read from lsof's output, ONE ProcessCleanup per command, which
 * terminal is disposed, the two error messages, the Projects Dashboard
 * notification, the progress line, and the last-resort catch.
 */

// Real wall-clock UI delay; mock the shared sleep so only orchestration is under test.
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import * as vscode from 'vscode';
import {
    ProcessCleanup,
    StopDemoCommand,
    mockCommandExecutor,
    runningProject,
    setupStopDemo,
} from './stopDemo.testUtils';
import type { StopDemoHarness } from './stopDemo.testUtils';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Project } from '@/types/base';
import { createMockTerminal, mockWindow } from '../../../helpers/vscodeMockViews';

let harness: StopDemoHarness;
let command: StopDemoCommand;
let report: jest.Mock;
let project: Project;

function frontendOn(port: number | undefined, status: Project['status'] = 'running'): Project {
    const project = runningProject({ status });
    (project.componentInstances as unknown as Record<string, { port?: number }>).eds.port = port;
    return project;
}

function setup(target: Project = runningProject()): void {
    project = target;
    harness = setupStopDemo(project);
    command = harness.command;
    report = jest.fn();
    mockWindow.withProgress = jest
        .fn()
        .mockImplementation(async (_o: unknown, task: (p: unknown) => unknown) => task({ report }));
}

function lsofAnswers(answer: { code?: number; stdout: string } | Error): void {
    if (answer instanceof Error) {
        mockCommandExecutor.execute.mockRejectedValue(answer);
        return;
    }
    mockCommandExecutor.execute.mockResolvedValue({
        code: answer.code ?? 0,
        stdout: answer.stdout,
        stderr: '',
        duration: 0,
    });
}


beforeEach(() => {
    jest.clearAllMocks();
    setup();
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('the guards', () => {
    it('a second call while one is running returns at once and does not queue', async () => {
        let release!: () => void;
        harness.mockProcessCleanup.killProcessTree.mockReturnValue(
            new Promise<void>((resolve) => {
                release = resolve;
            })
        );
        const first = command.execute();
        await Promise.resolve();

        await command.execute();

        expect(harness.mockStateManager.getCurrentProject).toHaveBeenCalledTimes(1);
        release();
        await first;
    });

    it('stops a demo that is still starting', async () => {
        setup(frontendOn(3000, 'starting'));

        await command.execute();

        expect(harness.mockProcessCleanup.killProcessTree).toHaveBeenCalledWith(12345, 'SIGTERM');
        expect(project.status).toBe('ready');
    });
});

describe('finding the process', () => {
    it('asks lsof for the frontend port with a quick, bare shell call', async () => {
        await command.execute();

        expect(mockCommandExecutor.execute).toHaveBeenCalledWith('lsof -ti:3000', {
            timeout: TIMEOUTS.QUICK,
            configureTelemetry: false,
            useNodeVersion: null,
            enhancePath: false,
            shell: DEFAULT_SHELL,
        });
    });

    it.each([1, 65535])('accepts port %i, the edge of the valid range', async (port) => {
        setup(frontendOn(port));

        await command.execute();

        expect(mockCommandExecutor.execute).toHaveBeenCalledWith(`lsof -ti:${port}`, expect.anything());
        expect(harness.mockProcessCleanup.killProcessTree).toHaveBeenCalledWith(12345, 'SIGTERM');
    });

    it('falls back to the configured default port when the frontend has none', async () => {
        setup(frontendOn(undefined));

        await command.execute();

        expect(mockCommandExecutor.execute).toHaveBeenCalledWith('lsof -ti:3000', expect.anything());
    });

    it('reads the first PID even when lsof leads with blank lines', async () => {
        lsofAnswers({ stdout: '\n\n4242\n99\n' });

        await command.execute();

        expect(harness.mockProcessCleanup.killProcessTree).toHaveBeenCalledWith(4242, 'SIGTERM');
    });

    it.each([
        ['lsof exits non-zero', { code: 1, stdout: '12345' }],
        ['lsof prints PID 0', { code: 0, stdout: '0\n' }],
        ['lsof prints only whitespace', { code: 0, stdout: '  \n' }],
    ])('treats the port as free when %s — no kill, still stopped', async (_name, answer) => {
        lsofAnswers(answer);

        await command.execute();

        expect(harness.mockProcessCleanup.killProcessTree).not.toHaveBeenCalled();
        expect(harness.mockTerminal.dispose).toHaveBeenCalledTimes(1);
        expect(project.status).toBe('ready');
        // The "may have already exited" note is the only debug line on this path.
        expect(harness.mockLogger.debug).toHaveBeenCalledTimes(1);
    });

    it('treats a thrown lsof as a free port, noting it', async () => {
        lsofAnswers(new Error('spawn lsof EACCES'));

        await command.execute();

        expect(harness.mockProcessCleanup.killProcessTree).not.toHaveBeenCalled();
        expect(project.status).toBe('ready');
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        // The lsof failure and the "may have already exited" note.
        expect(harness.mockLogger.debug).toHaveBeenCalledTimes(2);
    });
});

describe('killing and cleaning up', () => {
    it('builds ONE ProcessCleanup with the graceful timeout, however often it stops', async () => {
        await command.execute();
        harness.mockStateManager.getCurrentProject.mockResolvedValue(runningProject());
        await command.execute();

        expect(ProcessCleanup).toHaveBeenCalledTimes(1);
        expect(ProcessCleanup).toHaveBeenCalledWith({
            gracefulTimeout: TIMEOUTS.PROCESS_GRACEFUL_SHUTDOWN,
        });
        expect(harness.mockProcessCleanup.killProcessTree).toHaveBeenCalledTimes(2);
    });

    it('disposes only the terminal named for this project', async () => {
        const other = createMockTerminal({ name: 'other-project - Frontend', dispose: jest.fn() });
        mockWindow.terminals = [other, harness.mockTerminal];

        await command.execute();

        expect(harness.mockTerminal.dispose).toHaveBeenCalledTimes(1);
        expect(other.dispose).not.toHaveBeenCalled();
    });

    it('a kill that fails for a reason other than EPERM is reported as a failed stop', async () => {
        harness.mockProcessCleanup.killProcessTree.mockRejectedValue(new Error('ESRCH'));

        await command.execute();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Failed to stop demo process', 'OK');
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalledWith(
            expect.stringContaining('Permission denied'),
            'OK'
        );
        expect(harness.mockTerminal.dispose).toHaveBeenCalledTimes(1);
        expect(project.status).toBe('stopping');
    });

    it('names the PID in the permission-denied message', async () => {
        const eperm = Object.assign(new Error('EPERM'), { code: 'EPERM' });
        harness.mockProcessCleanup.killProcessTree.mockRejectedValue(eperm);

        await command.execute();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Permission denied killing process 12345. Try running VS Code as administrator or stop the process manually.',
            'OK'
        );
    });
});

describe('after the demo is down', () => {
    it('tells an open Projects Dashboard that nothing is running now', async () => {
        const postMessage = jest.fn().mockResolvedValue(true);
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue({
            webview: { postMessage },
        } as unknown as vscode.WebviewPanel);

        await command.execute();

        expect(BaseWebviewCommand.getActivePanel).toHaveBeenCalledWith('demoBuilder.projectsList');
        expect(postMessage).toHaveBeenCalledWith({
            type: 'demoStateChanged',
            payload: { runningProjectPath: undefined },
        });
    });

    it('finishes with the progress line, the grace-period reset and the status bar note', async () => {
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(undefined);

        await command.execute();

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder._internal.demoStopped');
        expect(report).toHaveBeenCalledWith({ message: '✓ Demo stopped' });
        expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
            expect.stringContaining('Demo stopped'),
            expect.any(Number)
        );
    });

    it('a failure the steps did not expect is shown, not swallowed', async () => {
        harness.mockStateManager.saveProject.mockRejectedValueOnce(new Error('disk full'));

        await command.execute();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Failed to stop demo', 'OK');
        expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalled();
    });
});
