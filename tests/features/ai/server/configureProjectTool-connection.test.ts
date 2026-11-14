/**
 * configure_project and a datapack in the current Commerce instance (step-07 D6). A change that
 * points the project at another instance would leave the datapack where it is, where nothing could
 * then uninstall it. So the tool applies nothing until the agent answers, as the Configure screen's
 * confirm asks the SC.
 */

import { createMockProject } from '../../../helpers/projectFake';
import { getCurrentProject, saveProject, serve } from './configureProjectTool.testUtils';

const ACCS = 'adobe-commerce-accs';
const endpoint = (tenant: string) => `https://na1-sandbox.api.commerce.adobe.com/${tenant}/graphql`;
const MOVE = { env: { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint('TenantB0123456789ABCD') } } };

beforeEach(() => {
    jest.clearAllMocks();
    getCurrentProject.mockResolvedValue(
        createMockProject({
            datapack: { name: 'luma', version: 'main' },
            componentSelections: { backend: ACCS },
            componentConfigs: {
                [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint('TenantA0123456789ABCD') },
            },
        })
    );
});

describe('configure_project, changing the Commerce connection with a datapack installed', () => {
    it('applies nothing and asks for an answer, naming the datapack and reset_datapack', async () => {
        const out = await serve()(MOVE);

        expect(out.error).toMatch(/^luma is installed in the current Commerce instance/u);
        expect(out.error).toMatch(/reset_datapack/u);
        expect(out.error).toMatch(/installedDatapack:"keep"/u);
        expect(saveProject).not.toHaveBeenCalled();
    });

    it('changes it when the agent answers keep', async () => {
        const out = await serve()({ ...MOVE, installedDatapack: 'keep' });

        expect(out.applied.env).toEqual({ [ACCS]: ['ACCS_GRAPHQL_ENDPOINT'] });
        expect(saveProject).toHaveBeenCalledTimes(1);
    });

    it('CONTROL: asks nothing for a change that keeps the instance', async () => {
        const out = await serve()({ env: { [ACCS]: { ACCS_WEBSITE_CODE: 'other' } } });

        expect(out.error).toBeUndefined();
        expect(saveProject).toHaveBeenCalledTimes(1);
    });
});

// D6 review O1: the answer is not something to apply, so "Nothing to apply" neither counts nor lists it.
it("says nothing to apply for the answer alone, without listing it as a field to pass", async () => {
    const out = await serve()({ installedDatapack: 'keep' });

    expect(out.error).toBe('Nothing to apply. Pass one or more of: datapack, addons, blockLibraries, storeScope, env.');
    expect(saveProject).not.toHaveBeenCalled();
});
