/**
 * A removal whose leftovers are in a workspace of the component's own lets the workspace
 * take them (owner, 2026-09-27).
 *
 * Deleting a workspace deletes its Runtime namespace — about 11 minutes later, measured on
 * Bodea the same day — so stopping the removal to keep a workspace that is about to be
 * deleted anyway only makes the SC click twice. It still stops when something that stays
 * uses the workspace. The deleted workspace's key is read first and watched until Runtime
 * refuses it (`componentWorkspaceRelease.ts`).
 *
 * Sibling of appBuilderComponentRunner-runtimeVerify.test.ts; same preamble conventions.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import './appBuilderComponentRunner.runtimeMock';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';

jest.setTimeout(5000);

jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    detectAppLayout: jest.fn().mockResolvedValue('standalone'),
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    // The app declares an Admin UI SDK point, so the registry check has something to look for.
    listDeclaredExtensionPoints: jest.fn().mockResolvedValue(['commerce/backend-ui/1']),
    listDeclaredTriggersAndRules: jest.fn().mockResolvedValue({ triggers: [], rules: [] }),
}));

import { removeAppBuilderComponent } from '@/features/app-builder/services/appBuilderRemoveRun';
import { deriveOwPackage } from '@/features/app-builder/services/owPackageName';
import { createDeps, createProject } from './appBuilderComponentRunner.testUtils';

const ID = 'app-builder-shell';
const OWN = { id: 'ws-own', name: 'ShellOwn', title: 'Shell' };
const KEY = { AIO_RUNTIME_NAMESPACE: 'ns-shell', AIO_RUNTIME_AUTH: 'fake-test-auth-not-a-secret' };

/** The integration in a workspace of its own; `sharedWith` adds a component that stays in it. */
function project(sharedWith?: string): Project {
    const source = { owner: 'skukla', repo: 'app-builder-shell' };
    return createProject({
        componentInstances: {
            [ID]: {
                id: ID,
                name: 'Custom Integration',
                type: 'app-builder',
                subType: 'app',
                status: 'deployed',
                path: `/proj/components/${ID}`,
            },
        },
        appBuilderComponents: {
            [ID]: { kind: 'integration', status: 'deployed', source, workspace: OWN },
            ...(sharedWith ? { [sharedWith]: { kind: 'integration', status: 'deployed', source, workspace: OWN } } : {}),
        },
    });
}

/** Runtime keeps the app's package however often it is asked to delete it. */
function leftoverRefused(deps: ReturnType<typeof createDeps>): void {
    const owPackage = deriveOwPackage(ID);
    (deps.commandManager.execute as jest.Mock).mockImplementation(async (command: string) => {
        if (command.includes('package list')) return { code: 0, stdout: JSON.stringify([{ name: owPackage }]), stderr: '' };
        if (command.includes('package delete')) return { code: 1, stdout: '', stderr: 'Conflict (409)' };
        return { code: 0, stdout: '', stderr: '' };
    });
}

