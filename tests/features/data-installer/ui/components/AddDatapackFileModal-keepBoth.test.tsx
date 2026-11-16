/**
 * Add from File, step-07 F1 and F2.
 *
 * F1 (P4-Q10): a file whose version My Datapacks already holds asks Replace or Keep Both. Keep Both
 * adds it as a new datapack under the name in its box, which starts by J7-2's taken-name rule ("My
 * Luma 2", then "My Luma 3"; decisions "Back on track"); a name the SC has shows the house problem
 * line and Add waits.
 *
 * F2 (P4-Q7): in a project's Datapacks a clean load hands the datapack to the install window
 * (`onInstall`) instead of ending on its result; anything less than clean ends on the result.
 */

import { fireEvent, screen, within } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';
import { loadedFile } from '../../../../helpers/datapackFileFixtures';
import { loadCall, OPENED, openModal, withService } from './AddDatapackFileModal.testUtils';

const SAVE = { ...OPENED, displayName: 'My Luma' };
const HELD = [{ name: 'tailspin', version: 'v1' }];

describe('Replace or Keep Both (F1)', () => {
    beforeEach(() => withService({ 'open-datapack-zip': { success: true, data: SAVE } }));

    it('asks only when My Datapacks holds the version, and Replace writes over it', async () => {
        await openModal({ mySaves: HELD, ownNames: ['My Luma'] });

        expect(
            screen.getByText(
                "My Luma, v1. It holds Categories, Customer Groups. It's already in My Datapacks."
            )
        ).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Replace' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'Keep Both' })).not.toBeChecked();
        expect(screen.queryByRole('textbox', { name: /Datapack Name/ })).not.toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Replace' }));

        expect(loadCall()).toEqual({ path: OPENED.path, target: 'library', update: true });
    });

    it("starts Keep Both's name by the taken-name rule, and adds it under that name", async () => {
        await openModal({ mySaves: HELD, ownNames: ['My Luma', 'My Luma 2'] });

        await press(screen.getByRole('radio', { name: 'Keep Both' }));
        expect(screen.getByRole('textbox', { name: /Datapack Name/ })).toHaveValue('My Luma 3');
        await press(screen.getByRole('button', { name: 'Add' }));

        expect(loadCall()).toEqual({
            path: OPENED.path,
            target: 'library',
            update: false,
            saveAs: 'My Luma 3',
        });
    });

    it('shows the house problem line for a taken name, and Add waits until the name is free', async () => {
        await openModal({ mySaves: HELD, ownNames: ['My Luma'] });
        await press(screen.getByRole('radio', { name: 'Keep Both' }));
        const box = screen.getByRole('textbox', { name: /Datapack Name/ });
        expect(box).toHaveValue('My Luma 2');

        fireEvent.change(box, { target: { value: 'my luma' } });

        // The box's own problem line (the room kept under it holds the longest one, out of sight).
        const field = box.closest('label') as HTMLElement;
        expect(within(field).getByText('You already have a datapack named my luma.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute('aria-disabled', 'true');

        fireEvent.change(box, { target: { value: 'Luma Holiday' } });
        expect(within(field).queryByText(/You already have a datapack named/)).not.toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Add' }));
        expect(loadCall()).toMatchObject({ update: false, saveAs: 'Luma Holiday' });
    });

    it('titles the result by the new name', async () => {
        withService({
            'open-datapack-zip': { success: true, data: SAVE },
            'load-datapack-zip': {
                success: true,
                data: loadedFile({ datapackName: 'my-luma-2-x1y2z3', displayName: 'My Luma 2' }),
            },
        });
        await openModal({ mySaves: HELD, ownNames: ['My Luma'] });
        await press(screen.getByRole('radio', { name: 'Keep Both' }));

        await press(screen.getByRole('button', { name: 'Add' }));
        await settle();

        expect(screen.getByRole('heading', { name: 'My Luma 2 Loaded' })).toBeInTheDocument();
    });
});

describe('Install from File: add, then install (F2)', () => {
    beforeEach(() => withService());

    // By id and name only: the window reads the datapack's own types (a Replace may store only some).
    it('hands a clean load to the install window, by id and name, and shows no result', async () => {
        const onInstall = jest.fn();
        const onClose = await openModal({ onInstall });

        await press(screen.getByRole('button', { name: 'Add' }));
        await settle();

        expect(onInstall).toHaveBeenCalledTimes(1);
        expect(onInstall).toHaveBeenCalledWith({
            id: { name: 'tailspin', version: 'v1' },
            displayName: 'Tailspin B2B',
        });
        expect(
            screen.queryByRole('heading', { name: 'Tailspin B2B Loaded' })
        ).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    // Review of F2: a Replace of a file holding only some types must not install only those.
    it('hands over a Replace of a file holding only some types without naming types', async () => {
        const onInstall = jest.fn();
        withService({
            'open-datapack-zip': { success: true, data: { ...SAVE, dataTypes: ['categories'] } },
            'load-datapack-zip': { success: true, data: loadedFile({ pack: 'updated', stored: ['categories'] }) },
        });
        await openModal({ mySaves: HELD, ownNames: ['My Luma'], onInstall });

        await press(screen.getByRole('button', { name: 'Replace' }));
        await settle();

        expect(loadCall()).toMatchObject({ update: true });
        expect(onInstall).toHaveBeenCalledWith({ id: { name: 'tailspin', version: 'v1' }, displayName: 'My Luma' });
        expect(onInstall.mock.calls[0][0]).not.toHaveProperty('types');
    });

    it('hands over a Keep Both load by its new name', async () => {
        const onInstall = jest.fn();
        withService({
            'open-datapack-zip': { success: true, data: SAVE },
            'load-datapack-zip': {
                success: true,
                data: loadedFile({ datapackName: 'my-luma-2-x1y2z3', displayName: 'My Luma 2' }),
            },
        });
        await openModal({ mySaves: HELD, ownNames: ['My Luma'], onInstall });
        await press(screen.getByRole('radio', { name: 'Keep Both' }));

        await press(screen.getByRole('button', { name: 'Add' }));
        await settle();

        expect(onInstall).toHaveBeenCalledWith(
            expect.objectContaining({
                id: { name: 'my-luma-2-x1y2z3', version: 'v1' },
                displayName: 'My Luma 2',
            })
        );
    });

    it('ends on the result, and installs nothing, when part of the file did not land', async () => {
        const onInstall = jest.fn();
        withService({
            'load-datapack-zip': {
                success: true,
                data: loadedFile({
                    stored: ['categories'],
                    failed: [
                        {
                            dataType: 'customer_groups',
                            reason: 'customer_groups: too large to send in one request',
                        },
                    ],
                }),
            },
        });
        await openModal({ onInstall });

        await press(screen.getByRole('button', { name: 'Add' }));
        await settle();

        expect(onInstall).not.toHaveBeenCalled();
        expect(
            screen.getByRole('heading', { name: 'Tailspin B2B Partly Loaded' })
        ).toBeInTheDocument();
    });

    it('ends on the result, and installs nothing, when the load failed', async () => {
        const onInstall = jest.fn();
        withService({
            'load-datapack-zip': { success: false, error: 'The library is not reachable.' },
        });
        await openModal({ onInstall });

        await press(screen.getByRole('button', { name: 'Add' }));
        await settle();

        expect(onInstall).not.toHaveBeenCalled();
        expect(
            screen.getByRole('heading', { name: "Couldn't Add Tailspin B2B" })
        ).toBeInTheDocument();
    });
});
