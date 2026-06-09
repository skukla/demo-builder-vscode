/**
 * JoinStorefrontCommand — anti-stranding lifecycle.
 *
 * Opening Join disposes the projects list (single-surface model), so closing the
 * Join panel must re-surface the projects list — UNLESS the user confirmed a join,
 * in which case the seeded wizard takes over and we hand off without reopening.
 */

import * as vscode from 'vscode';
import { JoinStorefrontCommand } from '@/features/project-creation/commands/joinStorefront';
import { StateManager } from '@/core/state';
import { Logger } from '@/core/logging';

jest.mock('@/core/logging/debugLogger');

function createCommand(): JoinStorefrontCommand {
    const context = { subscriptions: [], extensionPath: '/mock', secrets: {} } as unknown as vscode.ExtensionContext;
    const stateManager = {} as unknown as StateManager;
    const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    return new JoinStorefrontCommand(context, stateManager, logger);
}

describe('JoinStorefrontCommand — anti-stranding on close', () => {
    beforeEach(() => jest.clearAllMocks());

    it('reopens the projects list when the panel is disposed on a plain close', () => {
        const command = createCommand();

        command.dispose();

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');
    });

    it('does NOT reopen the projects list after a confirmed join (hands off to the wizard)', async () => {
        const command = createCommand();

        // Drive the join-confirm path through the command's wrapped handler.
        const handlers = new Map<string, (data: unknown) => Promise<unknown>>();
        const mockComm = { onStreaming: (type: string, cb: (data: unknown) => Promise<unknown>) => handlers.set(type, cb) };
        (command as unknown as { initializeMessageHandlers: (c: unknown) => void }).initializeMessageHandlers(mockComm);

        await handlers.get('join-confirm')!({
            descriptor: { upstream: { owner: 'commerce-sc', repo: 'citisignal' }, packageId: 'citisignal' },
        });
        // Confirm launched the seeded wizard…
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.createProject', expect.anything());

        (vscode.commands.executeCommand as jest.Mock).mockClear();
        command.dispose();
        // …so the subsequent dispose must NOT reopen the projects list.
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.showProjectsList');
    });
});
