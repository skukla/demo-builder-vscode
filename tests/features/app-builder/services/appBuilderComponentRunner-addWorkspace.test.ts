/**
 * A whole ADD, with the real workspace recording (AB-23).
 *
 * Every other runner suite stubs `createComponentWorkspace` to record NOTHING, so
 * they all exercise the fallback. That is how the first live add on 2026-09-21
 * shipped four defects past a green suite: the deploy's in-flight marker wiped
 * the workspace it had just recorded, so the deploy, its credentials and its
 * Commerce install all landed in the project's Stage; the integration found no
 * partner workspace to join and made a second one; both were named after display
 * names; and the pair's API subscribe went to the project's workspace because the
 * wiring guessed its target from how many components were in the list.
 *
 * So these run `ensureComponentWorkspace` for real, against a fake Adobe, and
 * assert the ARGUMENTS the deploy and the subscribe were handed.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';

jest.setTimeout(5000);

const mockDetectAppLayout = jest.fn();
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    listDeclaredTriggersAndRules: jest.fn().mockResolvedValue({ triggers: [], rules: [] }),
    detectAppLayout: (...args: unknown[]) => mockDetectAppLayout(...args),
}));

import { addAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentRunner';
import { ensureComponentWorkspace } from '@/features/app-builder/services/componentWorkspace';
import { MESH_ENTRY, createDeps, createProject } from './appBuilderComponentRunner.testUtils';
import { OPERATION_STAGES } from '@/core/utils/operationStages';

const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    providesEnvVars: ['ERP_BASE_URL'],
    requiredApis: ['AppBuilderDataServicesSDK'],
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};

const INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP integration',
    description: 'the integration',
    kind: 'integration',
    layout: 'extension',
    lifecycle: 'app-management',
    requiredApis: ['ACCS-REST-API'],
    envSchema: [{ name: 'ERP_BASE_URL', type: 'text', label: 'ERP address', providedBy: 'demo-erp' }],
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};

/** A fake Adobe that makes one workspace per call and remembers what it was asked. */
function fakeAdobe() {
    let made = 0;
    return {
        createWorkspace: jest.fn(async (title: string) => {
            made += 1;
            return { id: `ws-${made}`, name: `made-${made}`, title };
        }),
    };
}

/** Deps whose workspace step is the REAL one, saving through the deps' own save. */
function depsWithRealWorkspaces(adobe: ReturnType<typeof fakeAdobe>, catalog: AppBuilderComponentCatalogEntry[]) {
    const deps = createDeps({
        catalog,
        deployApp: jest.fn(async (componentPath: string) => ({
            success: true,
            data: {
                url: `https://ns/api/v1/web/${componentPath}`,
                deployedUrls: { [`web/${componentPath}`]: `https://ns/api/v1/web/${componentPath}` },
            },
        })),
    });
    deps.createComponentWorkspace.mockImplementation(
        (project: Project, entry: AppBuilderComponentCatalogEntry, onMaking?: () => void) =>
        ensureComponentWorkspace(project, entry, {
            onMaking,
            maker: adobe,
            saveProject: deps.saveProject,
            nameOf: (named: AppBuilderComponentCatalogEntry) => named.name,
            catalog,
        }),
    );
    return deps;
}

/** The workspace every wrapped Adobe call ran under. */
function wrappedWorkspaces(): Array<string | undefined> {
    return mockWithOrgContext.mock.calls.map(
        ([target]) => (target as { workspaceId?: string }).workspaceId,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
    mockDetectAppLayout.mockImplementation(async (path: string) =>
        path.includes('erp-integration') ? 'extension' : 'standalone',
    );
});

