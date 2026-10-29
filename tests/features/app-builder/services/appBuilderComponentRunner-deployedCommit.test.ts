/**
 * Runner — the commit a deploy shipped (AB-71).
 *
 * Update decides "is the running app current?" by comparing the clone with
 * `deployedCommit`, so every deploy path must write it, and only a deploy that
 * succeeded may. The clone's commit is read through `readCloneCommit`, handed in.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import type { Project } from '@/types/base';

jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    listDeclaredExtensionPoints: jest.fn().mockResolvedValue([]),
    listDeclaredTriggersAndRules: jest.fn().mockResolvedValue({ triggers: [], rules: [] }),
    detectAppLayout: jest.fn().mockResolvedValue('standalone'),
}));

import { addAppBuilderComponent } from '@/features/app-builder/services/appBuilderAddRun';
import { deployAppBuilderComponent } from '@/features/app-builder/services/appBuilderRedeployRun';
import { INTEGRATION_ENTRY, createDeps, createProject } from './appBuilderComponentRunner.testUtils';

const ID = INTEGRATION_ENTRY.id;
const PATH = `/proj/components/${ID}`;

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

function deployedProject(deployedCommit?: string): Project {
    return createProject({
        componentInstances: { [ID]: { id: ID, name: INTEGRATION_ENTRY.name, status: 'deployed', path: PATH } },
        appBuilderComponents: {
            [ID]: {
                kind: 'integration',
                status: 'deployed',
                source: INTEGRATION_ENTRY.source,
                ...(deployedCommit ? { deployedCommit } : {}),
            },
        },
    });
}

describe('a deploy records the commit it shipped', () => {
    it('on an add', async () => {
        const deps = createDeps({ readCloneCommit: jest.fn(async () => 'abc1234') });
        const project = createProject();

        const result = await addAppBuilderComponent(project, INTEGRATION_ENTRY, deps);

        expect(result.success).toBe(true);
        expect(deps.readCloneCommit).toHaveBeenCalledWith(PATH);
        const persisted = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(persisted.appBuilderComponents?.[ID]?.deployedCommit).toBe('abc1234');
    });

    it('on a redeploy, reading the clone at the component path', async () => {
        const deps = createDeps({ readCloneCommit: jest.fn(async () => 'def5678') });
        const project = deployedProject('abc1234');

        const result = await deployAppBuilderComponent(project, ID, deps);

        expect(result.success).toBe(true);
        expect(deps.readCloneCommit).toHaveBeenCalledWith(PATH);
        expect(project.appBuilderComponents?.[ID]?.deployedCommit).toBe('def5678');
    });

    it('not on a failed deploy, which keeps the commit that is still running', async () => {
        const deps = createDeps({
            readCloneCommit: jest.fn(async () => 'def5678'),
            deployApp: jest.fn().mockResolvedValue({ success: false, error: 'aio app deploy failed: 504' }),
        });
        const project = deployedProject('abc1234');

        const result = await deployAppBuilderComponent(project, ID, deps);

        expect(result.success).toBe(false);
        expect(project.appBuilderComponents?.[ID]).toMatchObject({ status: 'error', deployedCommit: 'abc1234' });
    });

    it('forgets a recorded commit when the shipped one cannot be read, so update trusts the clone', async () => {
        const deps = createDeps({ readCloneCommit: jest.fn(async () => undefined) });
        const project = deployedProject('abc1234');

        await deployAppBuilderComponent(project, ID, deps);

        expect(project.appBuilderComponents?.[ID]?.deployedCommit).toBeUndefined();
    });
});
