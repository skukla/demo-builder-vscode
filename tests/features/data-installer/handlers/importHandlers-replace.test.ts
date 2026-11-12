/**
 * Importing another pack or version over the one the project uses (walk F97): the start settles the
 * SC's changes to the old pack as a reset does, and names it for the engine to remove first; an agent
 * that has not answered is refused, nothing removed or installed; the same version replaces nothing.
 *
 * `settleChangesBeforeRemoval` is the reset's own, tested in `removalChanges.test.ts`; here it is the
 * seam, so these assert what the import hands it and what it does with the answer.
 */

import type { InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { readInstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';
import { settleChangesBeforeRemoval } from '@/features/data-installer/handlers/removalChanges';
import { versionLabel } from '@/features/data-installer/packVersions';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import {
    PAAS_PROJECT,
    PAYLOAD,
    happyEngine,
    importHandlers,
    makeImportHarness,
    mockedWatch,
    resetImportHandlerMocks,
} from './importHandlers.testUtils';

jest.mock('@/features/data-installer/services/demoBuilderEngine/installRecord', () => ({
    ...jest.requireActual('@/features/data-installer/services/demoBuilderEngine/installRecord'),
    readInstallRecord: jest.fn(),
}));
jest.mock('@/features/data-installer/handlers/removalChanges', () => ({
    ...jest.requireActual('@/features/data-installer/handlers/removalChanges'),
    settleChangesBeforeRemoval: jest.fn(),
}));

const settle = jest.mocked(settleChangesBeforeRemoval);
const RECORD: InstallRecord = {
    format: 1,
    pack: { name: 'bodea', version: '20261101-120000' },
    engine: 'demo-builder',
    startedAt: '2026-11-01T00:00:00.000Z',
    created: [],
};

/** A project using bodea at `version`, which Demo Builder installed (it has a record). */
function projectUsing(version: string): Partial<Project> {
    return { ...PAAS_PROJECT, datapack: { name: 'bodea', version, store: 'library' } };
}

beforeEach(() => {
    resetImportHandlerMocks();
    jest.mocked(readInstallRecord).mockResolvedValue(RECORD);
    settle.mockResolvedValue({});
});

describe('importing another version over the one the project uses', () => {
    it('settles the changes to the old version, then names it for the engine to remove first', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(projectUsing('20261101-120000'));

        const response = await importHandlers['start-datapack-import'](context, {
            ...PAYLOAD,
            changes: 'drop',
        });

        expect(response.success).toBe(true);
        expect(settle).toHaveBeenCalledWith(
            context,
            expect.objectContaining({
                pack: { name: 'bodea', version: '20261101-120000' },
                answer: 'drop',
                unanswered: 'keep',
                source: 'library',
            }),
            expect.any(Function)
        );
        expect(startImport).toHaveBeenCalledWith(
            expect.objectContaining({
                id: { name: 'bodea', version: 'main' },
                replaces: { name: 'bodea', version: '20261101-120000' },
            })
        );
    });

    it('leaves the project naming the old version until the old one is gone', async () => {
        happyEngine();
        const { context } = makeImportHarness(projectUsing('20261101-120000'));

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('removes the version a save of the changes made, and says where they went', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(projectUsing('20261101-120000'));
        const saved = {
            id: { name: 'bodea', version: '20261109-150000' },
            dataTypes: ['products'],
            note: 'Saved to Bodea.',
        };
        settle.mockResolvedValue({ saved });

        const response = await importHandlers['start-datapack-import'](context, {
            ...PAYLOAD,
            changes: 'keep',
        });

        expect(startImport).toHaveBeenCalledWith(expect.objectContaining({ replaces: saved.id }));
        expect(response.data).toMatchObject({ savedNote: 'Saved to Bodea.', saved: saved.id });
        // Walk F105, then D3 (Phase 2): the Your Changes row says where they went, by the datapack's
        // name, never by a date or the id.
        const status = await importHandlers['get-datapack-import-status'](context, {});
        const job = status.data as { savedAs?: string; replaces?: string };
        expect(job.savedAs).toBe(job.replaces);
        expect(job.savedAs).not.toBe(versionLabel(saved.id.version));
    });
});

describe('changes in the old pack that no one has answered for', () => {
    it('refuses with CHANGES_NEED_ANSWER, removing and installing nothing', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(projectUsing('20261101-120000'));
        settle.mockResolvedValue({
            response: {
                success: false,
                error: 'You changed 2 products. Nothing was uninstalled. Tell the user, then call again with changes:"keep".',
                code: ErrorCode.CHANGES_NEED_ANSWER,
            },
        });

        const response = await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(response).toMatchObject({ success: false, code: ErrorCode.CHANGES_NEED_ANSWER });
        expect(response.error).toContain('Nothing was uninstalled or installed.');
        expect(startImport).not.toHaveBeenCalled();
    });

    it('CONTROL: an import that would be refused anyway is refused before anything is saved', async () => {
        const { startImport, validateImport } = happyEngine();
        validateImport.mockResolvedValue({ valid: false, reason: 'The pack holds no products.' });
        const { context } = makeImportHarness(projectUsing('20261101-120000'));

        const response = await importHandlers['start-datapack-import'](context, {
            ...PAYLOAD,
            changes: 'keep',
        });

        expect(response).toEqual({ success: false, error: 'The pack holds no products.' });
        expect(settle).not.toHaveBeenCalled();
        expect(startImport).not.toHaveBeenCalled();
    });
});

describe('importing what replaces nothing', () => {
    it('CONTROL: the same version again settles nothing and removes nothing first', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(projectUsing('main'));

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(settle).not.toHaveBeenCalled();
        expect(startImport.mock.calls[0][0]).not.toHaveProperty('replaces');
        // Recorded at once, as before: nothing has to go first.
        expect(context.stateManager.saveProject).toHaveBeenCalled();
    });

    // Only Restore replaces a pack by its own version (`restoreDatapack.ts`): the flag is an option
    // of the start, never read from a payload, so a message cannot ask for it.
    it('CONTROL: a payload saying restore does not make the same version a replace', async () => {
        const { startImport } = happyEngine();
        const { context } = makeImportHarness(projectUsing('main'));

        await importHandlers['start-datapack-import'](context, { ...PAYLOAD, restore: true } as typeof PAYLOAD);

        expect(settle).not.toHaveBeenCalled();
        expect(startImport.mock.calls[0][0]).not.toHaveProperty('replaces');
    });

    it('CONTROL: a pack Demo Builder did not install is not removed first', async () => {
        const { startImport } = happyEngine();
        jest.mocked(readInstallRecord).mockResolvedValue(undefined);
        const { context } = makeImportHarness(projectUsing('20261101-120000'));

        await importHandlers['start-datapack-import'](context, PAYLOAD);

        expect(settle).not.toHaveBeenCalled();
        expect(startImport.mock.calls[0][0]).not.toHaveProperty('replaces');
    });
});

