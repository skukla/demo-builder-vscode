/**
 * Moving installed components when a release moves Demo Builder's Node (PR-1a step 9).
 * Every collaborator is handed in, so each rule is read off the arguments.
 */

import {
    moveInstalledComponentsToNode,
    type NodeMigrationDeps,
} from '@/features/components/services/nodeMigration';
import type { ComponentInstance, Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const component = (id: string, nodeVersion?: string): ComponentInstance => ({
    id,
    name: id,
    status: 'ready',
    path: `/p/components/${id}`,
    ...(nodeVersion ? { metadata: { nodeVersion } } : {}),
});

function deps(projects: Project[], overrides: Partial<NodeMigrationDeps> = {}) {
    return {
        knownProjects: jest.fn(async () => projects),
        ensureNode: jest.fn(async (): Promise<string | undefined> => undefined),
        reinstall: jest.fn(async (): Promise<string | undefined> => undefined),
        saveProject: jest.fn(async () => undefined),
        report: jest.fn(),
        ...overrides,
    };
}

describe('moveInstalledComponentsToNode', () => {
    it('reinstalls a component recorded under the old Node on the new one, and moves its record', async () => {
        const project = createMockProject({ name: 'citisignal', componentInstances: { headless: component('headless', '24') } });
        const d = deps([project]);

        const result = await moveInstalledComponentsToNode('26', d);

        expect(d.ensureNode).toHaveBeenCalledWith('26');
        expect(d.reinstall).toHaveBeenCalledWith(project, 'headless', project.componentInstances?.headless, '26');
        expect(project.componentInstances?.headless.metadata?.nodeVersion).toBe('26');
        expect(d.saveProject).toHaveBeenCalledWith(project);
        expect(result).toStrictEqual({ moved: ['citisignal: headless'], failed: [], running: [] });
    });

    it('leaves alone a component already on the Node, one with no record, and an own-repo one', async () => {
        const project = createMockProject({
            componentInstances: {
                current: component('current', '26'),
                unrecorded: component('unrecorded'),
                'acme-bridge': component('acme-bridge', '22'),
            },
            appBuilderComponents: {
                'acme-bridge': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'bridge' },
                    nodeVersion: '22',
                },
            },
        });
        const d = deps([project]);

        await moveInstalledComponentsToNode('26', d);

        expect(d.reinstall).not.toHaveBeenCalled();
        expect(d.saveProject).not.toHaveBeenCalled();
    });

    it('skips every component of a project whose demo is running', async () => {
        const project = createMockProject({
            name: 'live',
            status: 'running',
            componentInstances: { headless: component('headless', '24') },
        });
        const d = deps([project]);

        const result = await moveInstalledComponentsToNode('26', d);

        expect(d.reinstall).not.toHaveBeenCalled();
        expect(project.componentInstances?.headless.metadata?.nodeVersion).toBe('24');
        expect(result.running).toStrictEqual(['live']);
    });

    it('keeps the old record when a reinstall fails, and reports it', async () => {
        const project = createMockProject({ name: 'p', componentInstances: { headless: component('headless', '24') } });
        const d = deps([project], { reinstall: jest.fn(async () => 'npm ERR! engine') });

        const result = await moveInstalledComponentsToNode('26', d);

        expect(project.componentInstances?.headless.metadata?.nodeVersion).toBe('24');
        expect(d.saveProject).not.toHaveBeenCalled();
        expect(result.failed).toStrictEqual([{ component: 'p: headless', error: 'npm ERR! engine' }]);
    });

    it('moves nothing when the new Node cannot be prepared', async () => {
        const project = createMockProject({ componentInstances: { headless: component('headless', '24') } });
        const d = deps([project], { ensureNode: jest.fn(async () => 'offline') });

        const result = await moveInstalledComponentsToNode('26', d);

        expect(result.nodeError).toBe('offline');
        expect(d.knownProjects).not.toHaveBeenCalled();
        expect(d.reinstall).not.toHaveBeenCalled();
    });

    it('prepares the new Node even when nothing is behind', async () => {
        const d = deps([]);

        expect(await moveInstalledComponentsToNode('26', d)).toStrictEqual({ moved: [], failed: [], running: [] });
        expect(d.ensureNode).toHaveBeenCalledWith('26');
    });
});
