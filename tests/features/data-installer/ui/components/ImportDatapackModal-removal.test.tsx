/**
 * The removal confirm through the real modal (datapack-engine step 05): what the SC sees for what
 * the read found, what each button sends (Save and Uninstall, Uninstall Without Saving, with Save As's
 * name when the demo's pack is not the SC's), and that a wait shows only its spinner.
 *
 * Remove Data opens the window straight on this confirm (`opensOn: 'remove'`, owner 2026-11-09,
 * walk F118): it is no longer a button in the import form, and leaving the confirm closes the
 * window rather than showing a form the SC never asked for.
 */

import { act, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { mockRequest, press, renderModal, resetModalMocks, settle, defaultResponse, mockPostMessage } from './ImportDatapackModal.testUtils';
import { webviewClientHandlers } from '../../../../helpers/webviewClientMock';
import type { DatapackRemovalChanges } from '@/features/data-installer/removalChanges';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerResponse } from '@/types/handlers';

const SENTENCE = '3 items changed since install: the category Critical Power, and 2 products.';
const KINDS = [{ kind: 'categories', count: 1, names: ['Critical Power'] }, { kind: 'products', count: 2, names: ['A', 'B'] }];
/** The demo's pack is the SC's own: saving goes into it. */
const CHANGED: DatapackRemovalChanges = { count: 3, kinds: KINDS, sentence: SENTENCE, packName: 'Acme Bodea', alwaysSave: false };
/** The demo's pack is a team pack: saving makes a new pack of the SC's, by a name they give. */
const CHANGED_TEAM: DatapackRemovalChanges = { count: 3, kinds: KINDS, sentence: SENTENCE, alwaysSave: false };
const NOTHING: DatapackRemovalChanges = { count: 0, kinds: [], alwaysSave: false };
const CHANGES_LEAD = 'Uninstalling removes these changes.';
const DELETES = 'Permanently deletes Bodea’s categories.';

const footerRemove = () => screen.getByRole('button', { name: /^(Uninstall( Anyway)?|Save and Uninstall|Save As New and Uninstall)$/ });
const withoutSaving = () => screen.getByRole('button', { name: 'Uninstall Without Saving' });
const resetCalls = () => mockRequest.mock.calls.filter(([type]) => type === 'reset-datapack');
const readCalls = () => mockRequest.mock.calls.filter(([type]) => type === 'get-datapack-removal-changes');
/** The changes list as [data type, its line] pairs: the confirm's two-column FactList. */
const changedRows = () => Array.from(document.querySelectorAll('.fact-list dt')).map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);

/** The read answers this; `reset` answers the removal, by default accepting it. */
function answers(read: HandlerResponse | (() => Promise<HandlerResponse>), reset: HandlerResponse = { success: true, data: { activationId: 'act-1' } }): void {
    mockRequest.mockImplementation(async (type: string) => {
        if (type === 'get-datapack-removal-changes') return typeof read === 'function' ? read() : read;
        if (type === 'reset-datapack') return reset;
        return defaultResponse(type);
    });
}

/** Remove Data's window: it arms the confirm on mount, the changes check first. */
async function openConfirm(onClose: () => void = jest.fn()): Promise<void> {
    renderModal({ availableTypes: ['categories'], opensOn: 'remove', onClose });
    await settle();
    await settle();
}

beforeEach(() => resetModalMocks());

