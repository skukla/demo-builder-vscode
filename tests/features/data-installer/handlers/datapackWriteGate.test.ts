/**
 * The gate every datapack write opens with (PL-69 pair 25): access, project,
 * backend, in that order. What a test can pin is the ORDER the refusals come in,
 * the exact copy per write, and what each collaborator is handed.
 *
 * It asks for no Commerce credentials: the service signs in with its own
 * (DEMOSYS-1698), so the gate stopped refusing projects that have none (DI-6).
 */

import { resolveDataInstallerAccess, resolveDatapackAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { resolveDatapackWriteAccess } from '@/features/data-installer/handlers/datapackWriteGate';
import { DataInstallerClient } from '@/features/data-installer/services/dataInstallerClient';
import type { ServiceHealth } from '@/features/data-installer/types';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => ({
    resolveDataInstallerAccess: jest.fn(),
    resolveDatapackAccess: jest.fn(),
}));

/** What the gate opens by: the Data Installer's access when its address is set, else the store's. */
const mockedAccess = jest.mocked(resolveDatapackAccess);
/** What `dataInstallerAnswers` asks: the Data Installer's own, never the store's. */
const mockedInstallerAccess = jest.mocked(resolveDataInstallerAccess);

const BASE_URL = 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';
const getToken = jest.fn().mockResolvedValue('tok');

/** A project on the given backend component — the field the gate reads. */
function projectOn(backend: string): Project {
    return createMockProject({
        adobe: { organization: 'org-1' },
        componentSelections: { frontend: '', backend, dependencies: [], integrations: [], appBuilder: [] },
    });
}

const ACCS_PROJECT = projectOn('adobe-commerce-accs');

function contextWith(project: Project | undefined) {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        }),
    });
}

/** The read client the gate passes on as the service's job reads. */
const READ_CLIENT = new DataInstallerClient({ baseUrl: BASE_URL, getToken });

beforeEach(() => {
    jest.clearAllMocks();
    mockedAccess.mockResolvedValue({
        ok: true,
        client: READ_CLIENT,
        baseUrl: BASE_URL,
        getToken,
    });
});

describe('resolveDatapackWriteAccess — the refusals, in order', () => {
    it('returns the access refusal as-is, before the project is read', async () => {
        const refusal = { success: false, error: 'The Data Installer is not configured.' };
        mockedAccess.mockResolvedValue({ ok: false, response: refusal });
        const context = contextWith(ACCS_PROJECT);

        const gate = await resolveDatapackWriteAccess(context, 'import');

        expect(gate).toEqual({ response: refusal });
        expect(mockedAccess).toHaveBeenCalledWith(context);
        expect(context.stateManager.getCurrentProject).not.toHaveBeenCalled();
    });

    it.each([
        ['import', 'Open a project before importing a datapack.'],
        ['export', 'Open a project before exporting.'],
    ] as const)('with no project open, the %s copy', async (write, copy) => {
        const gate = await resolveDatapackWriteAccess(contextWith(undefined), write);

        expect(gate).toEqual({ response: { success: false, error: copy } });
    });

    it.each([
        ['import', 'This project has no Adobe Commerce backend, so there is nothing to import into.'],
        ['export', 'This project has no Adobe Commerce backend, so there is nothing to export from.'],
    ] as const)('an %s on a project with no Commerce backend names that gap', async (write, copy) => {
        const gate = await resolveDatapackWriteAccess(contextWith(projectOn('')), write);

        expect(gate).toEqual({
            response: { success: false, error: copy, code: ErrorCode.INVALID_OPERATION },
        });
    });
});

describe('resolveDatapackWriteAccess — when every check passes', () => {
    it.each([
        ['adobe-commerce-accs', 'accs'],
        ['adobe-commerce-paas', 'paas'],
    ] as const)('hands back the access, the project and its backend (%s)', async (component, backend) => {
        const project = projectOn(component);

        const gate = await resolveDatapackWriteAccess(contextWith(project), 'import');

        expect(gate).toEqual({
            baseUrl: BASE_URL,
            getToken,
            jobs: READ_CLIENT,
            // The same read client: Demo Builder's engine reads a pack's rows through it (DI-5).
            catalog: READ_CLIENT,
            dataInstallerAnswers: expect.any(Function),
            project,
            backend,
        });
    });

    // The whole point of DI-6: a project with no saved Commerce pair is no longer refused.
    it('opens for an ACCS project that saved no Commerce credentials', async () => {
        const gate = await resolveDatapackWriteAccess(contextWith(ACCS_PROJECT), 'export');

        expect(gate).not.toHaveProperty('response');
    });
});

describe('dataInstallerAnswers, asked only for what only the Data Installer can do', () => {
    async function answers(context = contextWith(ACCS_PROJECT)) {
        const gate = await resolveDatapackWriteAccess(context, 'import');
        if ('response' in gate) throw new Error('the gate should have opened');
        return gate.dataInstallerAnswers();
    }

    /** A Data Installer access whose health check answers as told. */
    function installerHealth(check: () => Promise<ServiceHealth>): jest.Mock {
        const checkHealth = jest.fn(check);
        const client = new DataInstallerClient({ baseUrl: BASE_URL, getToken });
        client.checkHealth = checkHealth;
        mockedInstallerAccess.mockResolvedValue({ ok: true, client, baseUrl: BASE_URL, getToken });
        return checkHealth;
    }

    it('is not asked just by opening the gate', async () => {
        await resolveDatapackWriteAccess(contextWith(ACCS_PROJECT), 'import');

        expect(mockedInstallerAccess).not.toHaveBeenCalled();
    });

    it('is true when the Data Installer takes the sign-in and its health check answers', async () => {
        const checkHealth = installerHealth(async () => ({ reachable: true }));
        const context = contextWith(ACCS_PROJECT);

        await expect(answers(context)).resolves.toBe(true);

        // Asked with no store: the Data Installer, not the datapack store.
        expect(mockedInstallerAccess).toHaveBeenCalledWith(context);
        expect(checkHealth).toHaveBeenCalledTimes(1);
    });

    it('is false when the health check fails', async () => {
        installerHealth(async () => {
            throw new Error('down');
        });

        await expect(answers()).resolves.toBe(false);
    });

    it('is false, without a network call, when it has no address or refuses the sign-in', async () => {
        mockedInstallerAccess.mockResolvedValue({ ok: false, response: { success: false, error: 'No address' } });

        await expect(answers()).resolves.toBe(false);
    });
});