function releaseDeps() {
    return {
        namespaceKeyOf: jest.fn(async () => KEY),
        watchNamespaceRemoval: jest.fn(),
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

describe('leftovers in a workspace of its own', () => {
    it('finishes the removal and deletes the workspace, which takes them with it', async () => {
        const deps = createDeps(releaseDeps());
        leftoverRefused(deps);

        const result = await removeAppBuilderComponent(project(), ID, deps);

        expect(result.success).toBe(true);
        expect(deps.deleteComponentWorkspace).toHaveBeenCalledWith(expect.anything(), OWN);
        expect(result.runtimeCleanup).toMatchObject({
            failed: [deriveOwPackage(ID)],
            goneWithWorkspace: 'Shell',
        });
        expect(result.workspacesDeleted).toStrictEqual(['Shell']);
    });

    it("reads the workspace's key before deleting it, and watches that key", async () => {
        const order: string[] = [];
        const release = releaseDeps();
        release.namespaceKeyOf.mockImplementation(async () => {
            order.push('key');
            return KEY;
        });
        const deps = createDeps({
            ...release,
            deleteComponentWorkspace: jest.fn(async () => {
                order.push('delete');
                return undefined;
            }),
        });
        leftoverRefused(deps);

        await removeAppBuilderComponent(project(), ID, deps);

        expect(order).toStrictEqual(['key', 'delete']);
        expect(release.watchNamespaceRemoval).toHaveBeenCalledWith(KEY, 'Shell');
    });
});

/** The undeploy itself is refused, and Runtime keeps the package: the app is still serving. */
function undeployRefused(deps: ReturnType<typeof createDeps>): void {
    const owPackage = deriveOwPackage(ID);
    (deps.commandManager.execute as jest.Mock).mockImplementation(async (command: string) => {
        if (command.includes('app undeploy')) return { code: 2, stdout: '', stderr: 'IMS token expired' };
        if (command.includes('package list')) return { code: 0, stdout: JSON.stringify([{ name: owPackage }]), stderr: '' };
        if (command.includes('package delete')) return { code: 1, stdout: '', stderr: 'Conflict (409)' };
        return { code: 0, stdout: '', stderr: '' };
    });
}

// Deleting the workspace takes its Runtime namespace, and nothing else. When the
// UNDEPLOY failed, what the deploy published (the Admin UI SDK registration behind a
// Commerce grid column) is still there, and it is not in the namespace: letting the
// workspace "take" the leftovers would leave a registration nothing can reach. Found
// 2026-10-08 on the Justrite sandbox, which showed its ERP columns twice.
describe('leftovers in a workspace of its own, when the undeploy itself failed', () => {
    it('stops and keeps the card, the folder and the workspace', async () => {
        const deps = createDeps(releaseDeps());
        undeployRefused(deps);

        const result = await removeAppBuilderComponent(project(), ID, deps);

        expect(result).toMatchObject({ success: false, code: ErrorCode.COMPONENT_REMOVAL_STOPPED });
        expect(result.runtimeCleanup?.note).toContain('Commerce Admin registration');
        expect(result.runtimeCleanup?.goneWithWorkspace).toBeUndefined();
        expect(deps.deleteComponentWorkspace).not.toHaveBeenCalled();
        expect(deps.componentManager.removeComponent).not.toHaveBeenCalled();
        const saved = deps.saveProject.mock.calls.at(-1)?.[0] as Project;
        expect(saved.appBuilderComponents?.[ID]).toBeDefined();
        expect(saved.appBuilderComponents?.[ID]?.removalStopped).toBeDefined();
    });

    it('Remove anyway goes on and deletes the workspace', async () => {
        const deps = createDeps(releaseDeps());
        undeployRefused(deps);

        const result = await removeAppBuilderComponent(project(), ID, deps, { force: true });

        expect(result.success).toBe(true);
        expect(deps.deleteComponentWorkspace).toHaveBeenCalledWith(expect.anything(), OWN);
    });

    // The registry is what decides, when it can be read: a registration shown gone leaves
    // only Runtime leftovers, which the workspace takes as before.
    it('lets the workspace take the leftovers when the registry shows the registration gone', async () => {
        const registry = {
            workspaceExtensionPointsOf: jest.fn(async () => []),
            removeWorkspaceExtensionPoints: jest.fn(async () => []),
        };
        const deps = createDeps({ ...releaseDeps(), ...registry });
        undeployRefused(deps);

        const result = await removeAppBuilderComponent(project(), ID, deps);

        expect(result.success).toBe(true);
        expect(registry.workspaceExtensionPointsOf).toHaveBeenCalledWith(expect.anything(), OWN);
        expect(result.runtimeCleanup?.goneWithWorkspace).toBe('Shell');
        expect(deps.deleteComponentWorkspace).toHaveBeenCalledWith(expect.anything(), OWN);
    });
});

describe('leftovers in a workspace something else still uses', () => {
    it('stops and keeps the card, the folder and the workspace, as before', async () => {
        const deps = createDeps(releaseDeps());
        leftoverRefused(deps);

        const result = await removeAppBuilderComponent(project('stays-here'), ID, deps);

        expect(result).toMatchObject({ success: false, code: 'COMPONENT_REMOVAL_STOPPED' });
        expect(deps.componentManager.removeComponent).not.toHaveBeenCalled();
        expect(deps.deleteComponentWorkspace).not.toHaveBeenCalled();
    });
});

describe('a clean removal', () => {
    it('deletes its own workspace and says which', async () => {
        const deps = createDeps(releaseDeps());

        const result = await removeAppBuilderComponent(project(), ID, deps);

        expect(result).toMatchObject({ success: true, workspacesDeleted: ['Shell'] });
        expect(result.runtimeCleanup?.goneWithWorkspace).toBeUndefined();
    });
});
