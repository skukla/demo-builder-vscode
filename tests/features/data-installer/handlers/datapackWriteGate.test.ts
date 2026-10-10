/**
 * The gate every datapack write opens with (PL-69 pair 25): access, project,
 * credentials, in that order. What a test can pin is the ORDER the refusals come
 * in, the exact copy per write, the provisioning offer's two halves, and what
 * each collaborator is handed.
 */

import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { resolveDatapackWriteAccess } from '@/features/data-installer/handlers/datapackWriteGate';
import { canProvisionAccsCredentials } from '@/features/data-installer/services/accsProvisionEligibility';
import { resolveProjectCredentials } from '@/features/data-installer/services/commerceCredentialBroker';
import { DataInstallerClient } from '@/features/data-installer/services/dataInstallerClient';
import { ErrorCode } from '@/types/errorCodes';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    resolveDataInstallerAccess: jest.fn(),
}));
jest.mock('@/features/data-installer/services/commerceCredentialBroker', () => ({
    resolveProjectCredentials: jest.fn(),
}));
jest.mock('@/features/data-installer/services/accsProvisionEligibility', () => ({
    canProvisionAccsCredentials: jest.fn(),
}));

const mockedAccess = jest.mocked(resolveDataInstallerAccess);
const mockedCredentials = jest.mocked(resolveProjectCredentials);
const mockedCanProvision = jest.mocked(canProvisionAccsCredentials);

const BASE_URL = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';
const getToken = jest.fn().mockResolvedValue('tok');
const PROJECT = createMockProject({ adobe: { organization: 'org-1' } });

function contextWith(project = PROJECT) {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockedAccess.mockResolvedValue({
        ok: true,
        client: new DataInstallerClient({ baseUrl: BASE_URL, getToken }),
        baseUrl: BASE_URL,
        getToken,
    });
    mockedCredentials.mockResolvedValue({
        ok: true,
        credentials: { kind: 'accs', clientId: 'cid', clientSecret: 'fake-test-pw-not-a-secret' },
    });
    mockedCanProvision.mockReturnValue(true);
});

describe('resolveDatapackWriteAccess — the refusals, in order', () => {
    it('returns the access refusal as-is, before the project is read', async () => {
        const refusal = { success: false, error: 'The Data Installer is not configured.' };
        mockedAccess.mockResolvedValue({ ok: false, response: refusal });
        const context = contextWith();

        const gate = await resolveDatapackWriteAccess(context, 'import');

        expect(gate).toEqual({ response: refusal });
        expect(mockedAccess).toHaveBeenCalledWith(context);
        expect(context.stateManager.getCurrentProject).not.toHaveBeenCalled();
    });

    it.each([
        ['import', 'Open a project before importing a datapack.'],
        ['export', 'Open a project before exporting.'],
    ] as const)('with no project open, the %s copy, and no credential lookup', async (write, copy) => {
        const context = createMockHandlerContext({
            stateManager: createMockStateManager({
                getCurrentProject: jest.fn().mockResolvedValue(undefined),
            }),
        });

        const gate = await resolveDatapackWriteAccess(context, write);

        expect(gate).toEqual({ response: { success: false, error: copy } });
        expect(mockedCredentials).not.toHaveBeenCalled();
    });

    it.each([
        [
            'import',
            'unsupported-backend',
            'This project has no Adobe Commerce backend, so there is nothing to import into.',
        ],
        [
            'export',
            'unsupported-backend',
            'This project has no Adobe Commerce backend, so there is nothing to export from.',
        ],
        [
            'import',
            'missing-paas-admin',
            'This project has no Commerce admin username and password saved, so an import cannot authenticate.',
        ],
        [
            'export',
            'missing-paas-admin',
            'This project has no Commerce admin username and password saved, so an export cannot authenticate.',
        ],
    ] as const)('an %s refused for %s names that gap, with no offer', async (write, reason, copy) => {
        mockedCredentials.mockResolvedValue({ ok: false, reason });

        const gate = await resolveDatapackWriteAccess(contextWith(), write);

        expect(gate).toEqual({
            response: {
                success: false,
                error: copy,
                code: ErrorCode.INVALID_OPERATION,
                data: { needsAccsCredentials: false },
            },
        });
        // A non-ACCS gap never asks whether provisioning could help.
        expect(mockedCanProvision).not.toHaveBeenCalled();
    });

    it.each(['import', 'export'] as const)(
        'an %s refused for the ACCS gap names the verb and offers provisioning',
        async (write) => {
            mockedCredentials.mockResolvedValue({ ok: false, reason: 'needs-accs-credentials' });

            const gate = await resolveDatapackWriteAccess(contextWith(), write);

            expect(gate).toEqual({
                response: expect.objectContaining({
                    error: expect.stringMatching(new RegExp(`^ACCS ${write}s need `)),
                    data: { needsAccsCredentials: true },
                }),
            });
            expect(mockedCanProvision).toHaveBeenCalledWith(PROJECT.adobe);
        },
    );

    it('withholds the offer when the project has nowhere to provision into', async () => {
        mockedCredentials.mockResolvedValue({ ok: false, reason: 'needs-accs-credentials' });
        mockedCanProvision.mockReturnValue(false);

        const gate = await resolveDatapackWriteAccess(contextWith(), 'export');

        expect(gate).toMatchObject({ response: { data: { needsAccsCredentials: false } } });
    });

    it.each(['import', 'export'] as const)(
        'an %s refused for a missing credential service says so',
        async (write) => {
            mockedCredentials.mockResolvedValue({ ok: false, reason: 'no-credential-service' });

            const gate = await resolveDatapackWriteAccess(contextWith(), write);

            expect(gate).toMatchObject({
                response: {
                    error: expect.stringMatching(
                        new RegExp(`^ACCS ${write}s need .*no shared credential service is configured`),
                    ),
                },
            });
        },
    );
});

describe('resolveDatapackWriteAccess — when every check passes', () => {
    it('hands back the access, the project and its credentials', async () => {
        const gate = await resolveDatapackWriteAccess(contextWith(), 'import');

        expect(gate).toEqual({
            baseUrl: BASE_URL,
            getToken,
            project: PROJECT,
            credentials: {
                kind: 'accs',
                clientId: 'cid',
                clientSecret: 'fake-test-pw-not-a-secret',
            },
        });
    });

    it('asks for the credentials of the open project, with the caller context', async () => {
        const context = contextWith();

        await resolveDatapackWriteAccess(context, 'export');

        expect(mockedCredentials).toHaveBeenCalledWith(context, PROJECT);
    });
});
