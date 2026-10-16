/**
 * The dashboard's three storefront buttons narrate where the SC is looking
 * (PL-59 slice 4, plan rows 6-8): the screen's progress modal when the button
 * asked for one, else the notification they have always used.
 *
 * Sync and the block-library refresh run through their palette COMMANDS, which
 * report through `BaseCommand.withProgress`. Inside a modal that stands down and
 * reports there instead (R7) — what these pin is that the handler asks for the
 * modal at all, and that it ends on what the command answered rather than on
 * "the command returned".
 *
 * Republish runs its service directly and names its own steps (progress vocabulary
 * slice 3, owner 2026-10-16). Until then it showed ONE step, "Republishing the
 * content", over every line the service said ("Syncing code to CDN", "Purging stale
 * cache", "Verifying CDN"), and only a store change's pages had steps of their own.
 * Each part is now a step from the stage table, named as the same job is everywhere
 * else, numbered "(n of N)" because the list is known before the run starts: ten
 * steps, eleven when the store changed. The service is walled here and plays its steps
 * in the order it runs them (its own order is pinned in
 * `storefrontContentRepublishService.test.ts`); what this pins is what the SC sees.
 */

const mockEnsureDaLiveAuth = jest.fn();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: (...args: unknown[]) => mockEnsureDaLiveAuth(...args),
    getDaLiveAuthService: jest.fn(() => ({})),
    getGitHubServices: jest.fn(() => ({ tokenService: {}, fileOperations: {} })),
}));
const mockRepublishContent = jest.fn();
jest.mock('@/features/eds/services/storefront/storefrontContentRepublishService', () => ({
    republishStorefrontContent: (...args: unknown[]) => mockRepublishContent(...args),
}));
jest.mock('@/features/dashboard/handlers/statusHandlers', () => ({
    handleRequestStatus: jest.fn(async () => undefined),
}));

import * as vscode from 'vscode';
import {
    handleRefreshBlockLibrary,
    handleRepublishContent,
    handleSyncStorefront,
} from '@/features/dashboard/handlers/edsContentHandlers';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { reportStep } from '@/core/utils/operationStepChannel';
import { startModalRun } from '@/core/vscode/operationProgress';
import type { StoreScopeReport } from '@/features/eds/services/storefront/storeScopePages';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockProject } from '../../../helpers/projectFake';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

const executeCommand = vscode.commands.executeCommand as jest.Mock;
const screen = jest.fn(async (_type: string, _payload?: unknown): Promise<void> => undefined);

function context(): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest
                .fn()
                // EDS-ness is the STACK id, which is what the block-library
                // refusal reads (`isEdsProject` -> `isEdsStackId`).
                .mockResolvedValue(createMockProject({ name: 'bodea', selectedStack: 'eds-accs' })),
        }),
        sendMessage: screen,
    });
}

/** Every progress payload the modal's screen was sent. */
function pushes(): Array<Record<string, unknown>> {
    return screen.mock.calls
        .filter(([type]) => type === 'operationProgress')
        .map(([, payload]) => payload as Record<string, unknown>);
}

/** The modal's lines while a step runs, as [line 1, line 2]; the run's own opening push names none. */
function running(): Array<[unknown, unknown]> {
    return pushes()
        .filter((payload) => payload.state === 'running' && payload.stage !== undefined)
        .map((payload) => [payload.stage, payload.step]);
}

beforeEach(() => {
    jest.clearAllMocks();
    executeCommand.mockResolvedValue({ success: true });
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
});

