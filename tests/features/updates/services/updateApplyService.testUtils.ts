/**
 * The fakes the headless apply suites stand on.
 *
 * Every collaborator the service constructs — the five services and the two
 * checkers — is a mock CLASS whose methods are module-scoped jest.fns, so a
 * suite can script one answer per call and read back what the service handed
 * each of them. The shared apply cores (block library, commit-sha rollback,
 * Adobe MCP) are mocked as functions for the same reason.
 *
 * THIS FILE OWNS THE jest.mock CALLS. Import it FIRST.
 */

import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { UpdateSelections } from '@/features/updates/services/updateApplyService';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

export const mockSyncFork = jest.fn();
export const mockCheckForkStatus = jest.fn();
export const mockSyncWithTemplate = jest.fn();
export const mockUpdateLastSyncedCommit = jest.fn();
export const mockUpdateComponent = jest.fn();
export const mockApplyAdobeMcpUpdate = jest.fn();
export const mockApplyBlockLibraryUpdateResolved = jest.fn();
export const mockUpdateCommitShaWithRollback = jest.fn();
export const mockCheckTemplateUpdates = jest.fn();
export const mockCheckAllProjectsForUpdates = jest.fn();
export const mockCheckMcpUpdates = jest.fn();
export const mockCheckBlockLibraries = jest.fn();
export const mockCheckInspectorSdk = jest.fn();

/** Constructor spies: what each service was BUILT with. */
export const ForkSyncServiceCtor = jest.fn();
export const TemplateSyncServiceCtor = jest.fn();
export const ComponentUpdaterCtor = jest.fn();
export const TemplateUpdateCheckerCtor = jest.fn();
export const UpdateManagerCtor = jest.fn();
export const AdobeMcpUpdateCheckerCtor = jest.fn();
export const AddonUpdateCheckerCtor = jest.fn();

jest.mock('@/features/updates/services/forkSyncService', () => ({
    ForkSyncService: class {
        constructor(...args: unknown[]) {
            ForkSyncServiceCtor(...args);
        }
        syncFork = (...a: unknown[]) => mockSyncFork(...a);
        checkForkStatus = (...a: unknown[]) => mockCheckForkStatus(...a);
    },
}));
jest.mock('@/features/updates/services/templateSyncService', () => ({
    TemplateSyncService: class {
        constructor(...args: unknown[]) {
            TemplateSyncServiceCtor(...args);
        }
        syncWithTemplate = (...a: unknown[]) => mockSyncWithTemplate(...a);
        updateLastSyncedCommit = (...a: unknown[]) => mockUpdateLastSyncedCommit(...a);
    },
}));
jest.mock('@/features/updates/services/componentUpdater', () => ({
    ComponentUpdater: class {
        constructor(...args: unknown[]) {
            ComponentUpdaterCtor(...args);
        }
        updateComponent = (...a: unknown[]) => mockUpdateComponent(...a);
    },
}));
jest.mock('@/features/updates/services/adobeMcpUpdateCore', () => ({
    applyAdobeMcpUpdate: (...a: unknown[]) => mockApplyAdobeMcpUpdate(...a),
}));
jest.mock('@/features/updates/services/updateCore', () => ({
    applyBlockLibraryUpdateResolved: (...a: unknown[]) => mockApplyBlockLibraryUpdateResolved(...a),
    updateCommitShaWithRollback: (...a: unknown[]) => mockUpdateCommitShaWithRollback(...a),
}));
jest.mock('@/features/updates/services/templateUpdateChecker', () => ({
    TemplateUpdateChecker: class {
        constructor(...args: unknown[]) {
            TemplateUpdateCheckerCtor(...args);
        }
        checkForUpdates = (...a: unknown[]) => mockCheckTemplateUpdates(...a);
    },
}));
jest.mock('@/features/updates/services/updateManager', () => ({
    UpdateManager: class {
        constructor(...args: unknown[]) {
            UpdateManagerCtor(...args);
        }
        checkAllProjectsForUpdates = (...a: unknown[]) => mockCheckAllProjectsForUpdates(...a);
    },
}));
jest.mock('@/features/updates/services/adobeMcpUpdateChecker', () => ({
    AdobeMcpUpdateChecker: class {
        constructor(...args: unknown[]) {
            AdobeMcpUpdateCheckerCtor(...args);
        }
        checkForUpdates = (...a: unknown[]) => mockCheckMcpUpdates(...a);
    },
}));
jest.mock('@/features/updates/services/addonUpdateChecker', () => ({
    AddonUpdateChecker: class {
        constructor(...args: unknown[]) {
            AddonUpdateCheckerCtor(...args);
        }
        checkBlockLibraries = (...a: unknown[]) => mockCheckBlockLibraries(...a);
        checkInspectorSdk = (...a: unknown[]) => mockCheckInspectorSdk(...a);
    },
}));

export type TestUpdateContext = UpdateContext & {
    stateManager: ReturnType<typeof createMockStateManager>;
    logger: ReturnType<typeof createMockLogger>;
};

export function makeCtx(): TestUpdateContext {
    return {
        secrets: createMockSecretStorage().secrets,
        extensionPath: '/ext',
        stateManager: createMockStateManager(),
        commandManager: createMockCommandExecutor(),
        logger: createMockLogger(),
    };
}

/** An EDS project whose template source is adobe/aem-boilerplate-commerce. */
export function edsProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'demo',
        path: '/p/demo',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: '/p/demo/components/eds-storefront',
                metadata: {
                    githubRepo: 'me/demo-storefront',
                    templateOwner: 'adobe',
                    templateRepo: 'aem-boilerplate-commerce',
                },
            },
        },
        installedInspectorSdk: { commitSha: 'old', installedAt: '2026-01-01T00:00:00.000Z' },
        ...overrides,
    });
}

export function installedLibrary(
    name: string,
    source = { owner: 'acme', repo: 'blocks', branch: 'main' }
): InstalledBlockLibrary {
    return {
        name,
        installedAt: '2026-01-01T00:00:00.000Z',
        source,
        commitSha: 'aaa',
        blockIds: ['hero'],
    };
}

export function emptySelections(): UpdateSelections {
    return {
        forkSync: [],
        template: [],
        component: [],
        adobeMcp: [],
        blockLibrary: [],
        inspector: [],
    };
}

/** Every collaborator answering "done, nothing to report". */
export function resetFakes(): void {
    jest.clearAllMocks();
    mockSyncFork.mockResolvedValue({ success: true, message: 'ok' });
    mockSyncWithTemplate.mockResolvedValue({
        success: true,
        syncedCommit: 'c1',
        strategy: 'merge',
    });
    mockUpdateLastSyncedCommit.mockResolvedValue(undefined);
    mockUpdateComponent.mockResolvedValue(undefined);
    mockApplyAdobeMcpUpdate.mockResolvedValue(undefined);
    mockApplyBlockLibraryUpdateResolved.mockResolvedValue(undefined);
    mockUpdateCommitShaWithRollback.mockResolvedValue(undefined);
    mockCheckForkStatus.mockResolvedValue(null);
    mockCheckTemplateUpdates.mockResolvedValue(null);
    mockCheckAllProjectsForUpdates.mockResolvedValue([]);
    mockCheckMcpUpdates.mockResolvedValue(null);
    mockCheckBlockLibraries.mockResolvedValue([]);
    mockCheckInspectorSdk.mockResolvedValue(null);
}
