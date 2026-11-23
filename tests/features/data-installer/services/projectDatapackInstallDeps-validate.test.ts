/**
 * buildSampleDataDeps — creation's install and reset's removal check the request before they
 * start it, the way the Data Installer screen and the agent's tools do.
 *
 * The handler path (`startDatapackImport`, `reset-datapack`) validates with the dry run first:
 * "the only thing that will tell us this request is malformed" (`importStart.ts`). Creation and
 * reset built their own request and started it with no check, so a request the screen would
 * refuse went straight to the engine (PL-104 fix 3, F264).
 */

jest.mock('@/features/data-installer/handlers/dataInstallerHandlers', () => {
    const resolveDataInstallerAccess = jest.fn();
    return {
        resolveDataInstallerAccess,
        resolveDatapackAccess: (context: unknown) => resolveDataInstallerAccess(context),
    };
});
jest.mock('@/features/data-installer/services/buildDatapackEngine', () => ({
    ...jest.requireActual('@/features/data-installer/services/buildDatapackEngine'),
    buildDatapackEngine: jest.fn(),
    installedByDemoBuilder: jest.fn(async () => true),
}));
jest.mock('@/features/authentication/services/projectOrgGuard', () => ({
    orgGuard: jest.fn(async () => undefined),
}));

import { resolveDataInstallerAccess } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { buildDatapackEngine } from '@/features/data-installer/services/buildDatapackEngine';
import type { DatapackEngine } from '@/features/data-installer/services/datapackEngine';
import type { ImportRequest } from '@/features/data-installer/services/importRequest';
import { buildSampleDataDeps } from '@/features/data-installer/services/projectDatapackInstallDeps';
import { ACCS_PROJECT, importHarness } from './projectDatapackInstallDeps.testUtils';

const REQUEST: ImportRequest = {
    id: { name: 'citisignal', version: '1.2.0' },
    commerceInstance: 'https://store.example',
    dataTypes: ['categories'],
    target: { websiteCode: 'base', storeCode: 'default' },
};

/** An engine whose two dry runs answer as told, and whose starts are recorded. */
function engine(verdict: { valid: boolean; reason?: string }) {
    return {
        validateImport: jest.fn(async () => verdict),
        validateRemoval: jest.fn(async () => verdict),
        startImport: jest.fn(async () => ({ activationId: 'imp-1' })),
        startDelete: jest.fn(async () => ({ activationId: 'del-1' })),
    };
}

function using(built: ReturnType<typeof engine>): void {
    (buildDatapackEngine as jest.Mock).mockReturnValue(built as unknown as DatapackEngine);
}

beforeEach(() => {
    jest.clearAllMocks();
    (resolveDataInstallerAccess as jest.Mock).mockResolvedValue({ ok: true, client: {} });
});

describe('an install is checked before it starts', () => {
    it('validates the very request it then starts', async () => {
        const built = engine({ valid: true });
        using(built);

        const started = await buildSampleDataDeps(
            importHarness(),
            ACCS_PROJECT,
            jest.fn()
        ).startImport(REQUEST);

        expect(started).toStrictEqual({ activationId: 'imp-1' });
        expect(built.validateImport).toHaveBeenCalledWith(REQUEST);
        expect(built.startImport).toHaveBeenCalledWith(REQUEST);
        expect(built.validateImport.mock.invocationCallOrder[0]).toBeLessThan(
            built.startImport.mock.invocationCallOrder[0]
        );
    });

    it('starts nothing when the check refuses, and says why', async () => {
        const built = engine({
            valid: false,
            reason: 'The pack has no products for website base.',
        });
        using(built);

        await expect(
            buildSampleDataDeps(importHarness(), ACCS_PROJECT, jest.fn()).startImport(REQUEST)
        ).rejects.toThrow('The pack has no products for website base.');
        expect(built.startImport).not.toHaveBeenCalled();
    });

    it('still says something when the refusal carries no reason', async () => {
        using(engine({ valid: false }));

        await expect(
            buildSampleDataDeps(importHarness(), ACCS_PROJECT, jest.fn()).startImport(REQUEST)
        ).rejects.toThrow('The Data Installer rejected this install request.');
    });
});

describe('a removal is checked before it starts', () => {
    const project = { ...ACCS_PROJECT, datapack: { name: 'citisignal', version: '1.2.0' } };

    it('validates the removal, not an install, before it starts the delete', async () => {
        const built = engine({ valid: true });
        using(built);

        const started = await buildSampleDataDeps(
            importHarness(),
            project,
            jest.fn(),
            'remove'
        ).startDelete?.(REQUEST);

        expect(started).toStrictEqual({ activationId: 'del-1' });
        expect(built.validateRemoval).toHaveBeenCalledWith(REQUEST);
        expect(built.validateImport).not.toHaveBeenCalled();
    });

    it('deletes nothing when the check refuses', async () => {
        const built = engine({ valid: false, reason: 'That pack was installed in another store.' });
        using(built);

        await expect(
            buildSampleDataDeps(importHarness(), project, jest.fn(), 'remove').startDelete?.(
                REQUEST
            )
        ).rejects.toThrow('That pack was installed in another store.');
        expect(built.startDelete).not.toHaveBeenCalled();
    });

    it('names the uninstall when the refusal carries no reason', async () => {
        using(engine({ valid: false }));

        await expect(
            buildSampleDataDeps(importHarness(), project, jest.fn(), 'remove').startDelete?.(
                REQUEST
            )
        ).rejects.toThrow('The Data Installer rejected this uninstall request.');
    });
});
