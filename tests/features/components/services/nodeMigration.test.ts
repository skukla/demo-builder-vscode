/**
 * The Node sweep (PR-1a step 9): one of the activation upkeep sweeps. Every
 * collaborator is handed in, so each rule is read off the arguments.
 */

import {
    bareDefinition,
    sweepOntoDemoBuilderNode,
    type NodeSweepDeps,
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

function deps(projects: Project[], overrides: Partial<NodeSweepDeps> = {}) {
    const progressLines: string[] = [];
    const titles: string[] = [];
    const withProgress: NodeSweepDeps['withProgress'] = (title, run) => {
        titles.push(title);
        return run((line) => progressLines.push(line));
    };
    const d = {
        projects,
        node: '26',
        nodeReady: jest.fn(async () => true),
        ensureNode: jest.fn(async (): Promise<string | undefined> => undefined),
        reinstall: jest.fn(async (): Promise<string | undefined> => undefined),
        saveProject: jest.fn(async () => undefined),
        withProgress,
        log: jest.fn(),
        ...overrides,
    };
    return { d, progressLines, titles };
}

describe('sweepOntoDemoBuilderNode', () => {
    it('reinstalls a component recorded under the old Node on the new one, and moves its record', async () => {
        const project = createMockProject({ name: 'citisignal', componentInstances: { headless: component('headless', '24') } });
        const { d, titles, progressLines } = deps([project]);

        const result = await sweepOntoDemoBuilderNode(d);

        // The notification: an -ing title, then the stage alone with a count (handbook).
        expect(titles).toStrictEqual(['Updating to Node 26']);
        expect(progressLines).toStrictEqual(['Preparing Node', 'Reinstalling packages (1 of 1)']);
        expect(d.ensureNode).toHaveBeenCalledWith('26');
        expect(d.reinstall).toHaveBeenCalledWith('headless', project.componentInstances?.headless, '26');
        expect(project.componentInstances?.headless.metadata?.nodeVersion).toBe('26');
        expect(d.saveProject).toHaveBeenCalledWith(project);
        expect(result).toStrictEqual({ ran: true, moved: ['citisignal: headless'], failed: [], running: [] });
    });

    it('does nothing and shows nothing when the Node is ready and nothing is behind', async () => {
        const { d, titles } = deps([createMockProject({ componentInstances: { headless: component('headless', '26') } })]);

        expect((await sweepOntoDemoBuilderNode(d)).ran).toBe(false);
        expect(titles).toStrictEqual([]);
    });

    it('prepares the Node when it is missing, even with nothing behind', async () => {
        const { d } = deps([createMockProject({ componentInstances: {} })], { nodeReady: jest.fn(async () => false) });

        expect((await sweepOntoDemoBuilderNode(d)).ran).toBe(true);
        expect(d.ensureNode).toHaveBeenCalledWith('26');
    });

    it('leaves a new SC alone: no projects, nothing prepared (the prerequisites do it)', async () => {
        const { d } = deps([], { nodeReady: jest.fn(async () => false) });

        expect((await sweepOntoDemoBuilderNode(d)).ran).toBe(false);
        expect(d.ensureNode).not.toHaveBeenCalled();
    });

    it('leaves alone a component with no record and one from an own repo with its own Node', async () => {
        const project = createMockProject({
            componentInstances: { unrecorded: component('unrecorded'), 'acme-bridge': component('acme-bridge', '22') },
            appBuilderComponents: {
                'acme-bridge': { kind: 'integration', status: 'deployed', source: { owner: 'acme', repo: 'bridge' }, nodeVersion: '22' },
            },
        });
        const { d } = deps([project]);

        await sweepOntoDemoBuilderNode(d);

        expect(d.reinstall).not.toHaveBeenCalled();
    });

    it('skips every component of a running demo, and says so', async () => {
        const project = createMockProject({ name: 'live', status: 'running', componentInstances: { headless: component('headless', '24') } });
        const { d, progressLines } = deps([project]);

        const result = await sweepOntoDemoBuilderNode(d);

        expect(d.reinstall).not.toHaveBeenCalled();
        expect(result.running).toStrictEqual(['live']);
        // Which project waits goes to the log; the notification shows stages only.
        expect(progressLines).toStrictEqual(['Preparing Node']);
        expect(d.log).toHaveBeenCalled();
    });

    it('keeps the old record when a reinstall fails, and reports it', async () => {
        const project = createMockProject({ name: 'p', componentInstances: { headless: component('headless', '24') } });
        const { d } = deps([project], { reinstall: jest.fn(async () => 'npm ERR! engine') });

        const result = await sweepOntoDemoBuilderNode(d);

        expect(project.componentInstances?.headless.metadata?.nodeVersion).toBe('24');
        expect(d.saveProject).not.toHaveBeenCalled();
        expect(result.failed).toStrictEqual([{ component: 'p: headless', error: 'npm ERR! engine' }]);
    });

    it('moves nothing when the Node cannot be prepared', async () => {
        const project = createMockProject({ componentInstances: { headless: component('headless', '24') } });
        const { d } = deps([project], { ensureNode: jest.fn(async () => 'offline') });

        const result = await sweepOntoDemoBuilderNode(d);

        expect(result.nodeError).toBe('offline');
        expect(d.reinstall).not.toHaveBeenCalled();
        // The warning sends the SC to User Logs, so the reason must be there.
        expect(d.log).toHaveBeenCalled();
    });
});

describe('bareDefinition', () => {
    it('describes a component the catalog does not define by its id and name', () => {
        expect(bareDefinition('demo-erp', component('demo-erp'))).toStrictEqual({
            id: 'demo-erp',
            name: 'demo-erp',
            type: 'app-builder',
        });
    });
});
