/**
 * The removal confirm through the real modal (datapack-engine step 05): what the SC sees for what
 * the read found, what each button sends (Save and Remove, Remove Without Saving, with Save As's
 * name when the demo's pack is not the SC's), and that a wait shows only its spinner.
 */

import { act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { mockRequest, press, renderModal, resetModalMocks, settle, awaitForm, defaultResponse, mockPostMessage } from './ImportDatapackModal.testUtils';
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
const CHANGED_TEAM: DatapackRemovalChanges = { count: 3, kinds: KINDS, sentence: SENTENCE, suggestedName: 'Bodea Copy', alwaysSave: false };
const NOTHING: DatapackRemovalChanges = { count: 0, kinds: [], alwaysSave: false };
const ALWAYS_BOX = 'Always Save Without Asking';
const DELETES = 'Permanently deletes Bodea’s categories.';

const removeData = () => screen.getByRole('button', { name: 'Remove Data' });
const footerRemove = () => screen.getByRole('button', { name: /^(Remove( Anyway)?|Save and Remove|Save As New and Remove)$/ });
const withoutSaving = () => screen.getByRole('button', { name: 'Remove Without Saving' });
const resetCalls = () => mockRequest.mock.calls.filter(([type]) => type === 'reset-datapack');
const readCalls = () => mockRequest.mock.calls.filter(([type]) => type === 'get-datapack-removal-changes');

/** The read answers this; `reset` answers the removal, by default accepting it. */
function answers(read: HandlerResponse | (() => Promise<HandlerResponse>), reset: HandlerResponse = { success: true, data: { activationId: 'act-1' } }): void {
    mockRequest.mockImplementation(async (type: string) => {
        if (type === 'get-datapack-removal-changes') return typeof read === 'function' ? read() : read;
        if (type === 'reset-datapack') return reset;
        return defaultResponse(type);
    });
}

async function openConfirm(): Promise<void> {
    renderModal({ availableTypes: ['categories'] });
    await awaitForm();
    await press(removeData());
    await settle();
}

beforeEach(() => resetModalMocks());

describe('pressing Remove data', () => {
    it('asks the store what changed, for the pack, and shows only a spinner and Cancel while it does', async () => {
        let answer: (value: HandlerResponse) => void = () => undefined;
        answers(() => new Promise((resolve) => (answer = resolve)));
        renderModal({ availableTypes: ['categories'] });
        await awaitForm();

        await press(removeData());

        expect(readCalls()[0][1]).toEqual({ datapackName: 'bodea', version: 'main' });
        expect(screen.getByRole('heading', { name: 'Remove from inst?' })).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.queryByText(DELETES)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

        await act(async () => answer({ success: true, data: NOTHING }));
        await settle();
        expect(screen.getByText(DELETES)).toBeInTheDocument();
    });

    it('names a library pack\'s store in the read', async () => {
        answers({ success: true, data: NOTHING });
        renderModal({ availableTypes: ['categories'], source: 'library' });
        await awaitForm();

        await press(removeData());

        expect(readCalls()[0][1]).toEqual({ datapackName: 'bodea', version: 'main', source: 'library' });
    });

    it('Cancel during the read goes back to the form and nothing is sent', async () => {
        answers(() => new Promise(() => undefined));
        const onClose = jest.fn();
        renderModal({ availableTypes: ['categories'], onClose });
        await awaitForm();
        await press(removeData());

        await press(screen.getByRole('button', { name: 'Cancel' }));

        expect(removeData()).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
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

    const removeAll = () => screen.getByRole('button', { name: 'Remove All Data' });

    it('asks for the pack and offers Remove all data with nothing ticked', async () => {
        recorded(['categories', 'products']);
        renderModal();
        await awaitForm();

        expect(scopeCalls()[0][1]).toEqual({ datapackName: 'bodea', version: 'main' });
        expect(removeAll()).not.toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByRole('button', { name: 'Import' })).toHaveAttribute('aria-disabled', 'true');
    });

    it('names the kinds on the record in the confirm, and sends the removal with nothing ticked', async () => {
        recorded(['categories', 'products']);
        renderModal();
        await awaitForm();

        await press(removeAll());
        await settle();
        expect(screen.getByText(RECORDED)).toBeInTheDocument();

        await press(footerRemove());
        expect(resetCalls()[0][1]).toMatchObject({ datapackName: 'bodea', version: 'main', confirm: true, dataTypes: [] });
    });

    it('says the ticks do not limit it when fewer are ticked than go', async () => {
        recorded(['categories', 'products']);
        renderModal();
        await awaitForm();

        await press(screen.getByRole('checkbox', { name: 'Categories' }));
        await press(removeAll());
        await settle();

        expect(screen.getByText(RECORDED)).toBeInTheDocument();
        expect(screen.getByText('Selected data types apply to Import only.')).toBeInTheDocument();
    });

    it('needs a tick and says Remove data when there is no record: the service removes what it is sent', async () => {
        recorded(null);
        renderModal();
        await awaitForm();

        expect(removeData()).toHaveAttribute('aria-disabled', 'true');
        expect(screen.queryByRole('button', { name: 'Remove All Data' })).not.toBeInTheDocument();
    });

    it('needs a tick when the record lists nothing: a job still has to report on something', async () => {
        recorded([]);
        renderModal();
        await awaitForm();

        expect(removeData()).toHaveAttribute('aria-disabled', 'true');
    });

    it('falls back to the ticks when the record cannot be read', async () => {
        mockRequest.mockImplementation(async (type: string) => (type === 'get-datapack-removal-scope' ? { success: false, error: 'The install record could not be read.' } : defaultResponse(type)));
        renderModal();
        await awaitForm();

        expect(removeData()).toHaveAttribute('aria-disabled', 'true');
    });

    it('shows only the wait until the record has answered, so the button does not change under the pointer', async () => {
        let answer: (value: HandlerResponse) => void = () => undefined;
        mockRequest.mockImplementation(async (type: string) => (type === 'get-datapack-removal-scope' ? new Promise((resolve) => (answer = resolve)) : defaultResponse(type)));
        renderModal();
        await settle();

        expect(screen.queryByRole('checkbox', { name: 'Categories' })).not.toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toBeInTheDocument();

        await act(async () => answer({ success: true, data: { recordedKinds: ['categories'] } }));
        await settle();
        expect(removeAll()).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('reads the record again when the form comes back after a cancelled confirm', async () => {
        recorded(['categories']);
        renderModal();
        await awaitForm();
        const before = scopeCalls().length;

        await press(removeAll());
        await settle();
        await press(screen.getByRole('button', { name: 'Cancel' }));
        await settle();

        expect(scopeCalls()).toHaveLength(before + 1);
    });
});

describe('nothing changed', () => {
    beforeEach(() => answers({ success: true, data: NOTHING }));

    it('is the confirm exactly as it was: the sentence and no boxes', async () => {
        await openConfirm();

        expect(screen.getByText(DELETES)).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.queryByText(/You changed/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Remove Without Saving' })).not.toBeInTheDocument();
    });

    it('removes with nothing to keep', async () => {
        await openConfirm();

        await press(footerRemove());

        expect(resetCalls()[0][1]).toMatchObject({ datapackName: 'bodea', version: 'main', confirm: true, changes: 'drop' });
        expect(resetCalls()[0][1]).not.toHaveProperty('alwaysSave');
    });
});

describe('something changed, in a pack of the SC\'s', () => {
    beforeEach(() => answers({ success: true, data: CHANGED }));

    it('keeps the question and the sentence, then offers saving first or not, as two buttons', async () => {
        await openConfirm();

        expect(screen.getByRole('heading', { name: 'Remove from inst?' })).toBeInTheDocument();
        expect(screen.getByText(DELETES)).toBeInTheDocument();
        expect(screen.getByText(SENTENCE)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save and Remove' })).toBeEnabled();
        expect(withoutSaving()).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: ALWAYS_BOX })).not.toBeChecked();
    });

    it('Save and Remove keeps them', async () => {
        await openConfirm();

        await press(footerRemove());

        expect(resetCalls()[0][1]).toMatchObject({ confirm: true, changes: 'keep' });
        expect(resetCalls()[0][1]).not.toHaveProperty('alwaysSave');
        expect(resetCalls()[0][1]).not.toHaveProperty('saveAs');
    });

    it('Remove Without Saving drops them', async () => {
        await openConfirm();

        await press(withoutSaving());

        expect(resetCalls()[0][1]).toMatchObject({ confirm: true, changes: 'drop' });
    });

    it('with always ticked, Save and Remove also asks for the setting', async () => {
        await openConfirm();

        await press(screen.getByRole('checkbox', { name: ALWAYS_BOX }));
        await press(footerRemove());

        expect(resetCalls()[0][1]).toMatchObject({ changes: 'keep', alwaysSave: true });
    });

    it('Cancel removes nothing, and the next press starts afresh', async () => {
        await openConfirm();
        await press(screen.getByRole('checkbox', { name: ALWAYS_BOX }));

        await press(screen.getByRole('button', { name: 'Cancel' }));
        expect(resetCalls()).toHaveLength(0);

        await press(removeData());
        await settle();
        expect(readCalls()).toHaveLength(2);
        expect(screen.getByRole('checkbox', { name: ALWAYS_BOX })).not.toBeChecked();
    });
});

describe('something changed, in a pack that is not the SC\'s', () => {
    beforeEach(() => answers({ success: true, data: CHANGED_TEAM }));

    it('asks the new pack\'s name, starting from the suggested one, with no always box', async () => {
        await openConfirm();

        expect(screen.getByRole('textbox', { name: 'Save Changes As' })).toHaveValue('Bodea Copy');
        expect(screen.queryByRole('checkbox', { name: ALWAYS_BOX })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save As New and Remove' })).toBeEnabled();
    });

    it('keeps them as a new pack by the name given', async () => {
        await openConfirm();

        await press(footerRemove());

        expect(resetCalls()[0][1]).toMatchObject({ changes: 'keep', saveAs: { displayName: 'Bodea Copy' } });
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

        expect(screen.getByText(/Couldn.t check whether you changed anything in it since it was installed, so any changes would be lost\. The store could not be read\./)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove Anyway' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('Remove Anyway removes, losing any changes', async () => {
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

        expect(screen.getByRole('heading', { name: "Couldn't save changes. Nothing was removed." })).toBeInTheDocument();
        expect(screen.getByText(REASON)).toBeInTheDocument();
        expect(screen.getByRole('heading').querySelector('.text-negative')).not.toBeNull();
    });

    it('Back returns to the same confirm, boxes as they were, without reading again', async () => {
        await openConfirm();
        await press(screen.getByRole('checkbox', { name: ALWAYS_BOX }));
        await press(footerRemove());
        await settle();

        await press(screen.getByRole('button', { name: 'Back' }));

        expect(screen.getByText(SENTENCE)).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: ALWAYS_BOX })).toBeChecked();
        expect(readCalls()).toHaveLength(1);
    });

    it('CONTROL: any other failure to start goes Back to the form', async () => {
        answers({ success: true, data: NOTHING }, { success: false, error: 'The service said no.' });
        await openConfirm();
        await press(footerRemove());
        await settle();

        expect(screen.getByRole('heading', { name: "Couldn't Start the Removal" })).toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Back' }));
        expect(removeData()).toBeInTheDocument();
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

        expect(screen.getByRole('heading', { name: 'Remove Bodea' })).toBeInTheDocument();
        expect(screen.getByText('Saving to the library')).toBeInTheDocument();
    });

    it('ignores another operation\'s progress', async () => {
        await openConfirm();
        await press(footerRemove());

        act(() => {
            webviewClientHandlers.get('operationProgress')?.({ id: 'something-else', state: 'running', stage: 'Deploying the mesh' });
        });

        expect(screen.queryByText('Deploying the mesh')).not.toBeInTheDocument();
        expect(screen.getByText('Starting removal')).toBeInTheDocument();
    });

    it('closing hands it to a notification rather than stopping it', async () => {
        const onClose = jest.fn();
        renderModal({ availableTypes: ['categories'], onClose });
        await awaitForm();
        await press(removeData());
        await settle();
        await press(footerRemove());
        pushStage('Saving to the library');

        await press(screen.getByRole('button', { name: 'Run in Background' }));

        expect(mockPostMessage).toHaveBeenCalledWith('backgroundOperation', { id: DATAPACK_OPERATION_ID, title: 'Removing Bodea' });
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

        expect(await screen.findByRole('heading', { name: 'Removed Bodea' })).toBeInTheDocument();
        expect(screen.getByText('Saved to the Acme Demo pack. Bodea is unchanged.')).toBeInTheDocument();
    });
});
