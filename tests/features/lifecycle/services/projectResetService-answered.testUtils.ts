/**
 * The mock wall, the SUT import and the defaults the projectResetService suites that
 * drive the whole reset share (`-answered`, `-keptIntegrations`): the batch's door,
 * `runProjectResetAnswered`, and the agent's, `executeProjectReset`.
 *
 * IMPORTING THIS FILE REGISTERS THE MOCKS, and this file owns the import of the
 * service under test: `jest.mock` hoists above the imports of the module it
 * appears in, not across modules, so a spec that imported the service itself
 * could bind to the real collaborators. Specs import everything from here.
 *
 * Split out of the reset suite on 2026-10-09 (PL-69 sitting 9) when that suite
 * passed the 750-line limit. Fixtures that every
 * projectResetService suite shares stay in `projectResetService.testUtils.ts`.
 */

export const mockRm = jest.fn();
export const mockReaddir = jest.fn();
jest.mock('fs/promises', () => ({
    rm: (...a: unknown[]) => mockRm(...a),
    readdir: (...a: unknown[]) => mockReaddir(...a),
}));

export const mockGetFrontends = jest.fn();
export const mockGetDependencies = jest.fn();
export const mockGetComponentById = jest.fn();
export const mockLoadRegistry = jest.fn();
export const mockGetComponentRegistryManager = jest.fn((..._a: unknown[]) => ({
    loadRegistry: mockLoadRegistry,
    getFrontends: mockGetFrontends,
    getDependencies: mockGetDependencies,
    getComponentById: mockGetComponentById,
}));
jest.mock('@/features/components/services/componentRegistryInstance', () => ({
    getComponentRegistryManager: (...a: unknown[]) => mockGetComponentRegistryManager(...a),
}));

export const mockGetStackById = jest.fn();
jest.mock('@/features/components/services/demoPackageLoader', () => ({
    getStackById: (...a: unknown[]) => mockGetStackById(...a),
}));

export const mockCloneAllComponents = jest.fn();
export const mockInstallAllComponents = jest.fn();
jest.mock('@/features/project-creation/services/componentInstallationOrchestrator', () => ({
    cloneAllComponents: (...a: unknown[]) => mockCloneAllComponents(...a),
    installAllComponents: (...a: unknown[]) => mockInstallAllComponents(...a),
}));

export const mockRegenerateProjectEnvFiles = jest.fn();
jest.mock('@/features/project-creation/helpers/envFileRegeneration', () => ({
    regenerateProjectEnvFiles: (...a: unknown[]) => mockRegenerateProjectEnvFiles(...a),
}));

// No mesh component by default: the mesh leg has its own suite
// (projectResetService-meshContext). One test flips it on to pin the
// early return and the success wording.
export const mockGetMeshComponentInstance = jest.fn();
jest.mock('@/types/typeGuards', () => ({
    getMeshComponentInstance: (...a: unknown[]) => mockGetMeshComponentInstance(...a),
}));
export const mockEnsureProjectAdobeContext = jest.fn();
jest.mock('@/features/authentication/services/ensureProjectAdobeContext', () => ({
    ensureProjectAdobeContext: (...a: unknown[]) => mockEnsureProjectAdobeContext(...a),
}));
export const mockWithOrgContext = jest.fn((_t: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell/orgContextEnv', () => ({
    ...jest.requireActual('@/core/shell/orgContextEnv'),
    withOrgContext: (t: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(t, fn),
}));
export const mockDeployMeshCreateOrUpdate = jest.fn();
jest.mock('@/features/mesh/services/meshRedeploy', () => ({
    deployMeshCreateOrUpdate: (...a: unknown[]) => mockDeployMeshCreateOrUpdate(...a),
}));
jest.mock('@/features/mesh/services/meshDeployBaseline', () => ({
    updateMeshState: jest.fn(),
}));

export const mockSleep = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('@/core/utils/sleep', () => ({ sleep: (...a: unknown[]) => mockSleep(...a) }));

import * as vscode from 'vscode';
import {
    executeProjectReset,
    runProjectResetAnswered,
} from '@/features/lifecycle/services/projectResetService';
import {
    FRONTEND_DEF,
    MESH_DEF,
    DECOY_FRONTEND,
    DECOY_DEP,
    REGISTRY,
    STACK,
    authManager,
    commandManager,
    createResetHandlerContext,
    createResetProject,
} from './projectResetService.testUtils';

export { executeProjectReset, runProjectResetAnswered };
export {
    FRONTEND_DEF,
    MESH_DEF,
    DECOY_FRONTEND,
    DECOY_DEP,
    REGISTRY,
    STACK,
    authManager,
    commandManager,
    createResetHandlerContext,
    createResetProject,
};

export const showWarningMessage = vscode.window.showWarningMessage as jest.Mock;
export const showErrorMessage = vscode.window.showErrorMessage as jest.Mock;
export const withProgress = vscode.window.withProgress as jest.Mock;
export const executeCommand = vscode.commands.executeCommand as jest.Mock;

/** The reset as a batch row runs it, reporting into `progressReport`. */
export function run(project = createResetProject(), context = createResetHandlerContext(), logPrefix?: string) {
    return runProjectResetAnswered({ project, context, logPrefix, commandManager, authManager }, progressReport);
}

/** The definitions the orchestrator was handed, as a plain object for `toEqual`. */
export function handedDefinitions(): Record<string, unknown> {
    const ctx = mockCloneAllComponents.mock.calls[0][0] as {
        componentDefinitions: Map<string, unknown>;
    };
    return Object.fromEntries(ctx.componentDefinitions);
}

/** The batch row's `report`, fresh per test (a live binding: read it, never copy it). */
export let progressReport: jest.Mock = jest.fn();

/** Every mock back to its default answer: a reset that succeeds end to end. Call it from `beforeEach`. */
export function installResetDefaults(): void {
    jest.clearAllMocks();
    progressReport = jest.fn();
    mockRm.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([]);
    mockLoadRegistry.mockResolvedValue(REGISTRY);
    mockGetStackById.mockReturnValue(STACK);
    mockGetFrontends.mockResolvedValue([DECOY_FRONTEND, FRONTEND_DEF]);
    mockGetDependencies.mockResolvedValue([DECOY_DEP, MESH_DEF]);
    mockGetComponentById.mockResolvedValue(undefined);
    mockCloneAllComponents.mockResolvedValue(undefined);
    mockInstallAllComponents.mockResolvedValue(undefined);
    mockRegenerateProjectEnvFiles.mockResolvedValue(undefined);
    mockGetMeshComponentInstance.mockReturnValue(undefined);
    mockEnsureProjectAdobeContext.mockResolvedValue({ ready: true });
    mockDeployMeshCreateOrUpdate.mockResolvedValue({
        success: true,
        data: { endpoint: 'https://mesh.example/graphql' },
    });
}
