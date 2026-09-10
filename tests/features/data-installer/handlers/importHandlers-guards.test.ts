/**
 * The guards that run before anything is sent, and the bookkeeping that runs after.
 *
 * Three groups. The payload guards, reached by calling a handler with NO payload
 * at all — which is what an agent does and the modal never does, so it is the
 * shape no suite had exercised. The access guard, when the Data Installer URL is
 * not configured. And `recordDatapackOnProject`, which must never turn a started
 * import into a reported failure however badly its own write goes.
 */

import {
    importHandlers,
    PAYLOAD,
    happyClient,
    makeImportHarness,
    MockedWriteClient,
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
        const client = happyClient();

        const result = await importHandlers[handler](context);

        expect(client.validateImport).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: false,
            error: 'A datapack name and version are required.',
        });
    });

    it('reset-datapack refuses at the confirm gate, before reading anything', async () => {
        const { context } = makeImportHarness();
        const client = happyClient();

        const result = await importHandlers['reset-datapack'](context);

        expect(client.startDelete).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
    });

    it('refuses a payload holding a name but no version', async () => {
        const { context } = makeImportHarness();
        happyClient();

        const result = await importHandlers['start-datapack-import'](context, {
            datapackName: 'bodea',
        });

        expect(result.error).toBe('A datapack name and version are required.');
    });

    it('refuses a payload with an empty dataTypes array', async () => {
        const { context } = makeImportHarness();
        happyClient();

        const result = await importHandlers['start-datapack-import'](context, {
            ...PAYLOAD,
            dataTypes: [],
        });

        expect(result.error).toBe('Select at least one data type to import.');
    });

    it('refuses a website code with no store code', async () => {
        const { context } = makeImportHarness();
        happyClient();

        const result = await importHandlers['start-datapack-import'](context, {
            ...PAYLOAD,
            websiteCode: 'only_the_website',
        });

        expect(result.error).toContain('both a target website and a store view');
    });

    it('refuses a store code with no website code', async () => {
        const { context } = makeImportHarness();
        happyClient();

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
        const client = happyClient();

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

describe('the Data Installer URL is not configured', () => {
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
        const client = happyClient();

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(client.validateImport).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
        expect(result.error).toContain('Data Installer API URL');
    });

    it('refuses a dry run the same way', async () => {
        const { context } = makeImportHarness();
        happyClient();

        const result = await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(result.success).toBe(false);
    });
});

describe('how the write client is built', () => {
    it('is constructed with the resolved base URL, a token source and a log line', async () => {
        const { context } = makeImportHarness();
        happyClient();

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        const options = MockedWriteClient.mock.calls[0][0];
        expect(options.baseUrl).toBe(
            'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api',
        );
        expect(typeof options.getToken).toBe('function');
        // Every service call gets a line in Debug Logs. The first live dry run
        // refused with an EMPTY channel, which is undebuggable for the user.
        // The WIRING is the claim here, not the wording.
        options.log?.('a service line');
        expect(context.debugLogger.debug).toHaveBeenCalled();
    });
});

describe('recording the datapack on the project', () => {
    it('writes the pack the import was accepted for', async () => {
        const { context } = makeImportHarness();
        happyClient();

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(context.stateManager.saveProject).toHaveBeenCalledWith(
            expect.objectContaining({ datapack: { name: 'bodea', version: 'main' } }),
        );
    });

    it('CLEARS it on a reset, so removal is not offered for data that is gone', async () => {
        const { context } = makeImportHarness();
        happyClient();

        await importHandlers['reset-datapack'](context, { ...PAYLOAD, confirm: true });

        expect(context.stateManager.saveProject).toHaveBeenCalledWith(
            expect.objectContaining({ datapack: undefined }),
        );
    });

    it('still reports the import as started when the project write throws', async () => {
        // The service has already accepted the job. Failing the handler over
        // bookkeeping would report a started import as a failed one.
        const { context } = makeImportHarness();
        happyClient();
        (context.stateManager.saveProject as jest.Mock).mockRejectedValue(
            new Error('manifest locked'),
        );

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(result).toEqual({ success: true, data: { activationId: 'act-1' } });
    });

    it('records nothing, and still succeeds, when the project vanishes mid-flight', async () => {
        const { context } = makeImportHarness();
        happyClient();
        // Present for prepareImport, gone by the time the record is written.
        (context.stateManager.getCurrentProject as jest.Mock)
            .mockResolvedValueOnce({
                name: 'demo-a',
                componentSelections: { backend: 'adobe-commerce-paas' },
                componentConfigs: {
                    'adobe-commerce-paas': {
                        ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                        ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
                    },
                },
            })
            .mockResolvedValue(null);

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
    });
});
