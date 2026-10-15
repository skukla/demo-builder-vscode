/**
 * One Commerce instance runs one ERP integration (AB-78), asked before a project
 * exists: the wizard's `check-erp-integration-holder`, and creation's own pre-flight
 * (`refuseSecondErpIntegration`), which also covers an agent's `create_project`.
 *
 * Unit tier: the other projects come from the state manager fake; the catalog is the
 * real one, so `erp-integration` is the ERP integration because `demo-erp` binds to it.
 */

import { handleCheckErpIntegrationHolder } from '@/features/project-creation/handlers/erpIntegrationHolderHandler';
import { refuseSecondErpIntegration } from '@/features/project-creation/handlers/executorPreflight';
import type { AppBuilderComponentState, Project } from '@/types/base';
import type { CheckErpIntegrationHolderRequest, ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const ENDPOINT = 'https://na1.api.commerce.adobe.com/tenant-x/graphql';
const ON_INSTANCE = { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: ENDPOINT } };
const MESSAGE = 'justrite already has an ERP integration on this Commerce instance. Add your ERP there instead.';

function deployed(kind: AppBuilderComponentState['kind']): AppBuilderComponentState {
    return { kind, name: kind, status: 'deployed', source: { owner: 'skukla', repo: 'x' } };
}

/** Justrite: the ERP integration, deployed, on the shared instance. */
function justrite(endpoint = ENDPOINT): Project {
    return createMockProject({
        name: 'justrite',
        path: '/projects/justrite',
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: endpoint } },
        appBuilderComponents: { 'erp-integration': deployed('integration'), 'demo-erp': deployed('system') },
    });
}

function contextWith(...projects: Project[]) {
    const stateManager = createMockStateManager({
        getAllProjects: jest.fn().mockResolvedValue(
            projects.map((p) => ({ name: p.name, path: p.path, lastModified: new Date() })),
        ),
        loadProjectFromPath: jest.fn(async (path: string) => projects.find((p) => p.path === path) ?? null),
    });
    return createMockHandlerContext({ stateManager });
}

const REQUEST: CheckErpIntegrationHolderRequest = { backend: 'adobe-commerce-accs', componentConfigs: ON_INSTANCE };

describe('check-erp-integration-holder', () => {
    it('names the project that runs an ERP integration on the instance', async () => {
        const result = await handleCheckErpIntegrationHolder(contextWith(justrite()), REQUEST);

        expect(result).toEqual({
            success: true,
            data: { holder: 'justrite', message: MESSAGE, note: 'justrite already has one on this Commerce instance' },
        });
    });

    it('answers nothing for a different instance — control', async () => {
        const other = justrite('https://na1.api.commerce.adobe.com/tenant-y/graphql');

        const result = await handleCheckErpIntegrationHolder(contextWith(other), REQUEST);

        expect(result).toEqual({ success: true, data: {} });
    });

    it('never names the project being edited', async () => {
        const result = await handleCheckErpIntegrationHolder(contextWith(justrite()), {
            ...REQUEST,
            editProjectPath: '/projects/justrite',
        });

        expect(result.data.holder).toBeUndefined();
    });

    it("asks about the open project when sent no backend (the dashboard's question)", async () => {
        const open = createMockProject({
            name: 'my-commerce-demo',
            path: '/projects/my-commerce-demo',
            componentSelections: { backend: 'adobe-commerce-accs' },
            componentConfigs: ON_INSTANCE,
        });
        const context = contextWith(justrite(), open);
        (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(open);

        const result = await handleCheckErpIntegrationHolder(context, {});

        expect(result.data.holder).toBe('justrite');
        // The open project is never its own holder.
        expect(context.stateManager.loadProjectFromPath).not.toHaveBeenCalledWith(
            '/projects/my-commerce-demo',
            undefined,
            expect.anything(),
        );
    });

    it('answers nothing, reading nothing, with no backend and no open project', async () => {
        const context = contextWith(justrite());
        (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(null);

        const result = await handleCheckErpIntegrationHolder(context, {});

        expect(result).toEqual({ success: true, data: {} });
        expect(context.stateManager.getAllProjects).not.toHaveBeenCalled();
    });
});

function creating(overrides: Partial<ProjectCreationConfig> = {}): ProjectCreationConfig {
    return {
        projectName: 'my-commerce-demo',
        components: { backend: 'adobe-commerce-accs' },
        componentConfigs: ON_INSTANCE,
        selectedAppBuilderComponents: ['erp-integration'],
        ...overrides,
    } as ProjectCreationConfig;
}

describe('refuseSecondErpIntegration', () => {
    it('refuses a project that brings an ERP integration to a held instance', async () => {
        await expect(refuseSecondErpIntegration(contextWith(justrite()), creating())).rejects.toThrow(MESSAGE);
    });

    it('lets a project with no ERP integration through, reading nothing', async () => {
        const context = contextWith(justrite());

        await expect(
            refuseSecondErpIntegration(context, creating({ selectedAppBuilderComponents: [] })),
        ).resolves.toBeUndefined();
        expect(context.stateManager.getAllProjects).not.toHaveBeenCalled();
    });

    it('lets a project on another instance through — control', async () => {
        const other = justrite('https://na1.api.commerce.adobe.com/tenant-y/graphql');

        await expect(refuseSecondErpIntegration(contextWith(other), creating())).resolves.toBeUndefined();
    });

    it('lets an Edit of the holder itself through', async () => {
        await expect(
            refuseSecondErpIntegration(contextWith(justrite()), creating({ editProjectPath: '/projects/justrite' })),
        ).resolves.toBeUndefined();
    });
});
