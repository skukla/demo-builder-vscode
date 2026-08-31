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

import * as vscode from 'vscode';
import {
    performAdobeMcpUpdates,
    type UpdateContext,
} from '@/features/updates/commands/updateExecutor';
import type { AdobeMcpUpdateItem } from '@/features/updates/commands/updateTypes';
import { applyAdobeMcpUpdate } from '@/features/updates/services/adobeMcpUpdateCore';
import { createMockLogger } from '../../../helpers/loggerFake';

jest.mock(
    'vscode',
    () => ({
        window: {
            withProgress: jest.fn((_opts: unknown, cb: (p: { report: jest.Mock }) => unknown) =>
                cb({ report: jest.fn() })
            ),
            showWarningMessage: jest.fn(),
            showErrorMessage: jest.fn(),
            showInformationMessage: jest.fn(),
        },
        workspace: { getConfiguration: jest.fn() },
        ProgressLocation: { Notification: 15 },
    }),
    { virtual: true }
);
jest.mock('@/features/updates/services/adobeMcpUpdateCore', () => ({
    applyAdobeMcpUpdate: jest.fn(),
}));
jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest.fn(),
}));

const coreMock = applyAdobeMcpUpdate as jest.Mock;
const showErrorMock = vscode.window.showErrorMessage as jest.Mock;
const showWarningMock = vscode.window.showWarningMessage as jest.Mock;

const PKG = '@adobe-commerce/commerce-extensibility-tools';

function makeCtx(): UpdateContext {
    return {
        secrets: {} as vscode.SecretStorage,
        extensionPath: '/ext',
        stateManager: { saveProjectConfigOnly: jest.fn(async () => undefined) },
        logger: createMockLogger(),
    } as never;
}

function makeItem(projectOverrides: Record<string, unknown> = {}): AdobeMcpUpdateItem {
    return {
        project: { name: 'demo', path: '/p/demo', status: 'ready', ...projectOverrides },
        packageName: PKG,
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        isAdobeMcpUpdate: true,
        label: 'Adobe MCP',
    } as never;
}

describe('performAdobeMcpUpdates', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        coreMock.mockReset();
        coreMock.mockResolvedValue(undefined);
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
