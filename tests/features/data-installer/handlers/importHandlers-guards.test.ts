/**
 * The guards that run before anything is sent.
 *
 * Two groups. The payload guards, reached by calling a handler with NO payload
 * at all — which is what an agent does and the modal never does, so it is the
 * shape no suite had exercised. And the access guard, when the Data Installer URL
 * is not configured. (`recordDatapackOnProject` moved to `importJobWatch.test.ts`
 * with the watch, 2026-10-08.)
 */

import {
    importHandlers,
    PAYLOAD,
    happyEngine,
    makeImportHarness,
    mockedBuildEngine,
    PAAS_PROJECT,
    resetImportHandlerMocks,
    setupSettings,
} from './importHandlers.testUtils';
import * as vscode from 'vscode';

beforeEach(() => {
    resetImportHandlerMocks();
});

describe('a call with no payload at all', () => {
    it.each([
        ['start-datapack-import'],
        ['validate-datapack-import'],
    ] as const)('%s refuses instead of throwing', async (handler) => {
        const { context } = makeImportHarness();
        const client = happyEngine();

        const result = await importHandlers[handler](context);

        expect(client.validateImport).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: false,
            error: 'A datapack name and version are required.',
        });
    });

    it('reset-datapack refuses at the confirm gate, before reading anything', async () => {
        const { context } = makeImportHarness();
        const client = happyEngine();

        const result = await importHandlers['reset-datapack'](context);

        expect(client.startDelete).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
    });

    it('refuses a payload holding a name but no version', async () => {
        const { context } = makeImportHarness();
        happyEngine();

        const result = await importHandlers['start-datapack-import'](context, {
            datapackName: 'bodea',
        });

        expect(result.error).toBe('A datapack name and version are required.');
    });

    it('refuses a payload with an empty dataTypes array', async () => {
        const { context } = makeImportHarness();
        happyEngine();

        const result = await importHandlers['start-datapack-import'](context, {
            ...PAYLOAD,
            dataTypes: [],
        });

        expect(result.error).toBe('Select at least one data type to import.');
    });

    it('refuses a website code with no store code', async () => {
        const { context } = makeImportHarness();
        happyEngine();

        const result = await importHandlers['start-datapack-import'](context, {
            ...PAYLOAD,
            websiteCode: 'only_the_website',
        });

        expect(result.error).toContain('both a target website and a store view');
    });

    it('refuses a store code with no website code', async () => {
        const { context } = makeImportHarness();
        happyEngine();

        const result = await importHandlers['start-datapack-import'](context, {
            ...PAYLOAD,
            storeCode: 'only_the_view',
        });

        expect(result.error).toContain('both a target website and a store view');
    });
});

describe('a confirmed reset that cannot be prepared', () => {
    it('returns the preparation refusal rather than deleting anything', async () => {
        // Past the confirm gate, into prepareImport, which refuses on no project.
        const { context } = makeImportHarness(null);
        const client = happyEngine();

        const result = await importHandlers['reset-datapack'](context, {
            ...PAYLOAD,
            confirm: true,
        });

        expect(client.startDelete).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: false,
            error: 'Open a project before importing a datapack.',
        });
    });
});

describe('no datapack store address is configured', () => {
    beforeEach(() => {
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string) => (key === 'apiBaseUrl' ? '' : true)),
        });
    });

    afterEach(() => {
        setupSettings();
    });

    it('refuses a start before resolving the project or its credentials', async () => {
        const { context } = makeImportHarness();
        const client = happyEngine();

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(client.validateImport).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
        // No Data Installer address sends the write to Demo Builder's datapack store, and this
        // harness answers '' for that address too: the refusal names the setting to fix.
        expect(result.error).toContain('demoBuilder.datapackStore.apiBaseUrl');
    });

    it('refuses a dry run the same way', async () => {
        const { context } = makeImportHarness();
        happyEngine();

        const result = await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(result.success).toBe(false);
    });
});

describe('how the engine is built', () => {
    it("is built for the open project, reading packs from the catalog, with a log line", async () => {
        const { context } = makeImportHarness();
        happyEngine();

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        const [access, log] = mockedBuildEngine.mock.calls[0];
        expect(access.project).toEqual(PAAS_PROJECT);
        expect(typeof access.catalog.getDataItem).toBe('function');
        expect(typeof access.libraryCatalog).toBe('function');
        // Every engine call gets a line in Debug Logs. The first live dry run
        // refused with an EMPTY channel, which is undebuggable for the user.
        // The WIRING is the claim here, not the wording.
        log('an engine line');
        expect(context.debugLogger.debug).toHaveBeenCalled();
    });
});
