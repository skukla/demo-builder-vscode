/**
 * Demo Builder's engine writes into the project's own store with the project's credential, so
 * the sign-in must be in the org that owns that store (owner, 2026-10-28). The extension's one
 * org guard (`orgGuard`, adobe-org-context) is asked before anything is written; a mismatch
 * answers ORG_MISMATCH with the "Switch IMS Org" wording. The service engine writes with its own
 * credential, so it is not asked.
 */

jest.mock('@/features/authentication/services/projectOrgGuard', () => ({ orgGuard: jest.fn() }));
jest.mock('@/features/data-installer/services/dataInstallerConfig', () => ({
    ...jest.requireActual('@/features/data-installer/services/dataInstallerConfig'),
    selectedDatapackEngine: jest.fn(),
}));

// The shared wall first: it owns the subject's import (webview-test-authoring §3).
import { happyClient, importHandlers, makeImportHarness, PAYLOAD, resetImportHandlerMocks } from './importHandlers.testUtils';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import { selectedDatapackEngine } from '@/features/data-installer/services/dataInstallerConfig';
import { ErrorCode } from '@/types/errorCodes';

const mockedGuard = orgGuard as jest.MockedFunction<typeof orgGuard>;
const mockedEngine = selectedDatapackEngine as jest.MockedFunction<typeof selectedDatapackEngine>;
const MISMATCH = 'Project uses a different Adobe organization. Use "Switch IMS Org" to continue.';

beforeEach(() => {
    resetImportHandlerMocks();
    mockedGuard.mockReset();
    mockedEngine.mockReset();
});

describe('the org a write into the store is checked against', () => {
    it('refuses, before anything starts, a sign-in outside the org that owns the store', async () => {
        mockedEngine.mockReturnValue('demo-builder');
        mockedGuard.mockResolvedValue({ error: MISMATCH });
        const { startImport } = happyClient();
        const { context } = makeImportHarness();

        const response = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(response).toEqual({ success: false, error: MISMATCH, code: ErrorCode.ORG_MISMATCH });
        expect(mockedGuard).toHaveBeenCalledWith(context, expect.objectContaining({ name: 'demo-a' }), context.authManager);
        expect(startImport).not.toHaveBeenCalled();
    });

    it('asks the same before a dry run', async () => {
        mockedEngine.mockReturnValue('demo-builder');
        mockedGuard.mockResolvedValue({ error: MISMATCH });
        happyClient();
        const { context } = makeImportHarness();

        const response = await importHandlers['validate-datapack-import'](context, PAYLOAD);

        expect(response).toMatchObject({ success: false, code: ErrorCode.ORG_MISMATCH });
    });

    it('does not ask when the service is the engine: it writes with its own credential', async () => {
        mockedEngine.mockReturnValue('service');
        const { startImport } = happyClient();
        const { context } = makeImportHarness();

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(mockedGuard).not.toHaveBeenCalled();
        expect(startImport).toHaveBeenCalled();
    });
});
