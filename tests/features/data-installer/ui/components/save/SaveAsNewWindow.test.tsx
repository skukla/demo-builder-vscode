/**
 * "Save As New Datapack" (step-04 S2; decisions Phase 7b, J3-1): the house form, one field, Datapack
 * Name, Cancel and Save, and no line. The name starts as the opener gives it (empty, or "My Bodea"
 * from someone else's datapack). A name it refuses shows under the field, in room kept for it from
 * the first frame, so the window never grows: "Give it a name." or "You already have a datapack
 * named My Luma.". Typing again clears it. Save hands the name on to the run.
 *
 * Ported from `SaveFromStoreModal.test.tsx` and `DatapackCatalogView-storeChanges.test.tsx` for what
 * is still true of Save As: the title, the field and its starting name, Save handing on the typed
 * name, Cancel closing.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../../helpers/reactSettle';
import { SaveAsNewWindow } from '@/features/data-installer/ui/components/save/SaveAsNewWindow';

const OWN = ['My Luma', 'Luma Holiday Weekend Sale'];

async function open(startName = '') {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(
        <SaveAsNewWindow startName={startName} ownNames={OWN} onSave={onSave} onClose={onClose} />
    );
    await settle();
    return { onSave, onClose };
}

const field = () => screen.getByRole('textbox', { name: /Datapack Name/u });
const button = (name: string) => screen.getByRole('button', { name });
const room = () => document.querySelector('.modal-steps-ghost');

describe('the form', () => {
    it('is titled Save As New Datapack, one field, Cancel and Save, and no line', async () => {
        await open();

        expect(screen.getByRole('heading', { name: 'Save As New Datapack' })).toBeInTheDocument();
        expect(screen.getAllByRole('textbox')).toHaveLength(1);
        expect(field()).toHaveValue('');
        expect(button('Cancel')).toBeInTheDocument();
        expect(button('Save')).toBeInTheDocument();
        expect(document.querySelector('.lead-text')).toBeNull();
    });

    it('starts with the name it is given', async () => {
        await open('My Bodea');

        expect(field()).toHaveValue('My Bodea');
    });

    it('keeps room under the field from the first frame for the longest error it could show', async () => {
        await open();

        expect(room()).toHaveTextContent(
            'You already have a datapack named Luma Holiday Weekend Sale.'
        );
        expect(room()).toHaveAttribute('aria-hidden', 'true');
    });
});

describe('a name it refuses', () => {
    it('says "Give it a name." under the field for an empty one, and saves nothing', async () => {
        const { onSave } = await open();

        await press(button('Save'));

        expect(screen.getByText('Give it a name.')).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
    });

    it('says the SC already has one by that name, whatever its capitals, and saves nothing', async () => {
        const { onSave } = await open();
        fireEvent.change(field(), { target: { value: 'my luma' } });

        await press(button('Save'));

        expect(screen.getByText('You already have a datapack named my luma.')).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
    });

    it('clears the error as the SC types again, the room still kept', async () => {
        await open();
        await press(button('Save'));

        fireEvent.change(field(), { target: { value: 'L' } });
        await settle();

        expect(screen.queryByText('Give it a name.')).toBeNull();
        expect(room()).not.toBeNull();
    });
});

describe('Save and Cancel', () => {
    it('hands the typed name on, trimmed', async () => {
        const { onSave } = await open('My Bodea');
        fireEvent.change(field(), { target: { value: '  Luma Holiday  ' } });

        await press(button('Save'));

        expect(onSave).toHaveBeenCalledWith('Luma Holiday');
    });

    it('Cancel closes, saving nothing', async () => {
        const { onSave, onClose } = await open('My Bodea');

        await press(button('Cancel'));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSave).not.toHaveBeenCalled();
    });
});
