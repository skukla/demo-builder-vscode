/**
 * The wall and fixtures behind the two ORCHESTRATION suites of the
 * `edsResetService` family (`-orchestration` and `-finalize`).
 *
 * Those suites pin what the reset HANDS each collaborator — the arguments, the
 * progress the caller sees, and the exact result for each way a reset can end.
 * Every collaborator with its own zero-gap suite is walled off here and asserted
 * BY ARGUMENT in the suites: a mock cannot see a malformed call, so the call is
 * what gets checked.
 *
 * IMPORT THIS BEFORE the reset service under test; `jest.mock` hoists above the
 * imports of the module it appears in, not across modules. Pinned by
 * `tests/sop/mock-wall-import-order.test.ts`. This file imports the family's
 * shared wall first for the same reason.
 */

import './edsResetService.sharedMocks';

import type { Project } from '@/types/base';
import type { CodePatchResult } from '@/features/eds/services/patches/codePatchRegistry';
import type { StorefrontMigrationResult } from '@/features/eds/services/storefront/storefrontNameMigration';

// =============================================================================
// Walls
// =============================================================================

export const mockResetRepoToTemplate = jest.fn();
jest.mock('@/features/eds/services/reset/edsResetRepoHelper', () => ({
    resetRepoToTemplate: (...args: unknown[]) => mockResetRepoToTemplate(...args),
}));

export const mockRedeployApiMesh = jest.fn();
jest.mock('@/features/eds/services/reset/edsResetMeshHelper', () => ({
    redeployApiMesh: (...args: unknown[]) => mockRedeployApiMesh(...args),
}));

export const mockPublishConfig = jest.fn();
jest.mock('@/features/eds/services/reset/edsResetConfigStep', () => ({
    publishConfigAndRegisterSite: (...args: unknown[]) => mockPublishConfig(...args),
}));

export const mockMigrate = jest.fn();
jest.mock('@/features/eds/services/storefront/storefrontNameMigration', () => ({
    migrateStorefrontNamingIfNeeded: (...args: unknown[]) => mockMigrate(...args),
}));

export const mockPreviewCode = jest.fn();
/** The one instance every `new HelixService(...)` in the reset returns. */
export const helixInstance = { previewCode: (...args: unknown[]) => mockPreviewCode(...args) };
export const mockHelixService = jest.fn((..._ctorArgs: unknown[]) => helixInstance);
jest.mock('@/features/eds/services/helix/helixService', () => ({
    HelixService: function HelixServiceFake(...args: unknown[]) {
        return mockHelixService(...args);
    },
}));

export const mockExecuteEdsPipeline = jest.fn();
jest.mock('@/features/eds/services/edsPipeline', () => ({
    executeEdsPipeline: (...args: unknown[]) => mockExecuteEdsPipeline(...args),
}));

export const mockVerifyCdnResources = jest.fn();
jest.mock('@/features/eds/services/configSyncService', () => ({
    verifyCdnResources: (...args: unknown[]) => mockVerifyCdnResources(...args),
}));

// The miss tracker writes ~/.demo-builder/patch-miss-counts.json; nothing in
// these suites is about miss counts, so it stays off the disk.
jest.mock('@/features/eds/services/patches/patchMissTracker', () => ({
    OBSOLETE_MISS_THRESHOLD: 3,
    trackPatchMisses: jest.fn().mockResolvedValue({}),
}));

// =============================================================================
// Imports (after the walls)
// =============================================================================

import { executeEdsReset } from '@/features/eds/services/reset/edsResetService';
import type { ConfigStepServices } from '@/features/eds/services/reset/edsResetConfigStep';
import type { EdsResetProgress } from '@/features/eds/services/reset/edsResetParams';
import { mockEnsureDaLiveAuth } from './edsResetService.sharedMocks';
import { createResetContext, meshDeps, resetParams } from './edsResetService.testUtils';
import { createMockProject } from '../../../../helpers/projectFake';

// =============================================================================
// Fixtures
// =============================================================================

export const mockTokenProvider = { getAccessToken: jest.fn().mockResolvedValue('mock-token') };

export const SERVICES: ConfigStepServices = {
    configService: { registerSite: jest.fn(), updateSiteConfig: jest.fn() },
};

const SKIPPED: StorefrontMigrationResult = { skipped: true, migrated: false };

export const REPO_RESULT = {
    filesReset: 5,
    blockCollectionIds: ['hero', 'cards'],
    libraryContentSources: [{ org: 'lib-org', site: 'lib-site' }],
    canonicalCodePatchResults: [] as CodePatchResult[],
};

function createProject(): Project {
    return createMockProject({ selectedPackage: 'citisignal', selectedStack: 'eds-paas' });
}

/** The happy path every test starts from; call it in `beforeEach`. */
export function resetOrchestrationMocks(): void {
    jest.clearAllMocks();
    mockMigrate.mockResolvedValue(SKIPPED);
    mockResetRepoToTemplate.mockResolvedValue(REPO_RESULT);
    mockPreviewCode.mockResolvedValue(undefined);
    mockPublishConfig.mockResolvedValue({ configWritten: true });
    mockExecuteEdsPipeline.mockResolvedValue({
        success: true,
        contentFilesCopied: 3,
        libraryPaths: [],
    });
    mockRedeployApiMesh.mockResolvedValue(null);
    mockVerifyCdnResources.mockResolvedValue({ configVerified: true });
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
}

/** Run a reset with the default happy path and collect every progress event. */
export async function runReset(
    overrides: Record<string, unknown> = {},
    context = createResetContext()
) {
    const project = (overrides.project as Project | undefined) ?? createProject();
    const params = resetParams(project, overrides);
    const progress: EdsResetProgress[] = [];
    const result = await executeEdsReset(
        params,
        context,
        mockTokenProvider,
        meshDeps,
        (p) => progress.push(p),
        SERVICES
    );
    return { result, progress, params, project, context };
}

/** The progress callback the reset hands the content pipeline. */
export function pipelineProgressCallback(): (info: {
    operation: string;
    message: string;
    current?: number;
    total?: number;
}) => void {
    return mockExecuteEdsPipeline.mock.calls[0][2];
}