describe('one component', () => {
    const SOLO: AppBuilderComponentCatalogEntry = { ...SYSTEM, boundTo: undefined };

    it('deploys into the workspace it was given, not the project\'s', async () => {
        const project = createProject();
        const deps = depsWithRealWorkspaces(fakeAdobe(), [SOLO]);

        const result = await addAppBuilderComponent(project, SOLO, deps);

        expect(result).toEqual({ success: true });
        const workspaces = wrappedWorkspaces();
        expect(workspaces.length).toBeGreaterThan(0);
        expect(workspaces.every((id) => id === 'ws-1')).toBe(true);
    });

    it('still records its workspace once the add has finished', async () => {
        const project = createProject();
        const deps = depsWithRealWorkspaces(fakeAdobe(), [SOLO]);

        await addAppBuilderComponent(project, SOLO, deps);

        expect(project.appBuilderComponents?.['demo-erp']?.workspace).toEqual({
            id: 'ws-1',
            name: 'made-1',
            title: 'ERP',
        });
    });

    // Adobe will not rename a workspace, and the name reaches every action URL, so
    // it must come from something that never changes: the component id.
    it('asks Adobe to name the workspace after the component id', async () => {
        const adobe = fakeAdobe();
        const deps = depsWithRealWorkspaces(adobe, [SOLO]);

        await addAppBuilderComponent(createProject(), SOLO, deps);

        expect(adobe.createWorkspace).toHaveBeenCalledWith(
            'ERP',
            'Demo Builder: demo-erp',
            { orgId: 'org-123', projectId: 'proj-456' },
            'demo-erp',
        );
    });
});

describe('a bound pair', () => {
    it('makes ONE workspace, and both halves deploy into it', async () => {
        const adobe = fakeAdobe();
        const project = createProject();
        const deps = depsWithRealWorkspaces(adobe, [SYSTEM, INTEGRATION]);

        const result = await addAppBuilderComponent(project, INTEGRATION, deps);

        expect(result).toEqual({ success: true });
        expect(adobe.createWorkspace).toHaveBeenCalledTimes(1);
        // The ERP is added first and makes it, but the workspace is the integration's.
        expect(adobe.createWorkspace).toHaveBeenCalledWith(
            'ERP integration',
            'Demo Builder: erp-integration',
            { orgId: 'org-123', projectId: 'proj-456' },
            'erp-integration',
        );
        expect(project.appBuilderComponents?.['demo-erp']?.workspace?.id).toBe('ws-1');
        expect(project.appBuilderComponents?.['erp-integration']?.workspace?.id).toBe('ws-1');
        expect(wrappedWorkspaces().every((id) => id === 'ws-1')).toBe(true);
    });
});

// What the SC watches: a stage for each thing that takes time, said only when it
// happens. On 2026-09-21 the workspace was made under "Preparing Node", the code
// was fetched under "Adding Adobe services", and Node said "Installing … (one-time
// install)" for both halves though it was already there.
describe('what an add says while it runs', () => {
    it('names the workspace and the code stages, and makes the workspace once for a pair', async () => {
        const project = createProject();
        const deps = depsWithRealWorkspaces(fakeAdobe(), [SYSTEM, INTEGRATION]);
        const stages: string[] = [];
        deps.onProgress = (message: string) => stages.push(message);

        await addAppBuilderComponent(project, INTEGRATION, deps);

        expect(stages.filter((s) => s === OPERATION_STAGES.makingWorkspace.label)).toHaveLength(1);
        expect(stages.filter((s) => s === OPERATION_STAGES.gettingCode.label)).toHaveLength(2);
        expect(stages.indexOf(OPERATION_STAGES.makingWorkspace.label)).toBeLessThan(
            stages.indexOf(OPERATION_STAGES.subscribingApis.label),
        );
    });
});

describe("the subscribe is for the component being added", () => {
    // Bodea has a mesh, so the old list always held two or more entries and the
    // wiring, guessing from the count, sent every add's APIs to Stage.
    it("names the component, and sends only its own group's APIs — not the mesh's", async () => {
        const project = createProject({
            appBuilderComponents: {
                'commerce-mesh': {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-paas-mesh' },
                },
            },
        });
        const deps = depsWithRealWorkspaces(fakeAdobe(), [MESH_ENTRY, SYSTEM, INTEGRATION]);

        await addAppBuilderComponent(project, INTEGRATION, deps);

        const calls = (deps.subscribeRequiredApis as jest.Mock).mock.calls.map(([entries, , , options]) => ({
            ids: (entries as AppBuilderComponentCatalogEntry[]).map((e) => e.id).sort(),
            options,
        }));
        expect(calls).toEqual([
            { ids: ['demo-erp'], options: { forComponent: 'demo-erp', adding: true } },
            {
                ids: ['demo-erp', 'erp-integration'],
                options: { forComponent: 'erp-integration', adding: true },
            },
        ]);
    });
});
