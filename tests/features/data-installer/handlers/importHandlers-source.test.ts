/**
 * Which store a pack is installed from (DI-5): the Data Installer's catalog, unless the caller
 * names the library. Demo Builder installs from either; the service's engine, which installed
 * only from its own catalog and refused a library pack, was deleted on 2026-11-06 (DI-12).
 */

import {
    happyEngine,
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
        const { startImport } = happyEngine();
        const { context } = makeImportHarness();

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(startImport).toHaveBeenCalledWith(expect.objectContaining({ source: 'installer' }));
    });

    it('is the library when the caller names it, installed where it is', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness();

        const response = await importHandlers['start-datapack-import'](context, { ...PAYLOAD, source: 'library' });

        expect(response.success).toBe(true);
        expect(startImport).toHaveBeenCalledWith(expect.objectContaining({ source: 'library' }));
    });

    it('refuses a store that does not exist', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness();

        const response = await importHandlers['start-datapack-import'](context, { ...PAYLOAD, source: 'attic' });

        expect(response).toEqual({ success: false, error: 'There is no datapack store called attic: it is installer or library.' });
        expect(startImport).not.toHaveBeenCalled();
    });
});
