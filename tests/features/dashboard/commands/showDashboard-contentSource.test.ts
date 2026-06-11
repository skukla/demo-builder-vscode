/**
 * showDashboard getInitialData — content-source plumbing (Slice 2, Step 08).
 *
 * The persisted `project.contentSourceType` rides the dashboard's initial
 * data payload so the screen can render the read-only source marker.
 */

import { ProjectDashboardWebviewCommand } from '@/features/dashboard/commands/showDashboard';
import type { StateManager } from '@/core/state';
import type { Logger } from '@/core/logging';
import type * as vscode from 'vscode';

jest.mock('@/core/logging/debugLogger');

function createCommand(project: Record<string, unknown> | null): ProjectDashboardWebviewCommand {
    const context = {
        subscriptions: [],
        extensionPath: '/mock/extension/path',
        globalState: { get: jest.fn(), update: jest.fn(), keys: jest.fn(() => []) },
        secrets: {},
    } as unknown as vscode.ExtensionContext;
    const stateManager = {
        getState: jest.fn(),
        setState: jest.fn(),
        getCurrentProject: jest.fn().mockResolvedValue(project),
    } as unknown as StateManager;
    const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    return new ProjectDashboardWebviewCommand(context, stateManager, logger);
}

async function getInitialData(command: ProjectDashboardWebviewCommand): Promise<Record<string, unknown>> {
    return (command as unknown as { getInitialData(): Promise<Record<string, unknown>> }).getInitialData();
}

describe('showDashboard getInitialData — contentSourceType plumbing', () => {
    it('passes the persisted contentSourceType through to the payload', async () => {
        const command = createCommand({
            name: 'aem-satellite',
            path: '/tmp/aem-satellite',
            flow: 'content',
            contentSourceType: 'aem-sites',
        });

        const data = await getInitialData(command);

        expect(data.contentSourceType).toBe('aem-sites');
        expect(data.isContentFlow).toBe(true);
    });

    it('leaves contentSourceType undefined for legacy projects', async () => {
        const command = createCommand({ name: 'legacy', path: '/tmp/legacy' });

        const data = await getInitialData(command);

        expect(data.contentSourceType).toBeUndefined();
    });
});
