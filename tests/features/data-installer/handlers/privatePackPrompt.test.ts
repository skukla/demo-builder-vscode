/**
 * Exporting a project whose pack is the SC's own PRIVATE library pack (owner, 2026-10-30): a
 * person is asked once, "Your teammates can't use this pack's data. Share it?", with Share; declining
 * exports anyway. An agent's export answer carries the same sentence as a note instead.
 */

import {
    type PackSharingDeps,
    PRIVATE_PACK_QUESTION,
    offerToShareBeforeExport,
    privatePackNote,
    privatePackOf,
} from '@/features/data-installer/handlers/privatePackPrompt';
import type { DatapackSummary } from '@/features/data-installer/types';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { libraryPackProject } from './privatePackPrompt.testUtils';

const row = (overrides: Partial<DatapackSummary> = {}): DatapackSummary => ({
    id: { name: 'acme-1a2b3c', version: '20261029-183005' },
    displayName: 'Acme Demo',
    shared: false,
    dataTypes: ['products'],
    art: {},
    store: 'library',
    mine: true,
    ...overrides,
});

const PROJECT = libraryPackProject();

function setUp(rows: DatapackSummary[] = [row()], answer = true) {
    const findDatapacks = jest.fn(async () => ({ items: rows, count: rows.length }));
    const deps: PackSharingDeps = {
        library: jest.fn(async () => ({ findDatapacks })),
        ask: jest.fn(async () => answer),
        share: jest.fn(async () => ({ success: true })),
    };
    return { deps, findDatapacks, context: createMockHandlerContext() as HandlerContext };
}

describe('privatePackOf', () => {
    it("answers the project's pack when it is the SC's own and not shared", async () => {
        const { findDatapacks } = setUp();

        expect(await privatePackOf({ findDatapacks }, PROJECT)).toEqual({ name: 'acme-1a2b3c', version: '20261029-183005', displayName: 'Acme Demo' });
        expect(findDatapacks).toHaveBeenCalledWith({ datapackName: 'acme-1a2b3c' });
    });

    it.each([
        ['shared', [row({ shared: true })]],
        ["someone else's", [row({ mine: undefined })]],
        ['another version only', [row({ id: { name: 'acme-1a2b3c', version: 'older' } })]],
    ])('answers nothing for a pack that is %s', async (_label, rows) => {
        expect(await privatePackOf({ findDatapacks: setUp(rows).findDatapacks }, PROJECT)).toBeUndefined();
    });

    it('never asks the library about a Data Installer pack', async () => {
        const { findDatapacks } = setUp();

        expect(await privatePackOf({ findDatapacks }, createMockProject({ datapack: { name: 'bodea', version: 'main' } }))).toBeUndefined();
        expect(findDatapacks).not.toHaveBeenCalled();
    });
});

describe('offerToShareBeforeExport', () => {
    it('asks once, in the owner\'s words, and shares the pack on Share', async () => {
        const { deps, context } = setUp();

        expect(await offerToShareBeforeExport(context, PROJECT, deps)).toBe('shared');
        expect(deps.ask).toHaveBeenCalledTimes(1);
        expect(deps.ask).toHaveBeenCalledWith(PRIVATE_PACK_QUESTION, 'Everyone with access to the datapack library can see and install this pack.');
        expect(PRIVATE_PACK_QUESTION).toBe("Your teammates can't use this pack's data. Share it?");
        expect(deps.share).toHaveBeenCalledWith(context, 'acme-1a2b3c');
    });

    it('shares nothing when the SC declines, and the export goes on', async () => {
        const { deps, context } = setUp([row()], false);

        expect(await offerToShareBeforeExport(context, PROJECT, deps)).toBe('declined');
        expect(deps.share).not.toHaveBeenCalled();
    });

    it('asks nothing when the pack is shared already, or the library cannot be read', async () => {
        const shared = setUp([row({ shared: true })]);
        const down = setUp();
        down.deps.library = jest.fn(async () => undefined);

        expect(await offerToShareBeforeExport(shared.context, PROJECT, shared.deps)).toBe('none');
        expect(await offerToShareBeforeExport(down.context, PROJECT, down.deps)).toBe('none');
        expect(shared.deps.ask).not.toHaveBeenCalled();
        expect(down.deps.ask).not.toHaveBeenCalled();
    });

    it('still lets the export go on when the share is refused', async () => {
        const { deps, context } = setUp();
        deps.share = jest.fn(async () => ({ success: false, error: 'not yours' }));

        expect(await offerToShareBeforeExport(context, PROJECT, deps)).toBe('declined');
    });
});

describe('privatePackNote', () => {
    it("names the question and the tool that answers it, for an agent's export", async () => {
        const { deps, context } = setUp();

        expect(await privatePackNote(context, PROJECT, deps)).toBe(
            `${PRIVATE_PACK_QUESTION} The file names Acme Demo (acme-1a2b3c), which only you can read; share_datapack with shared:true shares it.`,
        );
        expect(deps.ask).not.toHaveBeenCalled();
    });

    it('says nothing for a shared pack', async () => {
        const { deps, context } = setUp([row({ shared: true })]);

        expect(await privatePackNote(context, PROJECT, deps)).toBeUndefined();
    });
});
