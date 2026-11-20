/**
 * create_project's datapack: the agent chooses the datapack a new project installs, as
 * the wizard's Datapacks step does (owner, 2026-11-20: an agent can do whatever an SC
 * can). Before it, an agent could only install one after creation. Mocks are owned by
 * `createProjectTool.testUtils.ts`.
 */

import {
    EDS,
    capturedWizardState,
    defaultStorefrontSetup,
    storefrontSetup,
    toolServer,
} from './createProjectTool.testUtils';

describe('create_project — datapack', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        defaultStorefrontSetup();
    });

    it('hands creation the datapack the agent chose, with its store', async () => {
        await toolServer().call({
            ...EDS,
            datapack: { name: 'citisignal', version: 'main', store: 'library' },
        });

        expect(capturedWizardState().datapack).toEqual({ name: 'citisignal', version: 'main', store: 'library' });
    });

    it('leaves the store out when the agent names none: the Data Installer, as before', async () => {
        await toolServer().call({ ...EDS, datapack: { name: 'citisignal', version: 'main' } });

        expect(capturedWizardState().datapack).toEqual({ name: 'citisignal', version: 'main' });
    });

    it('chooses no datapack when none is named', async () => {
        await toolServer().call(EDS);

        expect(capturedWizardState().datapack).toBeUndefined();
    });

    it('refuses a store that is neither library nor installer, before anything is built', async () => {
        const res = await toolServer().call({
            ...EDS,
            datapack: { name: 'citisignal', version: 'main', store: 'shop' },
        });

        expect(res.error).toContain('library or installer');
        expect(storefrontSetup).not.toHaveBeenCalled();
    });
});
