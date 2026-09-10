/**
 * DeleteProjectCommand — the decisions along the delete, one by one (PL-22, MUT-01).
 *
 * The lifecycle, retry, error and navigation suites prove the flow; this one
 * pins what each step hands its collaborators and each edge: the lock's early
 * return, the no-project warning, the exact confirmation prompt, a project with
 * no path (nothing deleted, state still cleared), the handle-release wait and
 * the back-off delays as ARGUMENTS to sleep, the two rarer retryable codes,
 * which panels are closed, and the webview transition being ended whether or
 * not the Projects List opens.
 */

// Delays are asserted as arguments, never waited through.
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));
jest.mock('fs/promises', () => ({
    rm: jest.fn().mockResolvedValue(undefined),
}));

import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { createMockProject } from '../../../helpers/projectFake';
import { setupDeleteProject } from './deleteProject.testUtils';
import type { DeleteProjectHarness } from './deleteProject.testUtils';

const mockRm = fs.rm as jest.Mock;
const mockSleep = sleep as jest.Mock;
const PROJECT_PATH = '/tmp/test-project-decisions';

let harness: DeleteProjectHarness;
let startTransition: jest.SpyInstance;
let endTransition: jest.SpyInstance;

function errnoError(code: string): NodeJS.ErrnoException {
    return Object.assign(new Error(`${code} happened`), { code });
}

