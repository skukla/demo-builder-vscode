/**
 * Clear Demo Data when the project's datapack goes first (datapack-simplification step 06, C3): the
 * window reads the datapack's changes as Uninstall reads them (`useSwitchChanges`), and pressing the
 * red Clear opens "Save Your Changes First?" (core `SaveFirstWindow` over `SaveChangesBody`, verb
 * "Clear") when there are changes; the answer travels with the clear. With no changes, or no datapack,
 * the red button clears as before. Nothing is dropped without "Clear Without Saving".
 */

import { screen } from '@testing-library/react';
import { BODEA_CHECK, BODEA_PACK_CHECK } from '../../../../helpers/clearCheckFixtures';
import {
    answeringWith,
    button,
    footer,
    openWindow,
    press,
    sent,
    settle,
} from './ProjectClearWindow.testUtils';
import type { DatapackRemovalChanges } from '@/features/data-installer/removalChanges';

/** Two products changed in the SC's own pack. */
const OWN_CHANGES: DatapackRemovalChanges = {
    count: 2,
    kinds: [{ kind: 'products', count: 2, names: ['BD-RACK'] }],
    packName: 'Bodea B2B',
    alwaysSave: false,
};
/** The same in a pack that is not the SC's: a save makes a new one, named in the question. */
const THEIR_CHANGES: DatapackRemovalChanges = {
    count: 2,
    kinds: [{ kind: 'products', count: 2, names: ['BD-RACK'] }],
    alwaysSave: false,
};

it("reads the datapack's changes as Uninstall does, naming the pack the check named", async () => {
    answeringWith({}, BODEA_PACK_CHECK);

    await openWindow();

    expect(sent('get-datapack-removal-changes')).toEqual([
        { datapackName: 'bodea-b2b', version: '1', source: 'library' },
    ]);
});

// C3 review (2026-11-13): no answer, so the host reads the changes again; one made since is saved
// into the SC's own pack, or refused for an answer in another's, never dropped unasked.
it('clears at once, sending no answer, when the datapack had no changes when read', async () => {
    answeringWith({}, BODEA_PACK_CHECK);
    const { onClear } = await openWindow();

    await press(button('Clear 8 Items'));

    expect(screen.queryByRole('heading', { name: 'Save Your Changes First?' })).not.toBeInTheDocument();
    expect(onClear).toHaveBeenCalledWith('tok-1', ['bodea']);
});

it('asks "Save Your Changes First?" over the changes read again when the host refuses for an answer, then clears with it', async () => {
    answeringWith({}, BODEA_PACK_CHECK);
    const onClear = jest.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    await openWindow([], onClear);
    answeringWith({ changes: THEIR_CHANGES }, BODEA_PACK_CHECK);

    await press(button('Clear 8 Items'));
    await settle();

    expect(screen.getByRole('heading', { name: 'Save Your Changes First?' })).toBeInTheDocument();
    expect(sent('get-datapack-removal-changes')).toHaveLength(1);
    await press(button('Save and Clear'));
    expect(onClear).toHaveBeenLastCalledWith('tok-1', ['bodea'], { changes: 'keep', saveAs: { displayName: 'My Bodea B2B' } });
});

it('holds the red Clear while the clearing is being sent', async () => {
    answeringWith({}, BODEA_CHECK);
    const onClear = jest.fn(() => new Promise<boolean>(() => undefined));
    await openWindow([], onClear);

    await press(button('Clear 8 Items'));

    expect(button('Clear 8 Items')).toHaveAttribute('aria-disabled', 'true');
});

it('reads nothing and clears with no answer when the check names no datapack', async () => {
    answeringWith({ changes: OWN_CHANGES }, BODEA_CHECK);
    const { onClear } = await openWindow();

    await press(button('Clear 8 Items'));

    expect(sent('get-datapack-removal-changes')).toStrictEqual([]);
    expect(onClear).toHaveBeenCalledWith('tok-1', ['bodea']);
});

it('asks "Save Your Changes First?" in the verb Clear when there are changes, clearing nothing yet', async () => {
    answeringWith({ changes: OWN_CHANGES }, BODEA_PACK_CHECK);
    const { onClear } = await openWindow();

    await press(button('Clear 8 Items'));

    expect(screen.getByRole('heading', { name: 'Save Your Changes First?' })).toBeInTheDocument();
    expect(footer()).toEqual(['Clear Without Saving', 'Cancel', 'Save and Clear']);
    expect(onClear).not.toHaveBeenCalled();
});

it("Save and Clear saves into the SC's own pack: the answer travels with the clear", async () => {
    answeringWith({ changes: OWN_CHANGES }, BODEA_PACK_CHECK);
    const { onClear } = await openWindow();
    await press(button('Clear 8 Items'));

    await press(button('Save and Clear'));

    expect(onClear).toHaveBeenCalledWith('tok-1', ['bodea'], { changes: 'keep' });
});

it("Save and Clear on a pack not the SC's saves a new one under the name in the field", async () => {
    answeringWith({ changes: THEIR_CHANGES }, BODEA_PACK_CHECK);
    const { onClear } = await openWindow(['My Bodea B2B']);
    await press(button('Clear 8 Items'));

    expect(screen.getByRole('textbox', { name: 'Save As' })).toHaveValue('My Bodea B2B 2');
    await press(button('Save and Clear'));

    expect(onClear).toHaveBeenCalledWith('tok-1', ['bodea'], {
        changes: 'keep',
        saveAs: { displayName: 'My Bodea B2B 2' },
    });
});

it('drops the changes only on Clear Without Saving', async () => {
    answeringWith({ changes: OWN_CHANGES }, BODEA_PACK_CHECK);
    const { onClear } = await openWindow();
    await press(button('Clear 8 Items'));

    await press(button('Clear Without Saving'));

    expect(onClear).toHaveBeenCalledWith('tok-1', ['bodea'], { changes: 'drop' });
});

it('Cancel clears nothing and closes', async () => {
    answeringWith({ changes: OWN_CHANGES }, BODEA_PACK_CHECK);
    const { onClear, onClose } = await openWindow();
    await press(button('Clear 8 Items'));

    await press(button('Cancel'));

    expect(onClear).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
});

it("asks when the changes couldn't be read, saying so", async () => {
    answeringWith({ changes: 'fails' }, BODEA_PACK_CHECK);
    const { onClear } = await openWindow();

    await press(button('Clear 8 Items'));

    expect(screen.getByText("Your changes couldn't be checked.")).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();
});
