/**
 * Before an add deploys, the pair another local project put into this Adobe project
 * under the same ERP name is removed from THAT project, through the one removal path,
 * and the add stops when that removal does not finish (owner, 2026-10-08).
 *
 * Unit tier: the other projects come from the state manager fake, the removal is the
 * mocked runner, and what is asserted is the ARGUMENTS each collaborator was handed.
 */

const mockRemove = jest.fn();
jest.mock('@/features/app-builder/services/appBuilderRemoveRun', () => ({
    removeAppBuilderComponent: (...a: unknown[]) => mockRemove(...a),
}));
const mockBuildDefaultRunnerDeps = jest.fn((..._a: unknown[]) => ({ _deps: true }));
const mockBuildRunnerDepsContext = jest.fn(async () => ({ _ctx: true, saveProject: jest.fn() }));
jest.mock('@/features/project-creation/services/appBuilderComponentRunnerDeps', () => ({
    buildDefaultRunnerDeps: (...a: unknown[]) => mockBuildDefaultRunnerDeps(...(a as [])),
    buildRunnerDepsContext: (...a: unknown[]) => mockBuildRunnerDepsContext(...(a as [])),
}));
jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentCatalog: () => CATALOG,
}));

import { replaceDeployedElsewhere } from '@/features/dashboard/handlers/replaceDeployedElsewhere';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP Integration',
    description: 'the integration',
    kind: 'integration',
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};
const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    nameFromEnvVar: 'ERP_DISPLAY_NAME',
    envSchema: [{ name: 'ERP_DISPLAY_NAME', label: 'ERP name', type: 'text', default: 'Acme ERP' }],
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};
const CATALOG = [INTEGRATION, SYSTEM];
const SERVICES = { authManager: { _auth: true }, commandManager: { _exec: true } } as unknown as Parameters<typeof replaceDeployedElsewhere>[3];

function state(kind: AppBuilderComponentState['kind'], name: string, extra: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return { kind, name, status: 'deployed', source: { owner: 'skukla', repo: 'x' }, ...extra };
}

function pairProject(name: string, erpName: string, adobeProjectId = 'adobe-1'): Project {
    return createMockProject({
        name,
        path: `/projects/${name}`,
        adobe: { projectId: adobeProjectId, organization: 'org', projectTitle: 'KuklaJustrite' },
        appBuilderComponents: {
            'erp-integration': state('integration', 'ERP Integration', { systems: ['demo-erp'] }),
            'demo-erp': state('system', erpName, { usedBy: 'erp-integration' }),
        },
    });
}

/** The project adding the pair, its ERP to be named `erpName`. */
function adding(erpName = 'Justrite ERP'): Project {
    return createMockProject({
        name: 'justrite-copy',
        path: '/projects/justrite-copy',
        adobe: { projectId: 'adobe-1', organization: 'org', projectTitle: 'KuklaJustrite' },
        componentConfigs: { 'demo-erp': { ERP_DISPLAY_NAME: erpName } },
    });
}

/** A context whose state manager lists and loads these projects. */
function contextWith(...others: Project[]) {
    const stateManager = createMockStateManager({
        getAllProjects: jest.fn().mockResolvedValue(
            [adding(), ...others].map((p) => ({ name: p.name, path: p.path, lastModified: new Date() })),
        ),
        loadProjectFromPath: jest.fn(async (path: string) => others.find((p) => p.path === path) ?? null),
        saveProjectConfigOnly: jest.fn().mockResolvedValue(undefined),
    });
    return { context: createMockHandlerContext({ stateManager }), stateManager };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRemove.mockResolvedValue({ success: true });
});

