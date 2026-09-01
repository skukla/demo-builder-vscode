/**
 * Shared test factories for the appBuilderComponentRunner suites
 * (appBuilderComponentRunner.test.ts — add/deploy/remove routing;
 * appBuilderComponentRunner-keyed-state.test.ts — keyed-state/name persistence).
 *
 * NOTE: `jest.mock` calls are per-file and stay in each test file; only the
 * mock-free factories live here.
 */

import type { Project } from '@/types/base';
import type { ComponentInstaller } from '@/features/app-builder/services/appBuilderComponentRunner';
import type { ComponentInstallResult } from '@/features/components/services/types';
import type { TransformedComponentDefinition } from '@/types/components';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

// =============================================================================
// Catalog entries
// =============================================================================

export const MESH_ENTRY: AppBuilderComponentCatalogEntry = {
    id: 'commerce-mesh',
    name: 'Commerce Mesh',
    description: 'API Mesh',
    kind: 'mesh',
    source: { owner: 'skukla', repo: 'commerce-paas-mesh', branch: 'main' },
    requiredApis: ['GraphQLServiceSDK'],
    providesEnvVars: ['MESH_ENDPOINT'],
};

export const INTEGRATION_ENTRY: AppBuilderComponentCatalogEntry = {
    id: 'erp-bridge',
    name: 'ERP Bridge',
    description: 'Custom integration',
    kind: 'integration',
    source: { owner: 'acme', repo: 'erp-bridge', branch: 'main' },
    requiredApis: ['AdobeIOManagementAPISDK'],
};

// =============================================================================
// Mock factories
// =============================================================================

/**
 * `ComponentManagerLike` was DELETED here on 2026-09-01 in favour of
 * `ComponentInstaller`, the same two-method shape declared in PRODUCTION beside the
 * runner that consumes it.
 *
 * The shape was right; the location was not. Written here, nothing held the runner
 * to it — the dependency still demanded the whole 16-member `ComponentManager`
 * class, and the 29 `as never` casts on the deps argument were the price. Declared
 * in production, the compiler checks both ends against one definition.
 */
export function createComponentManager(): jest.Mocked<ComponentInstaller> {
    return {
        // FAITHFUL to production: the real installComponent BUILDS the instance
        // (carrying `subType` off the definition) and RETURNS it — it does not
        // attach it to the project. Attaching is the caller's job.
        //
        // This mock used to do `project.componentInstances[def.id] = instance`,
        // which is why every runner test passed while a dashboard-added mesh
        // persisted no instance at all: on the next load `discoverComponents`
        // synthesized a thin one with no `subType`, `getMeshComponentInstance`
        // (which matches on subType === 'mesh') found nothing, the dashboard
        // reported mesh=none, and the integrations grid dropped the mesh card.
        // A mock more generous than production hides exactly this class of bug.
        //
        // The parameter and return types are the REAL ones. They used to be a
        // narrower hand-written pair — `def: { id; name?; subType? }` returning
        // loose strings — which typechecked only because the deps argument was cast
        // at all 29 call sites. With the cast gone the compiler reads this against
        // `ComponentInstaller` and would reject a signature that drifts from it.
        installComponent: jest.fn(
            async (
                _project: Project,
                def: TransformedComponentDefinition
            ): Promise<ComponentInstallResult> => ({
                success: true,
                component: {
                    id: def.id,
                    name: def.name ?? def.id,
                    type: 'app-builder',
                    subType: def.subType,
                    status: 'ready',
                    path: `/proj/components/${def.id}`,
                    lastUpdated: new Date(),
                },
            })
        ),
        removeComponent: jest.fn(async (project: Project, id: string) => {
            if (project.componentInstances) {
                delete project.componentInstances[id];
            }
        }),
    };
}

/** The canonical executor fake (ADR-016), with this suite's success default. */
export function createCommandManager(): jest.Mocked<CommandExecutor> {
    return createMockCommandExecutor({
        execute: jest.fn().mockResolvedValue(createSuccessResult()),
    });
}

/** Canonical logger fake (ADR-016); local name kept so consumers are unchanged. */
import { createMockLogger as createLogger } from '../../../helpers/loggerFake';
import { createMockProject as createMockProjectBase } from '../../../helpers/projectFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createSuccessResult } from '../../../helpers/commandResultFake';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
export { createLogger };

export function createDeps(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        componentManager: createComponentManager(),
        commandManager: createCommandManager(),
        logger: createLogger(),
        saveProject: jest.fn().mockResolvedValue(undefined),
        // Composition changed → the skill set is re-derived (AI-1o). Production
        // wires generateAIContextFiles; suites assert it was called.
        refreshAiBundle: jest.fn().mockResolvedValue(undefined),
        getCachedOrganization: jest.fn().mockReturnValue(undefined),
        // The two deploy tails (mocked; production wires the real ones).
        deployMesh: jest.fn().mockResolvedValue({
            success: true,
            data: { meshId: 'mesh-1', endpoint: 'https://mesh/graphql' },
        }),
        deployApp: jest.fn().mockResolvedValue({
            success: true,
            data: { url: 'https://app/api', deployedUrls: { 'web/app': 'https://app/api' } },
        }),
        // Mesh staleness baseline (mesh only; see -meshRecordParity.test.ts).
        captureMeshBaseline: jest
            .fn()
            .mockResolvedValue({ envVars: { MESH_KEY: 'v' }, sourceHash: 'sha-default' }),
        // Registry-driven .env write (mesh only; see appBuilderComponentRunner-envFile.test.ts).
        writeComponentEnv: jest.fn().mockResolvedValue(undefined),
        // API subscriber (mocked).
        subscribeRequiredApis: jest.fn().mockResolvedValue(undefined),
        // Storefront republish (mocked; production wires republishStorefrontConfig).
        republishStorefront: jest.fn().mockResolvedValue({ success: true }),
        // The catalog of all appBuilderComponents (for the union subscribe).
        catalog: [MESH_ENTRY, INTEGRATION_ENTRY],
        secrets: {},
        ...overrides,
    };
}

export function createProject(overrides: Partial<Project> = {}): Project {
    return createMockProjectBase({
        name: 'test-project',
        path: '/proj',
        adobe: {
            organization: 'org-123',
            projectId: 'proj-456',
            workspace: 'ws-789',
        },
        componentInstances: {},
        ...overrides,
    })
}