describe('opening on Remove Data', () => {
    it('asks the store what changed, for the pack, on its own, and shows only the check and Cancel while it does', async () => {
        let answer: (value: HandlerResponse) => void = () => undefined;
        answers(() => new Promise((resolve) => (answer = resolve)));
        renderModal({ availableTypes: ['categories'], opensOn: 'remove' });
        await settle();

        expect(readCalls()[0][1]).toEqual({ datapackName: 'bodea', version: 'main' });
        // While it checks, the title names the work, with no warning icon (walk F108).
        expect(screen.getByRole('heading', { name: 'Uninstall Bodea' })).toBeInTheDocument();
        expect(screen.getByText('Checking for your changes')).toBeInTheDocument();
        expect(screen.queryByText("Since this demo's last save")).toBeNull();
        expect(screen.queryByText(DELETES)).not.toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: 'Categories' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Uninstall' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

        await act(async () => answer({ success: true, data: NOTHING }));
        await settle();
        expect(screen.getByText(DELETES)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Uninstall Bodea from inst?' })).toBeInTheDocument();
    });

    it('asks only once, however often it draws', async () => {
        answers({ success: true, data: NOTHING });
        await openConfirm();
        await settle();

        expect(readCalls()).toHaveLength(1);
    });

    it('names a library pack\'s store in the read', async () => {
        answers({ success: true, data: NOTHING });
        renderModal({ availableTypes: ['categories'], source: 'library', opensOn: 'remove' });
        await settle();

        expect(readCalls()[0][1]).toEqual({ datapackName: 'bodea', version: 'main', source: 'library' });
    });

    it('never shows the import form or its buttons', async () => {
        answers({ success: true, data: NOTHING });
        await openConfirm();

        expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Dry Run' })).not.toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: 'Categories' })).not.toBeInTheDocument();
    });

    it('Cancel during the check closes the window and nothing is sent', async () => {
        answers(() => new Promise(() => undefined));
        const onClose = jest.fn();
        renderModal({ availableTypes: ['categories'], opensOn: 'remove', onClose });
        await settle();

        await press(screen.getByRole('button', { name: 'Cancel' }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(resetCalls()).toHaveLength(0);
    });

    it('Cancel on the confirm closes the window and nothing is sent', async () => {
        answers({ success: true, data: NOTHING });
        const onClose = jest.fn();
        await openConfirm(onClose);

        await press(screen.getByRole('button', { name: 'Cancel' }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(resetCalls()).toHaveLength(0);
    });
});

describe('a pack Demo Builder installed: its record decides what goes', () => {
    const RECORDED = 'Permanently deletes what Bodea installed: categories and products.';
    const scopeCalls = () => mockRequest.mock.calls.filter(([type]) => type === 'get-datapack-removal-scope');

    function recorded(recordedKinds: string[] | null): void {
        mockRequest.mockImplementation(async (type: string) => {
            if (type === 'get-datapack-removal-scope') return { success: true, data: { recordedKinds } };
            if (type === 'get-datapack-removal-changes') return { success: true, data: NOTHING };
            if (type === 'reset-datapack') return { success: true, data: { activationId: 'act-1' } };
            return defaultResponse(type);
        });
    }

    it('reads the pack\'s record, and names the kinds on it in the confirm', async () => {
        recorded(['categories', 'products']);
        renderModal({ opensOn: 'remove' });
        await settle();
        await settle();

        expect(scopeCalls()[0][1]).toEqual({ datapackName: 'bodea', version: 'main' });
        expect(screen.getByText(RECORDED)).toBeInTheDocument();
    });

    // The window shows no ticks, so it sends every type (helper's review: a pack with no record sent
    // none); with a record the handler takes what the record lists anyway.
    it('sends every type, though the record decides what goes', async () => {
        recorded(['categories', 'products']);
        renderModal({ opensOn: 'remove' });
        await settle();
        await settle();

        await press(footerRemove());
        expect(resetCalls()[0][1]).toMatchObject({ datapackName: 'bodea', version: 'main', confirm: true, dataTypes: ['categories', 'products'] });
    });

    it('CONTROL: names the pack\'s own type when there is no record, as the service removes what it is sent', async () => {
        recorded(null);
        await openConfirm();

        expect(screen.getByText(DELETES)).toBeInTheDocument();
        expect(screen.queryByText(RECORDED)).not.toBeInTheDocument();
    });
});

describe('nothing changed', () => {
    beforeEach(() => answers({ success: true, data: NOTHING }));

    it('is the confirm exactly as it was: the sentence and no boxes', async () => {
        await openConfirm();

        expect(screen.getByText(DELETES)).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.queryByText(/You changed/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Uninstall' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Uninstall Without Saving' })).not.toBeInTheDocument();
    });

    it('removes with nothing to keep', async () => {
        await openConfirm();

        await press(footerRemove());

        expect(resetCalls()[0][1]).toMatchObject({ datapackName: 'bodea', version: 'main', confirm: true, changes: 'drop' });
    });
});

describe('something changed, in a pack of the SC\'s', () => {
    beforeEach(() => answers({ success: true, data: CHANGED }));

    it('keeps the question, then lists what changed, a row per data type, and offers saving first or not', async () => {
        await openConfirm();

        expect(screen.getByRole('heading', { name: 'Uninstall Bodea from inst?' })).toBeInTheDocument();
        expect(screen.getByText(DELETES)).toBeInTheDocument();
        expect(screen.getByText(CHANGES_LEAD)).toBeInTheDocument();
        // Counted by type, no names (step 03, S6; decisions J2-1); no box (J2-3).
        expect(changedRows()).toStrictEqual([
            ['Categories', '1'],
            ['Products', '2'],
        ]);
        expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save and Uninstall' })).toBeEnabled();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    // The button that loses the changes stands apart, at the footer's start (walk F111).
    it('puts Uninstall Without Saving at the footer\'s start, apart from Cancel and the save', async () => {
        await openConfirm();

        expect(withoutSaving().closest('.modal-footer-start')).not.toBeNull();
        expect(screen.getByRole('button', { name: 'Save and Uninstall' }).closest('.modal-footer-start')).toBeNull();
        expect(screen.getByRole('button', { name: 'Cancel' }).closest('.modal-footer-start')).toBeNull();
    });

    it('counts a type\'s changes, never naming them', async () => {
        const many = [{ kind: 'products', count: 5, names: ['24-mb01', '24-mb02', '24-ug01', '24-ug02', '24-ug03'] }];
        answers({ success: true, data: { ...CHANGED, count: 5, kinds: many } });
        await openConfirm();

        expect(changedRows()).toStrictEqual([['Products', '5']]);
    });

    it('CONTROL: with no data types on the answer, says the sentence instead of a list', async () => {
        answers({ success: true, data: { ...CHANGED, kinds: [] } });
        await openConfirm();

        expect(screen.getByText(SENTENCE)).toBeInTheDocument();
        expect(screen.queryByText(CHANGES_LEAD)).not.toBeInTheDocument();
        expect(changedRows()).toHaveLength(0);
    });

    it('Save and Uninstall keeps them', async () => {
        await openConfirm();

        await press(footerRemove());

        expect(resetCalls()[0][1]).toMatchObject({ confirm: true, changes: 'keep' });
        expect(resetCalls()[0][1]).not.toHaveProperty('saveAs');
    });

    it('Uninstall Without Saving drops them', async () => {
        await openConfirm();

        await press(withoutSaving());

        expect(resetCalls()[0][1]).toMatchObject({ confirm: true, changes: 'drop' });
    });

    it('Cancel removes nothing, and closes the window', async () => {
        const onClose = jest.fn();
        await openConfirm(onClose);

        await press(screen.getByRole('button', { name: 'Cancel' }));

        expect(resetCalls()).toHaveLength(0);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe('something changed, in a pack that is not the SC\'s', () => {
    beforeEach(() => answers({ success: true, data: CHANGED_TEAM }));

    it('asks the new pack\'s name, starting empty, with no box, and saves only once it has one', async () => {
        await openConfirm();

        expect(screen.getByRole('textbox', { name: 'Save Changes As' })).toHaveValue('');
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save As New and Uninstall' })).toHaveAttribute('aria-disabled', 'true');
    });

    it('keeps them as a new pack by the name given', async () => {
        await openConfirm();

        await act(async () => {
            fireEvent.change(screen.getByRole('textbox', { name: 'Save Changes As' }), { target: { value: 'My Bodea' } });
        });
        await press(footerRemove());

        expect(resetCalls()[0][1]).toMatchObject({ changes: 'keep', saveAs: { displayName: 'My Bodea' } });
    });
});

describe('the setting answers', () => {
    beforeEach(() => answers({ success: true, data: { ...CHANGED, alwaysSave: true } }));

    it('shows the ordinary confirm with one line, and no list or boxes', async () => {
        await openConfirm();

        expect(screen.getByText(DELETES)).toBeInTheDocument();
        expect(screen.getByText('Your changes will be saved to Acme Bodea first.')).toBeInTheDocument();
        expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('keeps them', async () => {
        await openConfirm();

        await press(footerRemove());

        expect(resetCalls()[0][1]).toMatchObject({ changes: 'keep' });
    });

    it('with nothing changed, is the plain confirm: it does not say a save is coming', async () => {
        answers({ success: true, data: { ...NOTHING, alwaysSave: true } });
        await openConfirm();

        expect(screen.queryByText(/will be saved/)).not.toBeInTheDocument();
    });
});

describe('a read that fails', () => {
    beforeEach(() => answers({ success: false, error: 'The store could not be read.' }));

    it('says so, and offers removing anyway', async () => {
        await openConfirm();

        // Review, 2026-11-10: the title says it could not check; the body is the one consequence.
        expect(screen.getByRole('heading', { name: "Couldn't Check for Changes" })).toBeInTheDocument();
        expect(screen.getByText('Uninstalling removes any changes you made.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Uninstall Anyway' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('Uninstall Anyway removes, losing any changes', async () => {
        await openConfirm();

        await press(footerRemove());

        expect(resetCalls()[0][1]).toMatchObject({ confirm: true, changes: 'drop' });
    });
});

describe('a save that fails', () => {
    const REASON = 'The library did not take all of it. Delete that version and try again.';
    beforeEach(() => answers({ success: true, data: CHANGED }, { success: false, error: REASON, code: ErrorCode.CHANGES_NOT_SAVED }));

    it('says nothing was removed as a red title, and why', async () => {
        await openConfirm();

        await press(footerRemove());
        await settle();

        expect(screen.getByRole('heading', { name: "Couldn't Save Changes" })).toBeInTheDocument();
        expect(screen.getByText(REASON)).toBeInTheDocument();
        expect(screen.getByRole('heading').querySelector('.text-negative')).not.toBeNull();
    });

    it('Back returns to the same confirm, without reading again', async () => {
        await openConfirm();
        await press(footerRemove());
        await settle();

        await press(screen.getByRole('button', { name: 'Back' }));

        expect(screen.getByText(CHANGES_LEAD)).toBeInTheDocument();
        expect(readCalls()).toHaveLength(1);
    });

    // Uninstall's window has no form to go back to, so a Back would only close it beside the
    // Close that already does (review, 2026-11-10): it ends on Close alone.
    it('CONTROL: any other failure to start ends on Close alone, which closes the window', async () => {
        answers({ success: true, data: NOTHING }, { success: false, error: 'The service said no.' });
        const onClose = jest.fn();
        await openConfirm(onClose);
        await press(footerRemove());
        await settle();

        expect(screen.getByRole('heading', { name: "Couldn't Uninstall Bodea" })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
    });
});

describe('while it saves first', () => {
    function pushStage(stage: string): void {
        act(() => {
            webviewClientHandlers.get('operationProgress')?.({ id: DATAPACK_OPERATION_ID, state: 'running', stage });
        });
    }

    beforeEach(() => {
        mockRequest.mockImplementation(async (type: string) => {
            if (type === 'get-datapack-removal-changes') return { success: true, data: CHANGED };
            if (type === 'reset-datapack') return new Promise(() => undefined);
            return defaultResponse(type);
        });
    });

    it('says each stage in the same wait, with the dialog titled for the removal', async () => {
        await openConfirm();
        await press(footerRemove());

        pushStage('Saving to the library');

        // Step 03, S2: the running title is the job's (`jobWords`).
        expect(screen.getByRole('heading', { name: 'Uninstalling Bodea' })).toBeInTheDocument();
        expect(screen.getByText('Saving to the library')).toBeInTheDocument();
    });

    it('ignores another operation\'s progress', async () => {
        await openConfirm();
        await press(footerRemove());

        act(() => {
            webviewClientHandlers.get('operationProgress')?.({ id: 'something-else', state: 'running', stage: 'Deploying the mesh' });
        });

        expect(screen.queryByText('Deploying the mesh')).not.toBeInTheDocument();
        expect(screen.getByText('Uninstalling the datapack')).toBeInTheDocument();
    });

    it('closing hands it to a notification rather than stopping it', async () => {
        const onClose = jest.fn();
        await openConfirm(onClose);
        await press(footerRemove());
        pushStage('Saving to the library');

        await press(screen.getByRole('button', { name: 'Run in Background' }));

        expect(mockPostMessage).toHaveBeenCalledWith('backgroundOperation', { id: DATAPACK_OPERATION_ID, title: 'Uninstalling Bodea' });
        expect(onClose).toHaveBeenCalled();
    });
});

describe('after a removal that saved first', () => {
    it('says where the changes went on the result', async () => {
        const record = { activationId: 'act-1', datapackName: 'acme-1a2b3c', operation: 'reset', version: 'v', commerceInstance: 'inst', dataTypes: ['categories'], startedAt: '2026-11-02T00:00:00.000Z', outcome: 'success', perType: { categories: 'success' } };
        mockRequest.mockImplementation(async (type: string) => {
            if (type === 'get-datapack-removal-changes') return { success: true, data: CHANGED };
            if (type === 'reset-datapack') return { success: true, data: { activationId: 'act-1', savedNote: 'Saved to the Acme Demo pack. Bodea is unchanged.' } };
            if (type === 'get-datapack-import-status') return { success: true, data: record };
            return defaultResponse(type);
        });
        await openConfirm();

        await press(footerRemove());
        await settle();

        expect(await screen.findByRole('heading', { name: 'Bodea Uninstalled' })).toBeInTheDocument();
        expect(screen.getByText('Saved to the Acme Demo pack. Bodea is unchanged.')).toBeInTheDocument();
    });
});
