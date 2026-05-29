/**
 * OpenModernizationAgentCommand Tests
 *
 * Verifies the palette command that launches the AEM Experience Modernization
 * Agent (aemcoder.adobe.io) in the user's default browser as the entry point
 * for the Mod Agent workflow described in `scrape-reference-site.md`.
 *
 *  - Always opens `https://aemcoder.adobe.io` via the shared `openUrl` helper.
 *  - Surfaces a status-bar tip mentioning the current project name (so the
 *    user knows which GitHub repo to connect in the Mod Agent UI) when a
 *    project is loaded; falls back to generic wording otherwise.
 *  - Logs the launch + project context.
 *  - Surfaces an error message when the browser launch fails.
 */

import * as vscode from 'vscode';

jest.mock('@/core/utils/browserUtils', () => ({
    openUrl: jest.fn().mockResolvedValue(undefined),
}));

import { OpenModernizationAgentCommand } from '@/commands/openModernizationAgent';
import { openUrl } from '@/core/utils/browserUtils';
import type { StateManager } from '@/core/state';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';

function makeLogger(): Logger {
    return {
        info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn(),
    } as unknown as Logger;
}

function makeStateManager(project: Project | null): StateManager {
    return {
        getCurrentProject: jest.fn().mockResolvedValue(project),
    } as unknown as StateManager;
}

function makeContext(): vscode.ExtensionContext {
    return {
        globalState: {
            get: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
        },
        subscriptions: [],
    } as unknown as vscode.ExtensionContext;
}

const PROJECT = { name: 'My Demo', path: '/projects/demo' } as unknown as Project;

describe('OpenModernizationAgentCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.window.setStatusBarMessage as jest.Mock).mockReturnValue({ dispose: jest.fn() });
    });

    it('opens aemcoder.adobe.io in the system browser', async () => {
        const cmd = new OpenModernizationAgentCommand(makeContext(), makeStateManager(null), makeLogger());

        await cmd.execute();

        expect(openUrl).toHaveBeenCalledWith('https://aemcoder.adobe.io');
    });

    it('shows a status-bar tip that mentions the current project name when present', async () => {
        const cmd = new OpenModernizationAgentCommand(makeContext(), makeStateManager(PROJECT), makeLogger());

        await cmd.execute();

        const setStatusBarMessageMock = vscode.window.setStatusBarMessage as jest.Mock;
        expect(setStatusBarMessageMock).toHaveBeenCalled();
        const tipText = setStatusBarMessageMock.mock.calls[0]?.[0] as string;
        expect(tipText).toContain('My Demo');
    });

    it('still opens the URL when no project is loaded (generic status-bar tip)', async () => {
        const cmd = new OpenModernizationAgentCommand(makeContext(), makeStateManager(null), makeLogger());

        await cmd.execute();

        expect(openUrl).toHaveBeenCalledWith('https://aemcoder.adobe.io');
        const setStatusBarMessageMock = vscode.window.setStatusBarMessage as jest.Mock;
        const tipText = setStatusBarMessageMock.mock.calls[0]?.[0] as string;
        expect(tipText).not.toContain('My Demo');
    });

    it('logs the launch with the project name when present', async () => {
        const logger = makeLogger();
        const cmd = new OpenModernizationAgentCommand(makeContext(), makeStateManager(PROJECT), logger);

        await cmd.execute();

        const infoCalls = (logger.info as jest.Mock).mock.calls.flat().join(' ');
        expect(infoCalls).toContain('My Demo');
        expect(infoCalls).toContain('aemcoder.adobe.io');
    });

    it('surfaces an error message when the browser launch fails', async () => {
        (openUrl as jest.Mock).mockRejectedValueOnce(new Error('no browser'));
        const cmd = new OpenModernizationAgentCommand(makeContext(), makeStateManager(null), makeLogger());

        await cmd.execute();

        expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        const errorText = (vscode.window.showErrorMessage as jest.Mock).mock.calls[0]?.[0] as string;
        expect(errorText.toLowerCase()).toContain('modernization');
    });

    it('logs the failure with the underlying error message', async () => {
        (openUrl as jest.Mock).mockRejectedValueOnce(new Error('no browser'));
        const logger = makeLogger();
        const cmd = new OpenModernizationAgentCommand(makeContext(), makeStateManager(null), logger);

        await cmd.execute();

        const errorCalls = (logger.error as jest.Mock).mock.calls.flat().join(' ');
        expect(errorCalls).toContain('no browser');
    });
});
