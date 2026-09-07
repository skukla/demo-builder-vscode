/**
 * Shared setup for the `executorAppBuilderPhase` suites.
 *
 * The family became a split family on 2026-09-07, when `-runtimeReady` joined
 * `-integrations` to cover `ensureWorkspaceRuntimeReady` — the phase's other
 * export, which no test entered. A split family needs a shared setup;
 * `tests/sop/test-family-setup.test.ts` enforces that.
 *
 * What is shared is the CATALOG-ENTRY fixtures and the config builder: both
 * suites drive `deployableAppIntegrationEntries`, the module-private resolver
 * that decides which selections are deployable apps, and both need the same
 * integration-kind and mesh-kind entries to do it.
 *
 * What is NOT shared is each suite's `jest.mock` preamble, and it cannot be: a
 * `jest.mock` only hoists above the imports of the file it appears in, so moving
 * one here would register it too late. The two suites also mock genuinely
 * different collaborators — the runner and its deps factory on one side, the
 * org-context wrapper and runtime provisioning on the other.
 *
 * This file owns the SUT import deliberately, matching `executorMeshPhase.testUtils.ts`.
 */

export {
    ensureWorkspaceRuntimeReady,
    executeAppBuilderIntegrationsPhase,
} from '@/features/project-creation/handlers/executorAppBuilderPhase';

import type { AdobeConfig } from '@/types/base';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

/** A catalog entry that DOES resolve to a deployable App Builder app. */
export const INTEGRATION_ENTRY = {
    id: 'erp-sync',
    name: 'ERP Sync',
    description: 'Sync ERP',
    kind: 'integration' as const,
    source: { owner: 'acme', repo: 'erp-sync', branch: 'main' },
};

/** A mesh-kind entry — installed by the mesh phase, excluded by this one. */
export const MESH_ENTRY = {
    id: 'commerce-paas-mesh',
    name: 'API Mesh',
    description: 'Mesh',
    kind: 'mesh' as const,
    source: { owner: 'adobe', repo: 'mesh', branch: 'main' },
};

/** A complete deploy target: org, project and workspace all known. */
export const ADOBE: AdobeConfig = {
    organization: 'org-1@AdobeOrg',
    projectId: 'proj-1',
    workspace: 'ws-1',
};

/** The wizard payload both phases take, with only the fields under test set. */
export function creationConfig(
    overrides: Partial<ProjectCreationConfig> = {},
): ProjectCreationConfig {
    return { projectName: 'demo', ...overrides };
}
