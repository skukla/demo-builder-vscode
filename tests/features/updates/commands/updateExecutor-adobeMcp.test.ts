/**
 * updateExecutor.performAdobeMcpUpdates — delegation to the shared core.
 *
 * The executor owns the UI shell (running-demo guard, withProgress, error
 * toasts, failure summary); the npm-update → regenerate → persist sequence
 * lives in the ONE shared `applyAdobeMcpUpdate` core (adobeMcpUpdateCore.ts),
 * which the headless `applyAdobeMcp` also calls. This suite pins the
 * delegation and the removal of the redundant storefront-path guard —
 * `AdobeMcpUpdateItem`s only exist because `AdobeMcpUpdateChecker` passed its
 * own EDS gate (it returns null without a storefront path), so the checker is
 * the contract.
 */

import { captureProgress } from './updateExecutor.testUtils';
import * as vscode from 'vscode';
import {
    performAdobeMcpUpdates,
    type UpdateContext,
} from '@/features/updates/commands/updateExecutor';
import type { AdobeMcpUpdateItem } from '@/features/updates/commands/updateTypes';
import { applyAdobeMcpUpdate } from '@/features/updates/services/adobeMcpUpdateCore';
import type { Project } from '@/types/base';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/features/updates/services/adobeMcpUpdateCore', () => ({
    applyAdobeMcpUpdate: jest.fn(),
}));

const coreMock = applyAdobeMcpUpdate as jest.Mock;
const showErrorMock = vscode.window.showErrorMessage as jest.Mock;
const showWarningMock = vscode.window.showWarningMessage as jest.Mock;
const withProgressMock = vscode.window.withProgress as jest.Mock;

const PKG = '@adobe-commerce/commerce-extensibility-tools';

function makeCtx(): UpdateContext {
    return {
        secrets: createMockSecretStorage().secrets,
        extensionPath: '/ext',
        // The fake's default saveProjectConfigOnly already resolves undefined.
        stateManager: createMockStateManager(),
        logger: createMockLogger(),
        commandManager: createMockCommandExecutor(),
    };
}

function makeItem(projectOverrides: Partial<Project> = {}): AdobeMcpUpdateItem {
    return {
        project: createMockProject({ name: 'demo', path: '/p/demo', status: 'ready', ...projectOverrides }),
        packageName: PKG,
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        isAdobeMcpUpdate: true,
        label: 'Adobe MCP',
    };
}

describe('performAdobeMcpUpdates', () => {
    let report: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        coreMock.mockReset();
        coreMock.mockResolvedValue(undefined);
        report = captureProgress();
    });

    it('shows a non-cancellable notification titled Updating Adobe MCP', async () => {
        await performAdobeMcpUpdates([makeItem()], makeCtx());

        expect(withProgressMock).toHaveBeenCalledWith(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Updating Adobe MCP',
                cancellable: false,
            },
            expect.any(Function),
        );
    });

    it('reports package, version and project with an even share of the bar per project', async () => {
        await performAdobeMcpUpdates(
            [makeItem({ name: 'a', path: '/p/a' }), makeItem({ name: 'b', path: '/p/b' })],
            makeCtx(),
        );

        expect(report).toHaveBeenNthCalledWith(1, { message: `${PKG} → 2.0.0 in a…`, increment: 50 });
        expect(report).toHaveBeenNthCalledWith(2, { message: `${PKG} → 2.0.0 in b…`, increment: 50 });
    });

    it('a running project whose demo the user keeps is dropped, and alone it means no progress bar', async () => {
        showWarningMock.mockResolvedValue('Skip');

        await performAdobeMcpUpdates([makeItem({ status: 'running' })], makeCtx());

        expect(showWarningMock).toHaveBeenCalledWith(
            expect.stringContaining('is currently running'),
            'Stop & Update',
            'Skip',
        );
        expect(coreMock).not.toHaveBeenCalled();
        expect(withProgressMock).not.toHaveBeenCalled();
    });

    it('a skipped project does not take the others with it', async () => {
        const ctx = makeCtx();
        const idle = makeItem({ name: 'b', path: '/p/b' });
        showWarningMock.mockResolvedValue('Skip');

        await performAdobeMcpUpdates([makeItem({ name: 'a', path: '/p/a', status: 'running' }), idle], ctx);

        expect(coreMock).toHaveBeenCalledTimes(1);
        expect(coreMock).toHaveBeenCalledWith(idle.project, PKG, '2.0.0', ctx);
        expect(report).toHaveBeenCalledWith({ message: `${PKG} → 2.0.0 in b…`, increment: 100 });
    });

    it('counts successes and failures separately in the summary', async () => {
        coreMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);

        await performAdobeMcpUpdates(
            [makeItem({ name: 'a', path: '/p/a' }), makeItem({ name: 'b', path: '/p/b' })],
            makeCtx(),
        );

        expect(showWarningMock).toHaveBeenCalledWith('Updated 1 Adobe MCP package(s), 1 failed.', 'OK');
    });

    it('delegates each selected update to the shared core', async () => {
        const ctx = makeCtx();
        const item = makeItem();

        await performAdobeMcpUpdates([item], ctx);

        expect(coreMock).toHaveBeenCalledTimes(1);
        expect(coreMock).toHaveBeenCalledWith(item.project, PKG, '2.0.0', ctx);
        expect(showWarningMock).not.toHaveBeenCalled();
    });

    it('does not gate on a storefront path (the checker EDS gate is the contract)', async () => {
        // No componentInstances at all — the old in-loop guard skipped this and
        // counted it as a failure; the checker already guarantees it cannot
        // occur, so the executor must simply proceed.
        const ctx = makeCtx();

        await performAdobeMcpUpdates([makeItem({ componentInstances: undefined })], ctx);

        expect(coreMock).toHaveBeenCalledTimes(1);
        expect(showWarningMock).not.toHaveBeenCalled();
    });

    it('shows the per-project error and the failure summary when the core throws', async () => {
        const ctx = makeCtx();
        coreMock.mockRejectedValue(new Error('npm update failed: boom'));

        await performAdobeMcpUpdates([makeItem()], ctx);

        expect(showErrorMock).toHaveBeenCalledWith(
            expect.stringContaining('Failed to update Adobe MCP in demo')
        );
        expect(showWarningMock).toHaveBeenCalledWith(expect.stringContaining('1 failed'), 'OK');
    });
});
