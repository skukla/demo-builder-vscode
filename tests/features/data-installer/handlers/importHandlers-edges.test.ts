/**
 * The import spine's edges — the refusals, the fallbacks, and the two shapes a
 * job record takes when it ends.
 *
 * The sibling suites cover the happy paths of each handler. What was left were
 * the branches only an unusual project or an unusual service answer reaches: no
 * project open, a reset asked for without confirm, a scope discovery that cannot
 * build its parameters, a watch result that carries a reason or a timing, and the
 * project-scope fallback that stops an agent importing into `base`.
 */

import {
    importHandlers,
    PAYLOAD,
    happyClient,
    makeImportHarness,
    mockedWatch,
    resetImportHandlerMocks,
    stubWriteClient,
} from './importHandlers.testUtils';
import type { Project } from '@/types/base';
import * as vscode from 'vscode';

const PAAS_WITH_SCOPE: Partial<Project> = {
    name: 'demo-a',
    componentSelections: { backend: 'adobe-commerce-paas' },
    componentConfigs: {
        'adobe-commerce-paas': {
            ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
            ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
            ADOBE_COMMERCE_WEBSITE_CODE: 'project_site',
            ADOBE_COMMERCE_STORE_VIEW_CODE: 'project_view',
        },
    },
};

beforeEach(() => {
    resetImportHandlerMocks();
});

/** The request body the write client was constructed to send. */
function sentRequest(startImport: jest.Mock) {
    return startImport.mock.calls[0][0];
}

describe('no project open', () => {
    it('refuses a start rather than writing into an unnamed instance', async () => {
        const { context } = makeImportHarness(null);
        const client = happyClient();

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(client.startImport).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: false,
            error: 'Open a project before importing a datapack.',
        });
    });

    it('refuses a dry run for the same reason', async () => {
        const { context } = makeImportHarness(null);
        const client = happyClient();

        const result = await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(client.validateImport).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
    });

    it('answers the import-target read with the datapack alone', async () => {
        const { context } = makeImportHarness(null);

        const result = await importHandlers['get-datapack-import-target'](context);

        // Nothing to prefill, but the read still succeeds — the modal opens.
        expect(result.success).toBe(true);
    });

    it('answers the scope list with no websites rather than an error', async () => {
        const { context } = makeImportHarness(null);

        const result = await importHandlers['list-datapack-import-scopes'](context);

        // An empty list is a state the picker can render; a failure is not.
        expect(result).toEqual({ success: true, data: { websites: [] } });
    });

    it('refuses provisioning, naming the missing project', async () => {
        const { context } = makeImportHarness(null);

        const result = await importHandlers['provision-accs-credentials'](context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Open a project first.');
    });
});

describe('reset-datapack without confirmation', () => {
    it('refuses before resolving anything at all', async () => {
        const { context } = makeImportHarness();
        const client = happyClient();

        const result = await importHandlers['reset-datapack'](context, PAYLOAD);

        expect(client.validateImport).not.toHaveBeenCalled();
        expect(client.startDelete).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
    });

    it('refuses a confirm that is merely truthy, not true', async () => {
        // The gate exists so a caller cannot opt in by accident; 'yes' from a
        // loosely-typed agent payload is exactly that accident.
        const { context } = makeImportHarness();
        const client = happyClient();

        const result = await importHandlers['reset-datapack'](context, {
            ...PAYLOAD,
            confirm: 'yes' as unknown as boolean,
        });

        expect(client.startDelete).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
    });
});

describe("the project's scope as a fallback target", () => {
    it("uses the project's scope when the caller names none", async () => {
        // The MCP rows leave both codes optional. Without this an agent that
        // skipped the scope list would import — and RESET — against `base`.
        const { context } = makeImportHarness(PAAS_WITH_SCOPE);
        const client = happyClient();

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(sentRequest(client.startImport as jest.Mock).target).toEqual({
            websiteCode: 'project_site',
            storeCode: 'project_view',
        });
    });

    it("lets a caller's explicit scope win over the project's", async () => {
        const { context } = makeImportHarness(PAAS_WITH_SCOPE);
        const client = happyClient();

        await importHandlers['start-datapack-import'](context, {
            ...PAYLOAD,
            websiteCode: 'chosen_site',
            storeCode: 'chosen_view',
        });

        expect(sentRequest(client.startImport as jest.Mock).target).toEqual({
            websiteCode: 'chosen_site',
            storeCode: 'chosen_view',
        });
    });
});

