/**
 * `populateMeshComponentConfigs` — copying the generated mesh `.env` into the
 * project's `componentConfigs` so the dashboard reads "Deployed" straight away.
 *
 * The guards here are all about WHICH project state is enough to act on, so each
 * test pins the decision: whether the reader ran at all, what path it was given,
 * and what ends up under the mesh component's id.
 */

const mockReadMeshEnvVarsFromFile = jest.fn();
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    readMeshEnvVarsFromFile: (...args: unknown[]) => mockReadMeshEnvVarsFromFile(...args),
}));

import { populateMeshComponentConfigs } from './executorMeshPhase.testUtils';
import { createMockLogger } from './executorMeshPhase.testUtils';
import type { ComponentInstance, Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

const MESH_ID = 'commerce-mesh';
const MESH_PATH = '/projects/demo/components/commerce-mesh';

function meshInstance(overrides: Partial<ComponentInstance> = {}): ComponentInstance {
    return {
        id: MESH_ID,
        name: 'Commerce API Mesh',
        type: 'dependency',
        subType: 'mesh',
        status: 'deployed',
        path: MESH_PATH,
        lastUpdated: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    };
}

function projectWith(instance: ComponentInstance | undefined, rest: Partial<Project> = {}): Project {
    return createMockProject({
        componentInstances: instance ? { [instance.id]: instance } : {},
        // The canonical fixture ships an empty `componentConfigs`; production
        // reaches this function on a project that has none at all, and the
        // lazy-init guard is only observable from that state.
        componentConfigs: undefined,
        ...rest,
    });
}

function createContext(): HandlerContext {
    return createMockHandlerContext({ logger: createMockLogger() });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockReadMeshEnvVarsFromFile.mockResolvedValue({});
});

describe('populateMeshComponentConfigs', () => {
    it('reads the mesh component’s own directory and stores the vars under its id', async () => {
        mockReadMeshEnvVarsFromFile.mockResolvedValue({
            API_MESH_ID: 'mesh-1',
            COMMERCE_URL: 'https://commerce.example.com',
        });
        const project = projectWith(meshInstance());

        await populateMeshComponentConfigs(createContext(), project);

        expect(mockReadMeshEnvVarsFromFile).toHaveBeenCalledWith(MESH_PATH);
        expect(project.componentConfigs).toStrictEqual({
            [MESH_ID]: { API_MESH_ID: 'mesh-1', COMMERCE_URL: 'https://commerce.example.com' },
        });
    });

    it('leaves another component’s existing config untouched', async () => {
        mockReadMeshEnvVarsFromFile.mockResolvedValue({ API_MESH_ID: 'mesh-1' });
        const project = projectWith(meshInstance(), {
            componentConfigs: { 'eds-storefront': { SITE: 'demo' } },
        });

        await populateMeshComponentConfigs(createContext(), project);

        expect(project.componentConfigs).toStrictEqual({
            'eds-storefront': { SITE: 'demo' },
            [MESH_ID]: { API_MESH_ID: 'mesh-1' },
        });
    });

    it('reads nothing when the project has no mesh component', async () => {
        const project = projectWith(undefined);

        await populateMeshComponentConfigs(createContext(), project);

        expect(mockReadMeshEnvVarsFromFile).not.toHaveBeenCalled();
        expect(project.componentConfigs).toBeUndefined();
    });

    it('reads nothing when the mesh component was never cloned to a path', async () => {
        const project = projectWith(meshInstance({ path: undefined }));

        await populateMeshComponentConfigs(createContext(), project);

        expect(mockReadMeshEnvVarsFromFile).not.toHaveBeenCalled();
        expect(project.componentConfigs).toBeUndefined();
    });

    it('reads nothing when the mesh component has no id to key the config by', async () => {
        const project = projectWith(meshInstance({ id: '' }));

        await populateMeshComponentConfigs(createContext(), project);

        expect(mockReadMeshEnvVarsFromFile).not.toHaveBeenCalled();
        expect(project.componentConfigs).toBeUndefined();
    });

    it('writes no entry when the generated .env holds no variables', async () => {
        mockReadMeshEnvVarsFromFile.mockResolvedValue({});
        const project = projectWith(meshInstance());

        await populateMeshComponentConfigs(createContext(), project);

        expect(mockReadMeshEnvVarsFromFile).toHaveBeenCalledWith(MESH_PATH);
        expect(project.componentConfigs).toBeUndefined();
    });
});
