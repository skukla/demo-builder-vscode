/**
 * Shared test factories for the appBuilderComponentRunner suites
 * (appBuilderComponentRunner.test.ts — add/deploy/remove routing;
 * appBuilderComponentRunner-keyed-state.test.ts — keyed-state/name persistence).
 *
 * NOTE: `jest.mock` calls are per-file and stay in each test file; only the
 * mock-free factories live here (same pattern as appComponentManager.testUtils.ts).
 */

import type { Project } from '@/types/base';
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

export interface ComponentManagerLike {
    installComponent: jest.Mock;
    removeComponent: jest.Mock;
}

export function createComponentManager(): ComponentManagerLike {
    return {
        installComponent: jest.fn(async (project: Project, def: { id: string; name?: string }) => {
            const instance = {
                id: def.id,
                name: def.name ?? def.id,
                type: 'app-builder',
                status: 'ready',
                path: `/proj/components/${def.id}`,
                lastUpdated: new Date(),
            };
            project.componentInstances = project.componentInstances ?? {};
            project.componentInstances[def.id] = instance as never;
            return { success: true, component: instance };
        }),
        removeComponent: jest.fn(async (project: Project, id: string) => {
            if (project.componentInstances) {
                delete project.componentInstances[id];
            }
        }),
    };
}

export function createCommandManager() {
    return {
        execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
    };
}

export function createLogger() {
    return { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() };
}

export function createDeps(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        componentManager: createComponentManager(),
        commandManager: createCommandManager(),
        logger: createLogger(),
        saveProject: jest.fn().mockResolvedValue(undefined),
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
        // API subscriber (mocked).
        subscribeRequiredApis: jest.fn().mockResolvedValue(undefined),
        // Storefront republish (mocked; production wires republishStorefrontConfig).
        republishStorefront: jest.fn().mockResolvedValue({ success: true }),
        // The catalog of all appBuilderComponents (for the union subscribe).
        catalog: [MESH_ENTRY, INTEGRATION_ENTRY],
        secrets: {} as never,
        ...overrides,
    };
}

export function createProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        path: '/proj',
        adobe: {
            organization: 'org-123',
            projectId: 'proj-456',
            workspace: 'ws-789',
        },
        componentInstances: {},
        ...overrides,
    } as unknown as Project;
}