describe('which pack the project names once the job runs', () => {
    /** Let the detached watch run to its end. */
    const flush = async (): Promise<void> => {
        for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
    };

    it('names the new pack once the old one is seen removed', async () => {
        happyEngine();
        const project = projectUsing('20261101-120000');
        const { context } = makeImportHarness(project);
        mockedWatch.mockImplementation(async ({ onProgress }) => {
            onProgress?.({ categories: 'pending' }, undefined, undefined, 'success');
            return { outcome: 'success', perType: { categories: 'success', products: 'success' }, replacing: 'success' };
        });

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await flush();

        expect(context.stateManager.saveProject).toHaveBeenCalledTimes(1);
        expect(project.datapack).toEqual({ name: 'bodea', version: 'main', store: 'installer' });
    });

    it('CONTROL: keeps naming the old pack when removing it failed', async () => {
        happyEngine();
        const project = projectUsing('20261101-120000');
        const { context } = makeImportHarness(project);
        mockedWatch.mockResolvedValue({ outcome: 'error', perType: { categories: 'error', products: 'error' }, replacing: 'error', stoppedAt: 'replacing' });

        await importHandlers['start-datapack-import'](context, PAYLOAD);
        await flush();

        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
        expect(project.datapack).toEqual({ name: 'bodea', version: '20261101-120000', store: 'library' });
    });
});
