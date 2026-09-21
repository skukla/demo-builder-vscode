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

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import { TEST_RUNTIME_ENV } from './appBuilderComponentRunner.runtimeMock';
import type { Project } from '@/types/base';

jest.setTimeout(5000);

const mockListDeclaredPackageNames = jest.fn();
const mockListDeclaredTriggersAndRules = jest.fn();
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    detectAppLayout: jest.fn().mockResolvedValue('standalone'),
    listDeclaredPackageNames: (...a: unknown[]) => mockListDeclaredPackageNames(...a),
    listDeclaredTriggersAndRules: (...a: unknown[]) => mockListDeclaredTriggersAndRules(...a),
}));

import { removeAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentRunner';
import { deriveOwPackage } from '@/features/app-builder/services/owPackageName';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
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
    mockListDeclaredTriggersAndRules.mockResolvedValue({ triggers: [], rules: [] });
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
        // Nothing was found and nothing was deleted — the two lists are EMPTY,
        // not merely present. A summary that named packages it never touched
        // would read as a cleanup that happened.
        expect(result.runtimeCleanup).toMatchObject({
            verified: false,
            deleted: [],
            failed: [],
        });
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

    // The declared names come from config FILES, which nothing validates. A name
    // outside the Adobe id charset is never deleted — and, just as important, is
    // never interpolated into a shell line. Both of these match a LOOSER pattern
    // (one at the start, one at the end), so an anchor lost from either end of
    // the charset check turns them into delete candidates.
    it('a declared name outside the Adobe id charset is never a delete candidate', async () => {
        mockListDeclaredPackageNames.mockResolvedValue(['bad name', 'name bad']);
        const deps = createDeps();
        routeExecute(deps, {
            'package list': {
                stdout: JSON.stringify([{ name: 'bad name' }, { name: 'name bad' }]),
            },
        });

        const result = await removeAppBuilderComponent(integrationProject(), ID, deps);

        const deleteCall = (deps.commandManager.execute as jest.Mock).mock.calls.find(
            (c: unknown[]) => String(c[0]).includes('package delete')
        );
        expect(deleteCall).toBeUndefined();
        expect(result.runtimeCleanup).toEqual({ verified: true, deleted: [], failed: [] });
    });

    it('lists the namespace through the executor with the shared runtime options', async () => {
        const deps = createDeps();
        routeExecute(deps, { 'package list': { stdout: '[]' } });

        await removeAppBuilderComponent(integrationProject(), ID, deps);

        expect(deps.commandManager.execute).toHaveBeenCalledWith(
            'aio runtime package list --json',
            {
                useNodeVersion: 'auto',
                enhancePath: true,
                shell: true,
                timeout: TIMEOUTS.LONG,
                env: TEST_RUNTIME_ENV,
            }
        );
    });

    it('deletes a leftover through the executor with the same options', async () => {
        const owPackage = deriveOwPackage(ID);
        const deps = createDeps();
        routeExecute(deps, {
            'package list': { stdout: JSON.stringify([{ name: owPackage }]) },
        });

        await removeAppBuilderComponent(integrationProject(), ID, deps);

        expect(deps.commandManager.execute).toHaveBeenCalledWith(
            `aio runtime package delete ${owPackage} --recursive`,
            {
                useNodeVersion: 'auto',
                enhancePath: true,
                shell: true,
                timeout: TIMEOUTS.LONG,
                env: TEST_RUNTIME_ENV,
            }
        );
    });

    // 2026-09-21: the list ran without the namespace key, failed, printed nothing,
    // and the empty output was parsed as "nothing deployed" — so fifteen running
    // packages were reported clean. A list that fails is NOT a verification.
    it('a list that fails is "not verified", never an empty namespace', async () => {
        const owPackage = deriveOwPackage(ID);
        const deps = createDeps();
        routeExecute(deps, { 'package list': { code: 2, stdout: '' } });

        const result = await removeAppBuilderComponent(integrationProject(), ID, deps);

        expect(result.runtimeCleanup).toMatchObject({ verified: false, deleted: [], failed: [] });
        expect(result.runtimeCleanup?.note).toMatch(/Could not list the Runtime namespace/);
        const deleteCall = (deps.commandManager.execute as jest.Mock).mock.calls.find(
            (c: unknown[]) => String(c[0]).includes(`package delete ${owPackage}`)
        );
        expect(deleteCall).toBeUndefined();
    });

    it('a refused undeploy still has its leftovers deleted', async () => {
        const owPackage = deriveOwPackage(ID);
        const deps = createDeps();
        routeExecute(deps, {
            'app undeploy': { code: 2 },
            'package list': { stdout: JSON.stringify([{ name: owPackage }]) },
        });

        const result = await removeAppBuilderComponent(integrationProject(), ID, deps);

        expect(result.runtimeCleanup).toEqual({ verified: true, deleted: [owPackage], failed: [] });
    });

    // 2026-09-21: the ERP's one-minute timer and its rule outlived a failed undeploy,
    // firing at an action that was gone. Deleting the package does not delete them.
    it("deletes the app's own leftover rule and timer — rules first, then timers, then packages", async () => {
        const owPackage = deriveOwPackage(ID);
        mockListDeclaredTriggersAndRules.mockResolvedValue({
            triggers: ['erp-refresh-timer'],
            rules: ['erp-refresh-on-timer'],
        });
        const deps = createDeps();
        routeExecute(deps, {
            'rule list': { stdout: JSON.stringify([{ name: 'erp-refresh-on-timer' }, { name: 'not-ours' }]) },
            'trigger list': { stdout: JSON.stringify([{ name: 'erp-refresh-timer' }]) },
            'package list': { stdout: JSON.stringify([{ name: owPackage }]) },
        });

        const result = await removeAppBuilderComponent(integrationProject(), ID, deps);

        const deletes = (deps.commandManager.execute as jest.Mock).mock.calls
            .map((c: unknown[]) => String(c[0]))
            .filter((command: string) => command.includes(' delete '));
        expect(deletes).toEqual([
            'aio runtime rule delete erp-refresh-on-timer',
            'aio runtime trigger delete erp-refresh-timer',
            `aio runtime package delete ${owPackage} --recursive`,
        ]);
        expect(result.runtimeCleanup).toEqual({
            verified: true,
            deleted: ['rule erp-refresh-on-timer', 'trigger erp-refresh-timer', owPackage],
            failed: [],
        });
    });

    it('a rule list that fails is "not verified" too', async () => {
        mockListDeclaredTriggersAndRules.mockResolvedValue({ triggers: [], rules: ['erp-refresh-on-timer'] });
        const deps = createDeps();
        routeExecute(deps, { 'rule list': { code: 2 }, 'package list': { stdout: '[]' } });

        const result = await removeAppBuilderComponent(integrationProject(), ID, deps);

        expect(result.runtimeCleanup).toMatchObject({ verified: false, deleted: [], failed: [] });
    });

    // A removal ran as one line, "Taking the app down", for 3m 39s (2026-09-21).
    it('says what each phase of the removal is doing, in order', async () => {
        const deps = createDeps();
        routeExecute(deps, { 'package list': { stdout: '[]' } });
        const stages: Array<[string, string | undefined]> = [];
        deps.onProgress = (message: string, subMessage?: string) => stages.push([message, subMessage]);

        await removeAppBuilderComponent(integrationProject(), ID, deps);

        expect(stages).toEqual([
            [OPERATION_STAGES.removing.label, 'Undeploying Custom Integration'],
            [OPERATION_STAGES.checkingLeftovers.label, undefined],
        ]);
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
