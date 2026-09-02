/**
 * Deploy-contract runner — the post-undeploy RUNTIME VERIFICATION (AB-7).
 *
 * `aio app undeploy` exits 0 while leaving deployed packages behind (measured
 * live 2026-08-28: a remove "succeeded" in 5.4s with the whole app still
 * serving; a kit removal left 12 packages). Removal therefore verifies: list
 * the namespace, delete leftovers attributable to this integration by name,
 * and NEVER answer clean success silently when verification was impossible.
 *
 * Sibling of appBuilderComponentRunner-remove.test.ts (that file is past the
 * 500-line soft limit); same mock preamble conventions.
 */

import type { Project } from '@/types/base';

jest.setTimeout(5000);

const mockWithOrgContext = jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell/orgContextEnv', () => ({
    ...jest.requireActual('@/core/shell/orgContextEnv'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(target, fn),
}));

const mockListDeclaredPackageNames = jest.fn();
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    detectAppLayout: jest.fn().mockResolvedValue('standalone'),
    listDeclaredPackageNames: (...a: unknown[]) => mockListDeclaredPackageNames(...a),
}));

import { removeAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentRunner';
import { deriveOwPackage } from '@/features/app-builder/services/owPackageName';
import { createDeps, createProject } from './appBuilderComponentRunner.testUtils';

const ID = 'app-builder-shell';

function integrationProject(): Project {
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
            [ID]: {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'app-builder-shell' },
            },
        },
    });
}

/** The execute mock routed by command string. */
function routeExecute(
    deps: ReturnType<typeof createDeps>,
    routes: Record<string, { code?: number; stdout?: string; reject?: boolean }>
): void {
    (deps.commandManager.execute as jest.Mock).mockImplementation(async (command: string) => {
        for (const [needle, result] of Object.entries(routes)) {
            if (command.includes(needle)) {
                if (result.reject) throw new Error(`boom: ${needle}`);
                return { code: result.code ?? 0, stdout: result.stdout ?? '', stderr: '' };
            }
        }
        return { code: 0, stdout: '', stderr: '' };
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
    mockListDeclaredPackageNames.mockResolvedValue([]);
});

describe('post-undeploy runtime verification', () => {
    it('deletes a leftover the undeploy left behind, and says so on the result', async () => {
        const owPackage = deriveOwPackage(ID);
        const deps = createDeps();
        routeExecute(deps, {
            'package list': {
                stdout: JSON.stringify([{ name: owPackage }, { name: 'unrelated' }]),
            },
        });

        const result = await removeAppBuilderComponent(integrationProject(), ID, deps);

        const deleteCall = (deps.commandManager.execute as jest.Mock).mock.calls.find(
            (c: unknown[]) => String(c[0]).includes('package delete')
        );
        expect(deleteCall?.[0]).toBe(`aio runtime package delete ${owPackage} --recursive`);
        expect(result.runtimeCleanup).toEqual({
            verified: true,
            deleted: [owPackage],
            failed: [],
        });
    });

    it('never touches a package the app did not name — attribution is exact', async () => {
        const deps = createDeps();
        routeExecute(deps, {
            'package list': { stdout: JSON.stringify([{ name: 'someone-elses-app' }]) },
        });

        const result = await removeAppBuilderComponent(integrationProject(), ID, deps);

        const deleteCall = (deps.commandManager.execute as jest.Mock).mock.calls.find(
            (c: unknown[]) => String(c[0]).includes('package delete')
        );
        expect(deleteCall).toBeUndefined();
        expect(result.runtimeCleanup).toEqual({ verified: true, deleted: [], failed: [] });
    });

    it('declared config packages join the attribution set (the extension-app lane)', async () => {
        mockListDeclaredPackageNames.mockResolvedValue(['kit-package-a', 'kit-package-b']);
        const deps = createDeps();
        routeExecute(deps, {
            'package list': { stdout: JSON.stringify([{ name: 'kit-package-b' }]) },
        });

        const result = await removeAppBuilderComponent(integrationProject(), ID, deps);

        expect(result.runtimeCleanup?.deleted).toEqual(['kit-package-b']);
    });

    it('an unlistable namespace answers verified:false with the reason — never silent', async () => {
        const deps = createDeps();
        routeExecute(deps, { 'package list': { reject: true } });

        const result = await removeAppBuilderComponent(integrationProject(), ID, deps);

        expect(result.success).toBe(true);
        expect(result.runtimeCleanup?.verified).toBe(false);
        expect(result.runtimeCleanup?.note).toContain('Could not list');
    });

    it('a failed leftover delete lands in failed[] — those packages are STILL RUNNING', async () => {
        const owPackage = deriveOwPackage(ID);
        const deps = createDeps();
        routeExecute(deps, {
            'package list': { stdout: JSON.stringify([{ name: owPackage }]) },
            'package delete': { reject: true },
        });

        const result = await removeAppBuilderComponent(integrationProject(), ID, deps);

        expect(result.runtimeCleanup).toEqual({
            verified: true,
            deleted: [],
            failed: [owPackage],
        });
    });

    it('a mesh removal runs NO runtime verification (its own status flow owns that)', async () => {
        const deps = createDeps();
        const project = createProject({
            componentInstances: {
                'eds-accs-mesh': {
                    id: 'eds-accs-mesh',
                    name: 'Mesh',
                    type: 'dependency',
                    subType: 'mesh',
                    status: 'ready',
                    path: '/proj/components/eds-accs-mesh',
                },
            },
            appBuilderComponents: {
                'eds-accs-mesh': {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-eds-mesh' },
                },
            },
        });

        const result = await removeAppBuilderComponent(project, 'eds-accs-mesh', deps);

        const listCall = (deps.commandManager.execute as jest.Mock).mock.calls.find(
            (c: unknown[]) => String(c[0]).includes('package list')
        );
        expect(listCall).toBeUndefined();
        expect(result.runtimeCleanup).toBeUndefined();
    });
});