describe('sync storefront', () => {
    it('ends the modal on what the command answered', async () => {
        startModalRun('sync-storefront', screen);
        executeCommand.mockResolvedValue({ success: false, error: 'push rejected' });

        await handleSyncStorefront(context(), { id: 'sync-storefront', progress: 'modal' });

        expect(executeCommand).toHaveBeenCalledWith('demoBuilder.syncStorefront');
        expect(pushes().at(-1)).toEqual({
            id: 'sync-storefront',
            state: 'failed',
            error: 'push rejected',
            startedAt: expect.any(Number),
            tookMs: expect.any(Number),
        });
    });

    // Until slice 2 of the progress vocabulary (owner 2026-10-16) the command's first
    // line froze as the modal's step for the whole sync.
    it("shows each step the command reports as the modal's step, its lines under it", async () => {
        startModalRun('sync-storefront', screen);
        executeCommand.mockImplementation(async () => {
            reportStep(OPERATION_STAGES.savingChanges.label);
            reportPhase('3 files');
            reportStep(OPERATION_STAGES.pushingToGitHub.label);
            reportStep(OPERATION_STAGES.publishingCode.label);
            return { success: true };
        });

        await handleSyncStorefront(context(), { id: 'sync-storefront', progress: 'modal' });

        expect(running()).toStrictEqual([
            [OPERATION_STAGES.savingChanges.label, OPERATION_STAGES.savingChanges.detail],
            [OPERATION_STAGES.savingChanges.label, '3 files'],
            [OPERATION_STAGES.pushingToGitHub.label, OPERATION_STAGES.pushingToGitHub.detail],
            [OPERATION_STAGES.publishingCode.label, OPERATION_STAGES.publishingCode.detail],
        ]);
    });

    // The SC dismissed the commit-message prompt. Nothing failed, so the modal
    // closes rather than showing a failure with no reason in it.
    it('closes the modal when the run was cancelled', async () => {
        startModalRun('sync-storefront', screen);
        executeCommand.mockResolvedValue({ success: false, cancelled: true });

        await handleSyncStorefront(context(), { id: 'sync-storefront', progress: 'modal' });

        expect(pushes().at(-1)).toEqual({
            id: 'sync-storefront',
            state: 'succeeded',
            startedAt: expect.any(Number),
            tookMs: expect.any(Number),
        });
    });

    it('opens a notification when no screen asked for the modal', async () => {
        await handleSyncStorefront(context(), undefined);

        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Syncing the storefront' }),
            expect.any(Function),
        );
        expect(pushes()).toStrictEqual([]);
    });
});

describe('refresh block library', () => {
    it("shows each step as the modal's step, without its name a second time under it", async () => {
        startModalRun('block-library', screen);
        executeCommand.mockImplementation(async () => {
            reportStep(OPERATION_STAGES.buildingBlockLibrary.label, 'Building block library: 5 blocks');
            reportStep(OPERATION_STAGES.publishingBlockList.label, 'Publishing the block list: 2 pages');
            return { success: true };
        });

        await handleRefreshBlockLibrary(context(), { id: 'block-library', progress: 'modal' });

        expect(running()).toStrictEqual([
            [OPERATION_STAGES.buildingBlockLibrary.label, '5 blocks'],
            [OPERATION_STAGES.publishingBlockList.label, '2 pages'],
        ]);
    });

    it('ends the modal on what the command answered', async () => {
        startModalRun('block-library', screen);
        executeCommand.mockResolvedValue({ success: false, error: 'DA.live refused' });

        await handleRefreshBlockLibrary(context(), { id: 'block-library', progress: 'modal' });

        expect(executeCommand).toHaveBeenCalledWith('demoBuilder.refreshBlockLibrary');
        expect(pushes().at(-1)).toEqual({
            id: 'block-library',
            state: 'failed',
            error: 'DA.live refused',
            startedAt: expect.any(Number),
            tookMs: expect.any(Number),
        });
    });
});

const OP = 'republish-op';
const S = OPERATION_STAGES;

function storefront(storeChanged: boolean): Project {
    return createMockProject({
        name: 'shop',
        path: '/p/shop',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'me/shop', daLiveOrg: 'acme', daLiveSite: 'shop' },
            },
        },
        edsStorefrontState: {
            envVars: {},
            lastPublished: '2026-10-15T00:00:00.000Z',
            ...(storeChanged
                ? { catalogPagesPending: { fromWebsiteCode: 'base', fromStoreCode: 'main', fromStoreViewCode: 'default' } }
                : {}),
        },
    });
}

function republishContext(project: Project): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) }),
        sendMessage: screen,
    });
}

