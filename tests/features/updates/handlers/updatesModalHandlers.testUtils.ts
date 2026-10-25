/**
 * Shared setup for the updatesModalHandlers suites: the mocks, the check fixtures, and a
 * fresh handler module per test (the presented check is module state).
 *
 * FIRST in each spec: the jest.mock calls here must run before the handler loads, and the
 * handler loads only through `handlers()`, inside its own module sandbox.
 */

import type { FoundUpdates } from '@/features/updates/services/allUpdates';
import { emptyResult, type ApplyUpdatesResult } from '@/features/updates/services/updateApplyResult';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { MessageHandler } from '@/types/handlers';
import type { ApplyUpdatesRequest } from '@/types/pendingUpdates';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

export const mockApplyUpdatesHeadless = jest.fn();
export const mockUpdateExtension = jest.fn();
jest.mock('@/features/updates/services/updateApplyService', () => ({
    applyUpdatesHeadless: (...args: unknown[]) => mockApplyUpdatesHeadless(...args),
}));
jest.mock('@/features/updates/services/extensionUpdater', () => ({
    ExtensionUpdater: jest.fn().mockImplementation(() => ({ updateExtension: mockUpdateExtension })),
}));
jest.mock('@/features/dashboard/handlers/integrationUpdateHandlers', () => ({
    updateIntegrationPairFor: jest.fn(),
    integrationUpdateProbe: jest.fn(() => jest.fn()),
}));
// The check run once the apply ends, to say what the SC left unticked that still waits.
export const mockFindAllUpdates = jest.fn();
jest.mock('@/features/updates/services/allUpdates', () => ({
    findAllUpdates: (...args: unknown[]) => mockFindAllUpdates(...args),
}));
jest.mock('@/core/di/serviceLocator', () => ({ ServiceLocator: { getCommandExecutor: jest.fn(() => ({})) } }));
// The handler loads in its own module sandbox (handlers() below), with its own vscode; the
// Chat command it runs is recorded here, outside the sandbox.
export const mockExecuteCommand = jest.fn();
jest.mock('vscode', () => {
    const actual = jest.requireActual('vscode');
    return { ...actual, commands: { ...actual.commands, executeCommand: (...args: unknown[]) => mockExecuteCommand(...args) } };
});
// Opening the AI reads the local copies; that is fixWithAi.test's (real git).
export const mockOpenFixWithAi = jest.fn();
jest.mock('@/features/updates/services/fixWithAi', () => ({
    openFixWithAi: (...args: unknown[]) => mockOpenFixWithAi(...args),
}));

export const bodea = createMockProject({ name: 'bodea', title: 'Bodea', path: '/p/bodea', status: 'stopped' });
export const justrite = createMockProject({ name: 'justrite', title: 'JustRite', path: '/p/justrite', status: 'stopped' });

export function selections(): UpdateSelections {
    return {
        forkSync: [],
        template: [{ project: bodea }],
        boilerplate: [],
        finish: [],
        component: [],
        adobeMcp: [],
        blockLibrary: [justrite, bodea].map((project) => ({
            project,
            library: {
                name: 'Demo Builder Blocks',
                source: { owner: 'skukla', repo: 'demo-builder-block-library', branch: 'main' },
                commitSha: 'a',
                blockIds: [],
                installedAt: '',
            },
            latestCommit: 'b',
        })),
        blockLibraryInstall: [],
        inspector: [],
        integration: [],
    };
}

export function found(overrides: Partial<FoundUpdates> = {}): FoundUpdates {
    return { selections: selections(), currentProjectPath: '/p/justrite', count: 3, ...overrides };
}

export function applied(overrides: Partial<ApplyUpdatesResult> = {}): ApplyUpdatesResult {
    return {
        forkSync: emptyResult(),
        template: emptyResult(),
        boilerplate: emptyResult(),
        finish: emptyResult(),
        component: emptyResult(),
        adobeMcp: emptyResult(),
        addon: emptyResult(),
        blockLibraryInstall: emptyResult(),
        integration: emptyResult(),
        totalApplied: 1,
        totalFailed: 0,
        ...overrides,
    };
}

export type Handlers = typeof import('@/features/updates/handlers/updatesModalHandlers');

/** A fresh module per test: the presented check is module state. */
export function handlers(): Handlers {
    let loaded!: Handlers;
    jest.isolateModules(() => {
        loaded = jest.requireActual('@/features/updates/handlers/updatesModalHandlers');
    });
    return loaded;
}

export const modal = (ids: string[]): ApplyUpdatesRequest => ({ ids, progress: 'modal' });

/** The row statuses the screen was told, in order. */
export function statusesSent(ctx: ReturnType<typeof createMockHandlerContext>): unknown[] {
    return ctx.sendMessage.mock.calls.filter(([type]) => type === 'updateRowStatus').map(([, status]) => status);
}
export const apply = (h: Handlers): MessageHandler<ApplyUpdatesRequest> => h.handleApplyUpdates;

/** Each spec's beforeEach. */
export function resetModalMocks(): void {
    jest.clearAllMocks();
    mockApplyUpdatesHeadless.mockResolvedValue(applied());
    mockFindAllUpdates.mockReset();
    mockExecuteCommand.mockReset();
    mockFindAllUpdates.mockResolvedValue(found({ selections: { ...selections(), template: [], blockLibrary: [] }, count: 0 }));
}
