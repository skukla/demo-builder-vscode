/**
 * Demo Builder's engine writes into the project's own store with the project's credential, so
 * the sign-in must be in the org that owns that store (owner, 2026-10-28). The extension's one
 * org guard (`orgGuard`, adobe-org-context) is asked before anything is written; a mismatch
 * answers ORG_MISMATCH with the "Switch IMS Org" wording.
 */

jest.mock('@/features/authentication/services/projectOrgGuard', () => ({ orgGuard: jest.fn() }));

// The shared wall first: it owns the subject's import (webview-test-authoring §3).
import { happyEngine, importHandlers, makeImportHarness, PAYLOAD, resetImportHandlerMocks } from './importHandlers.testUtils';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import { ErrorCode } from '@/types/errorCodes';

const mockedGuard = orgGuard as jest.MockedFunction<typeof orgGuard>;
const MISMATCH = 'Project uses a different Adobe organization. Use "Switch IMS Org" to continue.';

beforeEach(() => {
    resetImportHandlerMocks();
    mockedGuard.mockReset();
});

describe('the org a write into the store is checked against', () => {
    it('refuses, before anything starts, a sign-in outside the org that owns the store', async () => {
        mockedGuard.mockResolvedValue({ error: MISMATCH });
        const { startImport } = happyEngine();
        const { context } = makeImportHarness();

        const response = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(response).toEqual({ success: false, error: MISMATCH, code: ErrorCode.ORG_MISMATCH });
        expect(mockedGuard).toHaveBeenCalledWith(context, expect.objectContaining({ name: 'demo-a' }), context.authManager);
        expect(startImport).not.toHaveBeenCalled();
    });

    it('asks the same before a dry run', async () => {
        mockedGuard.mockResolvedValue({ error: MISMATCH });
        happyEngine();
        const { context } = makeImportHarness();

        const response = await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(response).toMatchObject({ success: false, code: ErrorCode.ORG_MISMATCH });
    });

    it('CONTROL: starts once the sign-in is in that org', async () => {
        mockedGuard.mockResolvedValue(undefined);
        const { startImport } = happyEngine();
        const { context } = makeImportHarness();

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(mockedGuard).toHaveBeenCalled();
        expect(startImport).toHaveBeenCalled();
    });
});
