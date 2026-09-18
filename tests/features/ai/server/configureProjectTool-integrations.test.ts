/**
 * configure_project — an integration's settings are not project settings (AB-21).
 *
 * They live on the integration's tile and reach the app only through a redeploy,
 * which this tool does not do; set_integration_settings does. The mesh is not
 * an integration here: its fields are project configuration.
 */

import { registerConfigureProjectTool } from '@/features/ai/server/configureProjectTool';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const getCurrentProject = jest.fn();
const saveProject = jest.fn();
const stateManager = createMockStateManager({ getCurrentProject, saveProject });

function serve() {
    const tools = new Map<string, (a: unknown) => Promise<{ content: Array<{ text: string }> }>>();
    registerConfigureProjectTool(
        { registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h) },
        stateManager,
    );
    return async (args: unknown) =>
        JSON.parse((await tools.get('configure_project')!(args)).content[0].text);
}

beforeEach(() => {
    jest.clearAllMocks();
    getCurrentProject.mockResolvedValue(createMockProject({
        componentSelections: { frontend: 'eds-storefront', backend: 'adobe-commerce-accs' },
        appBuilderComponents: {
            'erp-integration': { kind: 'integration', status: 'deployed', source: { owner: 'o', repo: 'r' } },
            'eds-accs-mesh': { kind: 'mesh', status: 'deployed', source: { owner: 'o', repo: 'm' } },
        },
        componentConfigs: {},
    }));
});

describe('configure_project — integrations', () => {
    it("refuses an integration's settings, names the tool that sets them, and saves nothing", async () => {
        const out = await serve()({
            addons: ['adobe-commerce-aco'],
            env: { 'erp-integration': { ERP_DISPLAY_NAME: 'Nordwind' } },
        });

        expect(out.error).toMatch(/^erp-integration is an integration\./);
        expect(out.error).toMatch(/set_integration_settings/);
        expect(saveProject).not.toHaveBeenCalled();
    });

    it("still sets the mesh's fields, which are project configuration", async () => {
        const out = await serve()({ env: { 'eds-accs-mesh': { MESH_X: 'y' } } });

        expect(out.applied.env).toEqual({ 'eds-accs-mesh': ['MESH_X'] });
        expect(saveProject).toHaveBeenCalledTimes(1);
    });
});
