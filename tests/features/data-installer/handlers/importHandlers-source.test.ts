/**
 * Which store a pack is installed from (DI-5): the Data Installer's catalog, unless the caller
 * names the library. The service installs only from its own catalog, so with it chosen (the
 * default) a library pack is refused with what to do instead, and nothing is started.
 */

import {
    happyClient,
    importHandlers,
    makeImportHarness,
    PAYLOAD,
    resetImportHandlerMocks,
} from './importHandlers.testUtils';

beforeEach(() => {
    resetImportHandlerMocks();
});

describe('the store a pack is installed from', () => {
    it('is the Data Installer when the caller names none', async () => {
        const { startImport } = happyClient();
        const { context } = makeImportHarness();

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(startImport).toHaveBeenCalledWith(expect.objectContaining({ source: 'installer' }));
    });

    it('refuses a library pack while the service is the engine, starting nothing', async () => {
        const { startImport } = happyClient();
        const { context } = makeImportHarness();

        const response = await importHandlers['start-datapack-import'](context, { ...PAYLOAD, source: 'library' });

        expect(response).toEqual({
            success: false,
            error:
                'The Data Installer service installs only packs in its own catalog. Copy this one to the Data Installer first, ' +
                'or set demoBuilder.dataInstaller.engine to demo-builder.',
        });
        expect(startImport).not.toHaveBeenCalled();
    });

    it('refuses a store that does not exist', async () => {
        const { startImport } = happyClient();
        const { context } = makeImportHarness();

        const response = await importHandlers['start-datapack-import'](context, { ...PAYLOAD, source: 'attic' });

        expect(response).toEqual({ success: false, error: 'There is no datapack store called attic: it is installer or library.' });
        expect(startImport).not.toHaveBeenCalled();
    });
});
