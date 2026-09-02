/**
 * Shared setup for the checkUpdates suites — THE AGREED PART ONLY.
 *
 * This family does NOT agree about how to fake all of its dependencies, and
 * picking a winner would change what some suites exercise while every one of
 * them stayed green. So only the mocks that EVERY spec already declared
 * IDENTICALLY were moved here. Each spec keeps its own disputed mocks inline,
 * and therefore ends up with exactly the set it started with.
 *
 * Moved here (all specs agreed): @/features/eds/services/blockCollectionHelpers, @/features/eds/services/inspectorHelpers, @/features/updates/services/addonUpdateChecker, @/features/updates/services/componentUpdater, @/features/updates/services/extensionUpdater, @/features/updates/services/forkSyncService, @/features/updates/services/templateSyncService, @/features/updates/services/templateUpdateChecker, @/features/updates/services/updateManager
 * Left inline (specs disagree):  vscode
 *
 * Extracted 2026-08-30 (lane C2). Resolving the disputed ones is a separate
 * decision, deliberately not taken here.
 */

import { CheckUpdatesCommand } from '@/features/updates/commands/checkUpdates';
import { UpdateManager } from '@/features/updates/services/updateManager';
import { ForkSyncService } from '@/features/updates/services/forkSyncService';
import { AddonUpdateChecker } from '@/features/updates/services/addonUpdateChecker';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import { TemplateUpdateChecker } from '@/features/updates/services/templateUpdateChecker';

// Mock services
jest.mock('@/features/updates/services/updateManager');
jest.mock('@/features/updates/services/componentUpdater');
jest.mock('@/features/updates/services/extensionUpdater');
jest.mock('@/features/updates/services/forkSyncService');
jest.mock('@/features/updates/services/addonUpdateChecker');
jest.mock('@/features/updates/services/templateSyncService');
jest.mock('@/features/updates/services/templateUpdateChecker');
// Mock block collection and inspector helpers (for addon application)
jest.mock('@/features/eds/services/blockCollectionHelpers');
jest.mock('@/features/eds/services/inspectorHelpers');

export { CheckUpdatesCommand };
export { UpdateManager };
export { ForkSyncService };
export { AddonUpdateChecker };
export { TemplateSyncService };
export { TemplateUpdateChecker };

import type { Project } from '@/types/base';
import type { StateManager } from '@/types/state';
import type { Logger } from '@/types/logger';
import * as vscode from 'vscode';
import { COMPONENT_IDS } from '@/core/constants';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

/**
 * A project with an EDS storefront, a block library and the inspector SDK.
 *
 * Two suites wrote this out identically, 59 lines each. Built on the canonical
 * project builder; only the component instance and the two add-on records are
 * specific to update-checking.
 */
export function projectWithAddons(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'test-project',
        path: '/projects/test-project',
        status: 'stopped',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                type: 'frontend',
                version: '1.0.0',
                metadata: {
                    githubRepo: 'testuser/my-storefront',
                    templateOwner: 'adobe',
                    templateRepo: 'aem-boilerplate-commerce',
                    edsRepoOwner: 'testuser',
                    edsRepoName: 'my-storefront',
                    edsBranch: 'main',
                },
            },
        } as unknown as Project['componentInstances'],
        installedBlockLibraries: [
            {
                name: 'Demo Team Blocks',
                source: { owner: 'adobe', repo: 'aem-boilerplate-commerce', branch: 'main' },
                commitSha: 'abc123',
                blockIds: ['hero', 'cards'],
                installedAt: '2025-01-01T00:00:00Z',
            },
        ],
        installedInspectorSdk: {
            commitSha: 'sdk-abc123',
            installedAt: '2025-01-01T00:00:00Z',
        },
        ...overrides,
    });
}

export interface CheckUpdatesHarness {
    mockProgress: { report: jest.Mock };
    mockContext: vscode.ExtensionContext;
    mockStateManager: jest.Mocked<StateManager>;
    mockLogger: jest.Mocked<Logger>;
}

/**
 * Every collaborator answering "nothing to update", so a spec sets only the one
 * it is about.
 *
 * Identical in both upstream suites, ~50 lines each. The state manager and
 * extension context come from the canonical builders rather than the literals
 * behind `as any` that each suite carried.
 */
export function setupDefaultMocks(): CheckUpdatesHarness {
    const mockProgress = { report: jest.fn() };

    // From the canonical builder, not a four-field literal behind a cast: the
    // cast was load-bearing precisely because the literal was not a context.
    const mockContext = createMockExtensionContext({ extensionPath: '/ext' });

    const mockStateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(null),
        saveProject: jest.fn().mockResolvedValue(undefined),
        getAllProjects: jest.fn().mockResolvedValue([]),
        loadProjectFromPath: jest.fn().mockResolvedValue(null),
    }) as jest.Mocked<StateManager>;

    const mockLogger = createMockLogger() as jest.Mocked<Logger>;

    (vscode.window.withProgress as jest.Mock).mockImplementation((_opts, cb) => cb(mockProgress));

    const MockUpdateManager = UpdateManager as jest.MockedClass<typeof UpdateManager>;
    MockUpdateManager.prototype.checkExtensionUpdate = jest.fn().mockResolvedValue({
        hasUpdate: false,
        current: '1.0.0',
        latest: '1.0.0',
    });
    MockUpdateManager.prototype.checkAllProjectsForUpdates = jest.fn().mockResolvedValue([]);

    const MockTemplateChecker = TemplateUpdateChecker as jest.MockedClass<
        typeof TemplateUpdateChecker
    >;
    MockTemplateChecker.prototype.checkForUpdates = jest.fn().mockResolvedValue(null);

    const MockForkSync = ForkSyncService as jest.MockedClass<typeof ForkSyncService>;
    MockForkSync.prototype.checkForkStatus = jest.fn().mockResolvedValue(null);
    MockForkSync.prototype.syncFork = jest
        .fn()
        .mockResolvedValue({ success: true, message: 'Synced' });

    const MockAddonChecker = AddonUpdateChecker as jest.MockedClass<typeof AddonUpdateChecker>;
    MockAddonChecker.prototype.checkBlockLibraries = jest.fn().mockResolvedValue([]);
    MockAddonChecker.prototype.checkInspectorSdk = jest.fn().mockResolvedValue(null);

    const MockTemplateSync = TemplateSyncService as jest.MockedClass<typeof TemplateSyncService>;
    MockTemplateSync.prototype.syncWithTemplate = jest.fn().mockResolvedValue({
        success: true,
        syncedCommit: 'new-commit-sha',
        strategy: 'merge',
    });
    MockTemplateSync.prototype.updateLastSyncedCommit = jest.fn().mockResolvedValue(undefined);

    return { mockProgress, mockContext, mockStateManager, mockLogger };
}
