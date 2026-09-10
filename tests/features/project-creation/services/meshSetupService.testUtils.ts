/**
 * Shared fixtures for the meshSetupService suites.
 *
 * The three suites differ in WHAT they drive — the original one covers the
 * happy path and the wizard-config precedence, `-deployment` covers the retry
 * loop and the deploy-success bookkeeping, `-linking` covers linkExistingMesh —
 * but they all need the same project shape: one mesh component instance whose
 * `subType` is `'mesh'`, because that is what `getMeshComponentInstance` keys
 * on. Getting that one field wrong makes every guard in the module take the
 * early return, and the tests still pass while measuring nothing.
 *
 * `jest.mock` calls deliberately stay in each suite: a mock only hoists above
 * the imports of the file it appears in.
 */

import { ProjectSetupContext } from '@/features/project-creation/services/ProjectSetupContext';
import type { ComponentInstance, Project } from '@/types/base';
import type { ComponentRegistry, TransformedComponentDefinition } from '@/types/components';
import type { HandlerContext } from '@/types/handlers';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

/** The mesh component instance id every fixture here uses. */
export const MESH_ID = 'commerce-mesh';

/** Its cloned-repository path, which the guards require to be present. */
export const MESH_PATH = '/test/project/components/commerce-mesh';

/** A second, non-mesh instance — present so "was the record rebuilt?" is observable. */
export const OTHER_ID = 'eds-storefront';

export function meshInstance(overrides: Partial<ComponentInstance> = {}): ComponentInstance {
    return {
        id: MESH_ID,
        name: 'API Mesh',
        subType: 'mesh',
        path: MESH_PATH,
        version: '1.0.0',
        status: 'ready',
        ...overrides,
    };
}

export function storefrontInstance(): ComponentInstance {
    return {
        id: OTHER_ID,
        name: 'EDS Storefront',
        type: 'frontend',
        path: '/test/project/components/eds-storefront',
        version: '1.0.0',
        status: 'ready',
    };
}

/**
 * A project carrying a mesh instance and one unrelated instance.
 *
 * @param mesh - the mesh instance to install, or `null` for a project with no
 *   mesh at all (which is how the "nothing to link" guards get exercised). It is
 *   `null` and not `undefined` because passing `undefined` to a parameter with a
 *   default silently takes the default — which is how "no mesh" first arrived
 *   carrying a mesh.
 */
export function buildMeshProject(mesh: ComponentInstance | null = meshInstance()): Project {
    const instances: Record<string, ComponentInstance> = { [OTHER_ID]: storefrontInstance() };
    if (mesh) instances[MESH_ID] = mesh;
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        componentInstances: instances,
    };
}

export function createMeshDefinition(): TransformedComponentDefinition {
    return {
        id: MESH_ID,
        name: 'Adobe Commerce API Mesh',
        subType: 'mesh',
        configuration: {
            requiredEnvVars: ['ADOBE_COMMERCE_GRAPHQL_ENDPOINT'],
        },
    };
}

export function buildMeshRegistry(): ComponentRegistry {
    return {
        version: '1.0.0',
        envVars: {},
        components: {
            frontends: [],
            backends: [],
            dependencies: [],
            mesh: [],
            integrations: [],
        },
        services: {},
    };
}

export function buildMeshHandlerContext(): HandlerContext {
    return createMockHandlerContext();
}

/**
 * A real ProjectSetupContext over fake collaborators — real because the module
 * reads `config.adobe?.workspace` and `logger` off it, and a fake context would
 * be free to answer differently from the class the production caller builds.
 */
export function buildMeshSetupContext(
    project: Project,
    config: ProjectCreationConfig = { projectName: 'test-project' },
    handlerContext: HandlerContext = buildMeshHandlerContext()
): ProjectSetupContext {
    return new ProjectSetupContext(handlerContext, buildMeshRegistry(), project, config);
}
