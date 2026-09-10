/**
 * updateExecutor.performForkSyncUpdates — how each ForkSyncResult is reported.
 *
 * The executor turns the service's three outcomes into three different
 * reactions: success is silent, a conflict is a warning box, a plain failure is
 * a warn-level log only, and a thrown error is an error box plus an error-level
 * log. The loop must reach every item whatever the previous one did.
 */

import { makeUpdateContext } from './updateExecutor.testUtils';
import * as vscode from 'vscode';
import { performForkSyncUpdates } from '@/features/updates/commands/updateExecutor';
import type { ForkSyncItem } from '@/features/updates/commands/updateTypes';
import { ForkSyncService } from '@/features/updates/services/forkSyncService';

jest.mock('@/features/updates/services/forkSyncService');

const ServiceMock = ForkSyncService as jest.MockedClass<typeof ForkSyncService>;
const showWarningMock = vscode.window.showWarningMessage as jest.Mock;
const showErrorMock = vscode.window.showErrorMessage as jest.Mock;

function makeItem(overrides: Partial<ForkSyncItem> = {}): ForkSyncItem {
    return {
        owner: 'acme',
        repo: 'storefront',
        branch: 'main',
        behindBy: 2,
        parentFullName: 'adobe/aem-boilerplate-commerce',
        isForkSync: true,
        label: 'acme/storefront',
        ...overrides,
    };
}

describe('performForkSyncUpdates', () => {
    let syncFork: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        syncFork = jest.fn();
        ServiceMock.prototype.syncFork = syncFork;
    });

    it('builds the service from the context secrets and logger, and syncs owner/repo/branch', async () => {
        const ctx = makeUpdateContext();
        syncFork.mockResolvedValue({ success: true, message: 'ok' });

        await performForkSyncUpdates([makeItem()], ctx);

        expect(ServiceMock).toHaveBeenCalledWith(ctx.secrets, ctx.logger);
        expect(syncFork).toHaveBeenCalledWith('acme', 'storefront', 'main');
    });

    it('success: no message box, reported at info level and nothing louder', async () => {
        const ctx = makeUpdateContext();
        syncFork.mockResolvedValue({ success: true, message: 'ok' });

        await performForkSyncUpdates([makeItem()], ctx);

        expect(showWarningMock).not.toHaveBeenCalled();
        expect(showErrorMock).not.toHaveBeenCalled();
        expect(ctx.logger.info).toHaveBeenCalledTimes(1);
        expect(ctx.logger.warn).not.toHaveBeenCalled();
        expect(ctx.logger.error).not.toHaveBeenCalled();
    });

    it('conflict: a warning box naming the fork, and a warn-level log', async () => {
        const ctx = makeUpdateContext();
        syncFork.mockResolvedValue({ success: false, conflict: true, message: 'diverged' });

        await performForkSyncUpdates([makeItem()], ctx);

        expect(showWarningMock).toHaveBeenCalledWith(
            'acme/storefront has diverged from upstream and cannot be fast-forwarded.',
        );
        expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
        expect(ctx.logger.info).not.toHaveBeenCalled();
        expect(showErrorMock).not.toHaveBeenCalled();
    });

    it('failure without conflict: warn-level log only, no box of either kind', async () => {
        const ctx = makeUpdateContext();
        syncFork.mockResolvedValue({ success: false, message: '502 from GitHub' });

        await performForkSyncUpdates([makeItem()], ctx);

        expect(showWarningMock).not.toHaveBeenCalled();
        expect(showErrorMock).not.toHaveBeenCalled();
        expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
        expect(ctx.logger.info).not.toHaveBeenCalled();
        expect(ctx.logger.error).not.toHaveBeenCalled();
    });

    it('thrown error: error box with the sanitized message, error-level log, loop continues', async () => {
        const ctx = makeUpdateContext();
        syncFork
            .mockRejectedValueOnce(new Error('network down\nat stack'))
            .mockResolvedValueOnce({ success: true, message: 'ok' });

        await performForkSyncUpdates([makeItem(), makeItem({ repo: 'second' })], ctx);

        expect(showErrorMock).toHaveBeenCalledWith(
            'Failed to sync fork acme/storefront: network down',
        );
        expect(ctx.logger.error).toHaveBeenCalledTimes(1);
        expect(syncFork).toHaveBeenCalledTimes(2);
        expect(syncFork).toHaveBeenLastCalledWith('acme', 'second', 'main');
    });
});