/** The service's steps, each as it starts and with a line under some of them. */
function playsSteps(storeChanged: boolean): void {
    mockRepublishContent.mockImplementation(async (params: { onStage?: StoreScopeReport }) => {
        const step = params.onStage ?? (() => undefined);
        step(S.applyingDaLiveSettings.label);
        step(S.publishingSettings.label);
        step(S.publishingSettings.label, 'Publishing the settings: writing config.json');
        step(S.publishingCode.label);
        step(S.settingSitePermissions.label);
        step(S.clearingCache.label);
        step(S.publishingPages.label);
        step(S.publishingPages.label, 'Publishing the pages: 32 of 64 pages');
        if (storeChanged) {
            step(S.removingProductPages.label);
            step(S.updatingCatalogMenu.label);
            // The store-change service's count is the line under the step, never a
            // position (progress vocabulary slice 5): the step's position is where it
            // sits in the run.
            step(S.warmingProductPages.label, 'Warming product pages: 1 of 39 pages');
        } else {
            step(S.updatingCatalogMenu.label);
            step(S.warmingProductPages.label);
        }
        step(S.checkingSettings.label);
        return { success: true, cdnVerified: true };
    });
}

/** The modal's lines while a step runs: [line 1, its position, line 2]. */
function runningAt(): Array<[unknown, unknown, unknown]> {
    return pushes()
        .filter((p) => p.state === 'running' && p.stage !== undefined)
        .map((p) => [p.stage, p.position, p.step]);
}

const at = (index: number, total: number) => ({ index, total });

describe('republish, in the progress modal', () => {
    it('numbers the ten steps of a republish, each with what it is doing under it', async () => {
        playsSteps(false);
        startModalRun(OP, screen);

        await handleRepublishContent(republishContext(storefront(false)), { id: OP, progress: 'modal' });

        expect(runningAt()).toStrictEqual([
            [S.checkingRequirements.label, at(1, 10), 'Your DA.live sign-in'],
            [S.applyingDaLiveSettings.label, at(2, 10), S.applyingDaLiveSettings.detail],
            [S.publishingSettings.label, at(3, 10), S.publishingSettings.detail],
            [S.publishingSettings.label, at(3, 10), 'writing config.json'],
            [S.publishingCode.label, at(4, 10), S.publishingCode.detail],
            [S.settingSitePermissions.label, at(5, 10), S.settingSitePermissions.detail],
            [S.clearingCache.label, at(6, 10), S.clearingCache.detail],
            [S.publishingPages.label, at(7, 10), S.publishingPages.detail],
            [S.publishingPages.label, at(7, 10), '32 of 64 pages'],
            [S.updatingCatalogMenu.label, at(8, 10), S.updatingCatalogMenu.detail],
            [S.warmingProductPages.label, at(9, 10), S.warmingProductPages.detail],
            [S.checkingSettings.label, at(10, 10), S.checkingSettings.detail],
        ]);
    });

    // Whether the store changed is on the project before the run starts, so the list
    // is still known up front: one step more, the old store's product pages.
    it('counts eleven steps after a store change, the count of pages under its step', async () => {
        playsSteps(true);
        startModalRun(OP, screen);

        await handleRepublishContent(republishContext(storefront(true)), { id: OP, progress: 'modal' });

        expect(runningAt().slice(-4)).toStrictEqual([
            [S.removingProductPages.label, at(8, 11), S.removingProductPages.detail],
            [S.updatingCatalogMenu.label, at(9, 11), S.updatingCatalogMenu.detail],
            [S.warmingProductPages.label, at(10, 11), '1 of 39 pages'],
            [S.checkingSettings.label, at(11, 11), S.checkingSettings.detail],
        ]);
    });
});

describe('republish, in a notification', () => {
    // The notification's one line is the step and its position, never a count.
    it('shows each step with its position', async () => {
        const report = jest.fn();
        (vscode.window.withProgress as jest.Mock).mockImplementation(async (_o, task) => task({ report }));
        playsSteps(false);

        await handleRepublishContent(republishContext(storefront(false)), undefined);

        const lines = [...new Set(report.mock.calls.map(([update]) => (update as { message?: string }).message))];
        expect(lines).toStrictEqual([
            'Checking requirements (1 of 10)',
            'Applying DA.live settings (2 of 10)',
            'Publishing the settings (3 of 10)',
            'Publishing the code (4 of 10)',
            'Setting site permissions (5 of 10)',
            'Clearing the cache (6 of 10)',
            'Publishing the pages (7 of 10)',
            'Updating the catalog menu (8 of 10)',
            'Warming product pages (9 of 10)',
            'Checking the settings (10 of 10)',
        ]);
    });
});