describe('replaceDeployedElsewhere', () => {
    it('removes the other project\'s integration, with that project\'s deps, before answering clear', async () => {
        const other = pairProject('justrite', 'Justrite ERP');
        const { context, stateManager } = contextWith(other);
        const report = jest.fn();

        const result = await replaceDeployedElsewhere(context, adding(), INTEGRATION, SERVICES, report);

        expect(result).toBeUndefined();
        // Loaded without moving the current-project pointer; itself never loaded.
        expect(stateManager.loadProjectFromPath).toHaveBeenCalledTimes(1);
        expect(stateManager.loadProjectFromPath).toHaveBeenCalledWith('/projects/justrite', undefined, { persistAfterLoad: false });
        // The OTHER project's deps, from the services the handler resolved.
        expect(mockBuildRunnerDepsContext).toHaveBeenCalledWith(context, other, SERVICES);
        expect(mockBuildDefaultRunnerDeps).toHaveBeenCalledWith(
            expect.objectContaining({ _ctx: true, saveProject: expect.any(Function) }),
            report,
        );
        // Not forced: a removal that stops, stops the add.
        expect(mockRemove).toHaveBeenCalledWith(other, 'erp-integration', { _deps: true });
        expect(report).toHaveBeenCalledWith('Taking the app down', "Replacing justrite's Justrite ERP in KuklaJustrite");
    });

    it("saves the other project's record in place, never as the current project", async () => {
        const other = pairProject('justrite', 'Justrite ERP');
        const { context, stateManager } = contextWith(other);

        await replaceDeployedElsewhere(context, adding(), INTEGRATION, SERVICES, jest.fn());

        const ctx = mockBuildDefaultRunnerDeps.mock.calls[0][0] as { saveProject: (p: Project) => Promise<void> };
        await ctx.saveProject(other);
        expect(stateManager.saveProjectConfigOnly).toHaveBeenCalledWith(other);
        expect(stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('stops the add, with the reason, when the other project\'s removal did not finish', async () => {
        const other = pairProject('justrite', 'Justrite ERP');
        const { context } = contextWith(other);
        mockRemove.mockResolvedValue({ success: false, error: 'Nothing was removed. Commerce still has it.' });

        const result = await replaceDeployedElsewhere(context, adding(), INTEGRATION, SERVICES, jest.fn());

        expect(result).toEqual({
            error:
                "justrite's Justrite ERP is still deployed in KuklaJustrite, so ERP Integration was not added. " +
                'Nothing was removed. Commerce still has it.',
        });
    });

    it('removes nothing when no other project holds an ERP of this name', async () => {
        const { context } = contextWith(pairProject('acme', 'Acme ERP'));

        const result = await replaceDeployedElsewhere(context, adding(), INTEGRATION, SERVICES, jest.fn());

        expect(result).toBeUndefined();
        expect(mockRemove).not.toHaveBeenCalled();
    });

    it('leaves a same-named ERP in a different Adobe project alone', async () => {
        const { context } = contextWith(pairProject('justrite', 'Justrite ERP', 'adobe-2'));

        await replaceDeployedElsewhere(context, adding(), INTEGRATION, SERVICES, jest.fn());

        expect(mockRemove).not.toHaveBeenCalled();
    });

    it('replaces nothing when this project has no Adobe project', async () => {
        const { context } = contextWith(pairProject('justrite', 'Justrite ERP'));

        const result = await replaceDeployedElsewhere(context, createMockProject({ adobe: undefined }), INTEGRATION, SERVICES, jest.fn());

        expect(result).toBeUndefined();
        expect(mockRemove).not.toHaveBeenCalled();
    });
});

describe('replaceDeployedElsewhere — one ERP integration per Commerce instance (AB-78)', () => {
    const ENDPOINT = 'https://na1.api.commerce.adobe.com/tenant-x/graphql';
    const ON_INSTANCE = {
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: ENDPOINT } },
    };

    /** `pairProject`, on the shared Commerce instance. */
    function onInstance(name: string, erpName: string, adobeProjectId?: string): Project {
        return { ...pairProject(name, erpName, adobeProjectId), ...ON_INSTANCE };
    }

    /** `adding()` (the copy), on the shared instance, its ERP name kept. */
    function copyOnInstance(): Project {
        const copy = adding();
        return {
            ...copy,
            componentSelections: ON_INSTANCE.componentSelections,
            componentConfigs: { ...copy.componentConfigs, ...ON_INSTANCE.componentConfigs },
        };
    }

    /** The project adding the pair, on the shared instance, in its own Adobe project. */
    function scratch(): Project {
        return createMockProject({
            name: 'my-commerce-demo',
            path: '/projects/my-commerce-demo',
            adobe: { projectId: 'adobe-new', organization: 'org' },
            ...ON_INSTANCE,
        });
    }

    it('refuses, naming the project that holds the instance, and removes nothing', async () => {
        const { context } = contextWith(onInstance('justrite', 'Justrite ERP', 'adobe-1'));

        const result = await replaceDeployedElsewhere(context, scratch(), INTEGRATION, SERVICES, jest.fn());

        expect(result).toEqual({
            error: 'justrite already has an ERP integration on this Commerce instance. Add your ERP there instead.',
            blocked: true,
        });
        expect(mockRemove).not.toHaveBeenCalled();
    });

    it('refuses even with no Adobe project chosen yet', async () => {
        const { context } = contextWith(onInstance('justrite', 'Justrite ERP'));

        const result = await replaceDeployedElsewhere(
            context,
            { ...scratch(), adobe: undefined },
            INTEGRATION,
            SERVICES,
            jest.fn(),
        );

        expect(result).toMatchObject({ blocked: true });
    });

    it('still replaces a copy, which then no longer holds the instance', async () => {
        const original = onInstance('justrite', 'Justrite ERP');
        const { context } = contextWith(original);

        const result = await replaceDeployedElsewhere(context, copyOnInstance(), INTEGRATION, SERVICES, jest.fn());

        expect(result).toBeUndefined();
        expect(mockRemove).toHaveBeenCalledWith(original, 'erp-integration', { _deps: true });
    });

    it('refuses before replacing when a third project also runs one there', async () => {
        const { context } = contextWith(onInstance('justrite', 'Justrite ERP'), onInstance('acme', 'Acme ERP', 'adobe-2'));

        const result = await replaceDeployedElsewhere(context, copyOnInstance(), INTEGRATION, SERVICES, jest.fn());

        expect(result).toMatchObject({ blocked: true });
        expect(mockRemove).not.toHaveBeenCalled();
    });
});
