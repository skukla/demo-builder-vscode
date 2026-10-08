/**
 * The Node move's real collaborators (PR-1a step 9): which projects it finds, how it
 * saves one without opening it, and what it reinstalls with.
 */

jest.mock('@/features/components/services/componentManager', () => ({
    ComponentManager: jest.fn().mockImplementation(() => ({ installNpmDependencies: mockInstall })),
}));
jest.mock('@/features/components/services/ComponentRegistryManager', () => ({
    ComponentRegistryManager: jest.fn().mockImplementation(() => ({ getComponentById: mockDefinition })),
}));

const mockInstall = jest.fn();
const mockDefinition = jest.fn();

import { createNodeMigrationDeps } from '@/features/components/services/nodeMigrationDeps';
import type { ComponentInstance, Project } from '@/types/base';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

function stateManagerWith(projects: Record<string, Project>, folder: string[], recent: string[], current?: string) {
    return createMockStateManager({
        getAllProjects: jest.fn(async () => folder.map((path) => ({ name: path, path, lastModified: new Date() }))),
        getRecentProjects: jest.fn(async () => recent.map((path) => ({ name: path, path, lastOpened: new Date().toISOString() }))),
        readProject: jest.fn(async (path: string) => projects[path] ?? null),
        getCurrentProject: jest.fn(async () => (current ? projects[current] : undefined)),
    });
}

const build = (sm: ReturnType<typeof stateManagerWith>) =>
    createNodeMigrationDeps(sm, createMockCommandExecutor(), '/ext', createMockLogger(), jest.fn());

beforeEach(() => {
    jest.clearAllMocks();
    mockInstall.mockResolvedValue({ success: true });
});

describe('createNodeMigrationDeps', () => {
    it('finds every project in the projects folder AND the recent list, once each, never opening them', async () => {
        const a = createMockProject({ path: '/projects/a' });
        const b = createMockProject({ path: '/elsewhere/b' });
        const sm = stateManagerWith({ '/projects/a': a, '/elsewhere/b': b }, ['/projects/a'], ['/projects/a', '/elsewhere/b', '/gone']);

        expect(await build(sm).knownProjects()).toStrictEqual([a, b]);
        expect(sm.readProject).toHaveBeenCalledTimes(3);
    });

    it('saves the open project through saveProject, any other without opening it', async () => {
        const open = createMockProject({ path: '/projects/open' });
        const other = createMockProject({ path: '/projects/other' });
        const sm = stateManagerWith({ '/projects/open': open, '/projects/other': other }, [], [], '/projects/open');
        const deps = build(sm);

        await deps.saveProject(open);
        await deps.saveProject(other);

        expect(sm.saveProject).toHaveBeenCalledWith(open);
        expect(sm.saveProjectConfigOnly).toHaveBeenCalledWith(other);
    });

    it('reinstalls with the catalog definition on the new Node, else a bare one', async () => {
        const deps = build(stateManagerWith({}, [], []));
        const headless: ComponentInstance = { id: 'headless', name: 'Headless', status: 'ready', path: '/p/components/headless' };
        mockDefinition.mockResolvedValueOnce({ id: 'headless', name: 'Headless', type: 'frontend' });

        expect(await deps.reinstall(createMockProject(), 'headless', headless, '26')).toBeUndefined();
        expect(mockInstall).toHaveBeenCalledWith('/p/components/headless', { id: 'headless', name: 'Headless', type: 'frontend' }, '26');

        mockDefinition.mockResolvedValueOnce(undefined);
        await deps.reinstall(createMockProject(), 'demo-erp', { ...headless, id: 'demo-erp', name: 'ERP', path: '/p/components/demo-erp' }, '26');
        expect(mockInstall).toHaveBeenLastCalledWith('/p/components/demo-erp', { id: 'demo-erp', name: 'ERP', type: 'app-builder' }, '26');
    });

    it('answers why when a reinstall cannot run or fails', async () => {
        const deps = build(stateManagerWith({}, [], []));
        const noPath: ComponentInstance = { id: 'x', name: 'X', status: 'ready' };
        expect(await deps.reinstall(createMockProject(), 'x', noPath, '26')).toBe('it has no folder on disk');

        mockInstall.mockResolvedValueOnce({ success: false, error: 'npm ERR! engine' });
        expect(await deps.reinstall(createMockProject(), 'x', { ...noPath, path: '/p/x' }, '26')).toBe('npm ERR! engine');
    });
});