describe('what the finished watch records', () => {
    it('keeps the reason the runner gave for a non-success outcome', async () => {
        const { context, stores } = makeImportHarness();
        happyClient();
        mockedWatch.mockResolvedValue({
            outcome: 'error',
            perType: {},
            reason: 'the worker rejected two types',
        });

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await new Promise((resolve) => setImmediate(resolve));

        expect(stores.peek('dataInstaller.import.current')).toMatchObject({
            outcome: 'error',
            reason: 'the worker rejected two types',
        });
    });

    it('keeps the processing time when the runner measured one', async () => {
        const { context, stores } = makeImportHarness();
        happyClient();
        mockedWatch.mockResolvedValue({
            outcome: 'success',
            perType: {},
            processingTimeMs: 91_000,
        });

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await new Promise((resolve) => setImmediate(resolve));

        expect(stores.peek('dataInstaller.import.current')).toMatchObject({
            processingTimeMs: 91_000,
        });
    });

    it('omits both fields when the runner reported neither', async () => {
        const { context, stores } = makeImportHarness();
        happyClient();
        mockedWatch.mockResolvedValue({ outcome: 'success', perType: {} });

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await new Promise((resolve) => setImmediate(resolve));

        const record = stores.peek('dataInstaller.import.current') as Record<string, unknown>;
        // Present-but-undefined reads to a consumer as "measured, and it was
        // nothing" — the fields are spread in conditionally for that reason.
        expect('reason' in record).toBe(false);
        expect('processingTimeMs' in record).toBe(false);
    });

    it('carries the operation into the watch so a reset is watched as a reset', async () => {
        const { context } = makeImportHarness();
        happyClient();

        await importHandlers['reset-datapack'](context, { ...PAYLOAD, confirm: true });
        await new Promise((resolve) => setImmediate(resolve));

        expect(mockedWatch).toHaveBeenCalledWith(
            expect.objectContaining({ operation: 'reset', activationId: 'act-9' }),
        );
    });
});

describe('the feature turned off mid-import', () => {
    it('records that the watch could not run, and says why', async () => {
        // resolveDataInstallerAccess runs twice: once to prepare the request and
        // once inside the detached watch. Turning the feature off between them is
        // the only way the second can refuse after the first allowed — and the
        // record must not sit at "watching" forever.
        let enabledReads = 0;
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string) => {
                if (key === 'apiBaseUrl') {
                    return 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';
                }
                enabledReads += 1;
                return enabledReads === 1;
            }),
        });
        const { context, stores } = makeImportHarness();
        happyClient();

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);
        await new Promise((resolve) => setImmediate(resolve));

        // The import itself was accepted — this reports a lost WATCH, not a
        // failed import.
        expect(result.success).toBe(true);
        expect(stores.peek('dataInstaller.import.current')).toMatchObject({
            outcome: 'unwatchable',
            reason: 'The Data Installer could not be reached to watch this job.',
        });
        expect(mockedWatch).not.toHaveBeenCalled();
    });
});

describe('a start the service refuses', () => {
    it('reports the service reason and records no job', async () => {
        const { context, stores } = makeImportHarness();
        stubWriteClient({
            validateImport: jest.fn().mockResolvedValue({ valid: false, reason: 'unknown pack' }),
            startImport: jest.fn(),
            checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
        });

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(result).toEqual({ success: false, error: 'unknown pack' });
        expect(stores.peek('dataInstaller.import.current')).toBeUndefined();
    });

    it('falls back to its own wording when the service gives no reason', async () => {
        const { context } = makeImportHarness();
        stubWriteClient({
            validateImport: jest.fn().mockResolvedValue({ valid: false }),
            startImport: jest.fn(),
            checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
        });

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(result.error).toBe('The Data Installer rejected this import request.');
    });

    it('reports a thrown start as a failure rather than losing it', async () => {
        const { context } = makeImportHarness();
        stubWriteClient({
            validateImport: jest.fn().mockResolvedValue({ valid: true }),
            startImport: jest.fn().mockRejectedValue(new Error('runtime 503')),
            checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
        });

        const result = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(result).toMatchObject({ success: false, error: 'runtime 503' });
    });

    it('uses the operation-specific wording when the thrown value is not an Error', async () => {
        const { context } = makeImportHarness();
        stubWriteClient({
            validateImport: jest.fn().mockResolvedValue({ valid: true }),
            startDelete: jest.fn().mockRejectedValue('not an error object'),
            checkCredentials: jest.fn().mockResolvedValue({ usable: true }),
        });

        const result = await importHandlers['reset-datapack'](context, {
            ...PAYLOAD,
            confirm: true,
        });

        expect(result.error).toBe('The reset could not be started.');
    });
});

describe('a dry run that throws', () => {
    it('reports the thrown message', async () => {
        const { context } = makeImportHarness();
        stubWriteClient({
            checkCredentials: jest.fn().mockRejectedValue(new Error('token expired')),
            validateImport: jest.fn(),
        });

        const result = await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(result).toMatchObject({ success: false, error: 'token expired' });
    });

    it('falls back to its own wording for a non-Error throw', async () => {
        const { context } = makeImportHarness();
        stubWriteClient({
            checkCredentials: jest.fn().mockRejectedValue('a string'),
            validateImport: jest.fn(),
        });

        const result = await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(result.error).toBe('The request could not be validated.');
    });

    it('uses its own wording when the credentials check gives no reason', async () => {
        const { context } = makeImportHarness();
        stubWriteClient({
            checkCredentials: jest.fn().mockResolvedValue({ usable: false }),
            validateImport: jest.fn(),
        });

        const result = await importHandlers['validate-datapack-import'](context, PAYLOAD);

        // The CALL worked and the service answered; the verdict is the payload.
        // Reporting this as a failed call would send the panel down the error
        // path instead of showing the user what to fix.
        expect(result.success).toBe(true);
        expect(result.data).toEqual({
            valid: false,
            reason: 'These credentials did not reach that Commerce instance.',
        });
    });
});
