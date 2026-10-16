/**
 * Configure's Republish, told where the SC is looking (2026-10-15).
 *
 * With the Configure screen open, the run goes to that screen's progress modal: each
 * stage, then one end carrying what the libraries did. No notification at all — the
 * result lines used to arrive as notifications of their own, on top of the progress
 * one. With the screen closed, the notifications are as before.
 *
 * The republish itself is walled (its own suite); what is checked is where the
 * progress and the result go. The progress plumbing is the real one.
 */

const mockRepublishFromConfigure = jest.fn();
jest.mock('@/features/dashboard/commands/configureStorefrontRepublish', () => ({
    ...jest.requireActual('@/features/dashboard/commands/configureStorefrontRepublish'),
    republishFromConfigure: (...a: unknown[]) => mockRepublishFromConfigure(...a),
}));
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: { refreshStatus: jest.fn().mockResolvedValue(undefined) },
}));

import * as vscode from 'vscode';
import { CONFIGURE_REPUBLISH_OPERATION_ID } from '@/core/utils/operationIds';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import { runConfigureRepublish } from '@/features/dashboard/commands/configureRepublishRun';
import type { Project } from '@/types/base';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const ADDED = { level: 'info', text: 'Added 9 blocks from Demo Team Block Collection to shop.' };

function parts() {
    return { context: createMockExtensionContext(), stateManager: createMockStateManager(), logger: createMockLogger() };
}

function project(): Project {
    return createMockProject({ name: 'shop', path: '/p/shop' });
}

/** A republish that reports two stages and adds a library. */
function publishedWithLibrary(): void {
    mockRepublishFromConfigure.mockImplementation(async (_p: Project, _parts: unknown, report: ReportStage) => {
        report('Adding block libraries', 'Demo Team Block Collection');
        report('Publishing the config');
        return {
            success: true,
            published: { success: true, cdnPublished: true },
            libraryLines: [ADDED],
            note: ADDED.text,
        };
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
});

describe('runConfigureRepublish — with the Configure screen open', () => {
    it('tells each stage and the end to the screen, and shows no notification', async () => {
        publishedWithLibrary();
        const sendToScreen = jest.fn().mockResolvedValue(undefined);
        const showSuccess = jest.fn();

        await runConfigureRepublish(project(), { parts: parts(), sendToScreen, showSuccess });

        const pushes = sendToScreen.mock.calls
            .filter(([type]) => type === 'operationProgress')
            .map(([, payload]) => payload);
        expect(pushes.map((p) => p.stage).filter(Boolean)).toEqual(['Adding block libraries', 'Publishing the config']);
        expect(pushes.every((p) => p.id === CONFIGURE_REPUBLISH_OPERATION_ID)).toBe(true);
        expect(pushes[pushes.length - 1]).toEqual({
            id: CONFIGURE_REPUBLISH_OPERATION_ID,
            state: 'succeeded',
            note: ADDED.text,
            startedAt: expect.any(Number),
            tookMs: expect.any(Number),
        });
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(vscode.window.withProgress).not.toHaveBeenCalled();
        expect(showSuccess).not.toHaveBeenCalled();
    });

    it('ends the modal with the reason when the republish throws', async () => {
        mockRepublishFromConfigure.mockRejectedValue(new Error('network down'));
        const sendToScreen = jest.fn().mockResolvedValue(undefined);

        await runConfigureRepublish(project(), { parts: parts(), sendToScreen, showSuccess: jest.fn() });

        expect(sendToScreen).toHaveBeenLastCalledWith('operationProgress', {
            id: CONFIGURE_REPUBLISH_OPERATION_ID,
            state: 'failed',
            error: 'Failed to republish storefront: network down',
        });
    });

    it('still records the publish: the dashboard refreshed and the prompt re-armed', async () => {
        publishedWithLibrary();
        const p = parts();
        const shop = project();

        await runConfigureRepublish(shop, { parts: p, sendToScreen: jest.fn().mockResolvedValue(undefined), showSuccess: jest.fn() });

        expect(p.stateManager.saveProject).toHaveBeenCalledWith(shop);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder._internal.storefrontActionTaken');
    });
});

describe('runConfigureRepublish — with the Configure screen closed', () => {
    it('says each library line, then the success, in notifications — control', async () => {
        publishedWithLibrary();
        const showSuccess = jest.fn();

        await runConfigureRepublish(project(), { parts: parts(), showSuccess });

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(ADDED.text);
        expect(showSuccess).toHaveBeenCalledWith('Storefront configuration republished successfully');
    });
});
