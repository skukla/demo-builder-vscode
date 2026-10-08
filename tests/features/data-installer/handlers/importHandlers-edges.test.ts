/**
 * The import spine's edges — the refusals, the fallbacks, and the two shapes a
 * job record takes when it ends.
 *
 * The sibling suites cover the happy paths of each handler. What was left were
 * the branches only an unusual project or an unusual service answer reaches: no
 * project open, a reset asked for without confirm, and the project-scope fallback
 * that stops an agent importing into `base`. What the finished watch records moved
 * to `importJobWatch.test.ts` with the watch (2026-10-08).
 */

import {
    importHandlers,
    PAYLOAD,
    happyClient,
    makeImportHarness,
    resetImportHandlerMocks,
    stubWriteClient,
} from './importHandlers.testUtils';
import type { Project } from '@/types/base';

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
