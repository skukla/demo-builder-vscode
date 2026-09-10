/**
 * Shared harness for the `cleanupService` suite family.
 *
 * The suite's mock preamble was DEAD and is not carried here. It mocked
 * `@/core/utils/timeoutConfig` for a service that reads no timeout — measured
 * 2026-09-05, all 36 tests pass without it. Deleted rather than moved.
 *
 * What IS shared is the arrangement every test needs: four collaborator fakes,
 * the order tape that proves cleanup runs Backend -> Config Service -> DA.live ->
 * GitHub, and the two constructions of the subject (with and without a
 * ConfigurationService, since whether one was injected is itself a decision the
 * service makes).
 *
 * The subject is re-exported from here so a suite that later needs a `jest.mock`
 * does not have to relearn why moving one registers it too late.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

import { CleanupService } from '@/features/eds/services/cleanupService';
import type { ConfigurationService } from '@/features/eds/services/configService/configurationService';
import type { DaLiveOrgOperations } from '@/features/eds/services/daLive/daLiveOrgOperations';
import type { GitHubRepoOperations } from '@/features/eds/services/github/githubRepoOperations';
import type { ToolManager } from '@/features/eds/services/toolManager';

export { CleanupService };
export type { EdsCleanupOptions, EdsMetadata } from '@/features/eds/services/types';

/** Everything a spec arranges against, plus the two ways to build the subject. */
export interface CleanupHarness {
    githubRepoOps: jest.Mocked<Partial<GitHubRepoOperations>>;
    daLiveOrgOps: jest.Mocked<Partial<DaLiveOrgOperations>>;
    toolManager: jest.Mocked<Partial<ToolManager>>;
    configurationService: jest.Mocked<Partial<ConfigurationService>>;
    /** Names of the collaborators called, in call order. */
    operationOrder: string[];
    /** The subject built WITHOUT a ConfigurationService. */
    cleanupService: CleanupService;
    /** Build the subject with the harness's ConfigurationService injected. */
    withConfigService: () => CleanupService;
}

/**
 * Fresh fakes plus the subject built from them.
 *
 * Call from each spec's OWN `beforeEach` — a `beforeEach` declared here would not
 * apply to a module that imports it.
 */
export function setupCleanupHarness(): CleanupHarness {
    const operationOrder: string[] = [];

    const githubRepoOps: jest.Mocked<Partial<GitHubRepoOperations>> = {
        deleteRepository: jest.fn().mockImplementation(async () => {
            operationOrder.push('github');
            return { success: true };
        }),
        archiveRepository: jest.fn().mockImplementation(async () => {
            operationOrder.push('github');
            return { success: true };
        }),
    };

    const daLiveOrgOps: jest.Mocked<Partial<DaLiveOrgOperations>> = {
        deleteSite: jest.fn().mockImplementation(async () => {
            operationOrder.push('dalive');
            return { success: true };
        }),
    };

    const toolManager: jest.Mocked<Partial<ToolManager>> = {
        executeAcoCleanup: jest.fn().mockImplementation(async () => {
            operationOrder.push('backend');
            return { success: true, stdout: 'Cleanup complete', stderr: '', duration: 1000 };
        }),
        executeCommerceCleanup: jest.fn().mockImplementation(async () => {
            operationOrder.push('backend');
            return { success: true, stdout: 'Cleanup complete', stderr: '', duration: 1000 };
        }),
    };

    const configurationService: jest.Mocked<Partial<ConfigurationService>> = {
        deleteSiteConfig: jest.fn().mockImplementation(async () => {
            operationOrder.push('configService');
            return { success: true };
        }),
    };

    const harness: CleanupHarness = {
        githubRepoOps,
        daLiveOrgOps,
        toolManager,
        configurationService,
        operationOrder,
        cleanupService: buildService(),
        withConfigService: () =>
            buildService(configurationService as unknown as ConfigurationService),
    };

    return harness;

    function buildService(injected?: ConfigurationService): CleanupService {
        return new CleanupService(
            githubRepoOps as unknown as GitHubRepoOperations,
            daLiveOrgOps as unknown as DaLiveOrgOperations,
            toolManager as unknown as ToolManager,
            undefined,
            injected,
        );
    }
}