/** rm fails with `code` for the first `failures` calls, then succeeds. */
function rmFailsThen(code: string, failures: number): void {
    let calls = 0;
    mockRm.mockImplementation(async () => {
        calls += 1;
        if (calls <= failures) throw errnoError(code);
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRm.mockResolvedValue(undefined);
    harness = setupDeleteProject(PROJECT_PATH);
    startTransition = jest.spyOn(BaseWebviewCommand, 'startWebviewTransition').mockResolvedValue();
    endTransition = jest.spyOn(BaseWebviewCommand, 'endWebviewTransition').mockImplementation(() => {});
    jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('the guards', () => {
    it('a second call while one is running returns at once and does not queue', async () => {
        let release!: () => void;
        mockRm.mockReturnValue(
            new Promise<void>((resolve) => {
                release = resolve;
            })
        );
        const first = harness.command.execute();
        await Promise.resolve();

        await harness.command.execute();

        expect(harness.mockStateManager.getCurrentProject).toHaveBeenCalledTimes(1);
        release();
        await first;
    });

    it('with no current project, warns and neither confirms nor deletes', async () => {
        harness.mockStateManager.getCurrentProject.mockResolvedValue(undefined);

        await harness.command.execute();

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No project found to delete.', 'OK');
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        expect(vscode.window.withProgress).not.toHaveBeenCalled();
    });

    it('asks a modal yes/no question that names the project', async () => {
        await harness.command.execute();

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            'Are you sure you want to delete project "test-project"?',
            {
                modal: true,
                detail: 'This will remove all project files and configuration. This action cannot be undone.',
            },
            'Yes',
            'No'
        );
    });
});

describe('deleting the files', () => {
    it('waits for handles to release, then removes the directory recursively', async () => {
        await harness.command.execute();

        expect(mockSleep).toHaveBeenCalledWith(TIMEOUTS.FILE_HANDLE_RELEASE);
        expect(mockRm).toHaveBeenCalledWith(PROJECT_PATH, { recursive: true, force: true });
        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Deleting project' }),
            expect.any(Function)
        );
    });

    it('a project with no path deletes nothing but still clears state', async () => {
        harness.mockStateManager.getCurrentProject.mockResolvedValue(
            createMockProject({ name: 'test-project', path: '', status: 'stopped' })
        );

        await harness.command.execute();

        expect(mockSleep).not.toHaveBeenCalledWith(TIMEOUTS.FILE_HANDLE_RELEASE);
        expect(mockRm).not.toHaveBeenCalled();
        expect(harness.mockStateManager.removeFromRecentProjects).not.toHaveBeenCalled();
        expect(harness.mockStateManager.clearProject).toHaveBeenCalledTimes(1);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');
    });

    it('backs off by doubling from the base delay between attempts', async () => {
        rmFailsThen('ENOTEMPTY', 4);

        await harness.command.execute();

        const base = TIMEOUTS.FILE_DELETE_RETRY_BASE;
        expect(mockSleep.mock.calls.map(([ms]) => ms)).toEqual([
            TIMEOUTS.FILE_HANDLE_RELEASE,
            base,
            base * 2,
            base * 4,
            base * 8,
            // The auto-dismissing success notification's own wait.
            TIMEOUTS.UI.NOTIFICATION,
        ]);
        expect(mockRm).toHaveBeenCalledTimes(5);
        expect(harness.mockStateManager.clearProject).toHaveBeenCalledTimes(1);
    });

    it.each(['EMFILE', 'ENFILE'])('retries when the system is out of file handles (%s)', async (code) => {
        rmFailsThen(code, 1);

        await harness.command.execute();

        expect(mockRm).toHaveBeenCalledTimes(2);
        expect(harness.mockStateManager.clearProject).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('a persistent retryable failure stops after five attempts and reports it', async () => {
        mockRm.mockRejectedValue(errnoError('EBUSY'));

        await harness.command.execute();

        expect(mockRm).toHaveBeenCalledTimes(5);
        expect(mockSleep).toHaveBeenCalledTimes(5);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Failed to delete project', 'OK');
        expect(harness.mockStateManager.clearProject).not.toHaveBeenCalled();
        expect(startTransition).not.toHaveBeenCalled();
    });
});

describe('after the files are gone', () => {
    it('confirms in the status bar with the project name', async () => {
        await harness.command.execute();

        expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
            expect.stringContaining('Project "test-project" deleted'),
            expect.any(Number)
        );
    });

    it('closes the dashboard and configure panels before opening the Projects List', async () => {
        const dashboard = { dispose: jest.fn() };
        const configure = { dispose: jest.fn() };
        const panels: Record<string, unknown> = {
            'demoBuilder.projectDashboard': dashboard,
            'demoBuilder.configureProject': configure,
        };
        (BaseWebviewCommand.getActivePanel as jest.Mock).mockImplementation(
            (id: string) => panels[id] as vscode.WebviewPanel | undefined
        );

        await harness.command.execute();

        expect(BaseWebviewCommand.getActivePanel).toHaveBeenCalledTimes(2);
        expect(dashboard.dispose).toHaveBeenCalledTimes(1);
        expect(configure.dispose).toHaveBeenCalledTimes(1);
        const disposeOrder = dashboard.dispose.mock.invocationCallOrder[0];
        const navigateOrder = (vscode.commands.executeCommand as jest.Mock).mock.invocationCallOrder[0];
        expect(disposeOrder).toBeLessThan(navigateOrder);
    });

    it('a panel that throws on dispose does not stop the other from closing', async () => {
        const configure = { dispose: jest.fn() };
        (BaseWebviewCommand.getActivePanel as jest.Mock).mockImplementation((id: string) =>
            id === 'demoBuilder.projectDashboard'
                ? ({ dispose: () => { throw new Error('already disposed'); } } as unknown as vscode.WebviewPanel)
                : (configure as unknown as vscode.WebviewPanel)
        );

        await harness.command.execute();

        expect(configure.dispose).toHaveBeenCalledTimes(1);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');
    });

    it('holds the webview transition around navigation and ends it once', async () => {
        await harness.command.execute();

        expect(startTransition).toHaveBeenCalledTimes(1);
        expect(endTransition).toHaveBeenCalledTimes(1);
        expect(startTransition.mock.invocationCallOrder[0]).toBeLessThan(
            (vscode.commands.executeCommand as jest.Mock).mock.invocationCallOrder[0]
        );
        expect(endTransition.mock.invocationCallOrder[0]).toBeGreaterThan(
            (vscode.commands.executeCommand as jest.Mock).mock.invocationCallOrder[0]
        );
    });

    it('ends the transition even when the Projects List fails to open', async () => {
        (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(new Error('no such command'));

        await harness.command.execute();

        expect(endTransition).toHaveBeenCalledTimes(1);
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });
});
