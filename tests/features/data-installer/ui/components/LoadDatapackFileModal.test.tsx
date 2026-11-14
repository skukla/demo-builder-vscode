/**
 * "Load from file": the host's picker opens first and says what is in the file;
 * only then does the SC choose a store and load. Each request is asserted by its
 * payload, because the handler decides on those fields. Replace or Keep Both, and the load
 * going on to install, are `LoadDatapackFileModal-keepBoth.test.tsx` (step-07 F1/F2).
 */

import { screen } from '@testing-library/react';
import { press, settle } from '../../../../helpers/reactSettle';
import { loadedFile } from '../../../../helpers/datapackFileFixtures';
import type { LoadOutcome } from '@/features/data-installer/ui/components/LoadDatapackFileModal';
import { deleteCalls, loadCall, mockRequest, OPENED, openModal, withService } from './LoadDatapackFileModal.testUtils';

beforeEach(() => withService());

it('opens the picker first, then shows what is in the file before anything is written', async () => {
    await openModal();

    expect(mockRequest.mock.calls[0][0]).toBe('open-datapack-zip');
    expect(screen.getByText('Justrite B2B, v1. It holds Categories, Customer Groups.')).toBeInTheDocument();
    expect(loadCall()).toBeUndefined();
});

it('names a saved version by when it was saved, never its id', async () => {
    withService({ 'open-datapack-zip': { success: true, data: { ...OPENED, version: '20261109-141504' } } });

    await openModal();

    expect(screen.getByText(/^Justrite B2B, saved Nov 9, .+\. It holds/)).toBeInTheDocument();
    expect(screen.queryByText(/20261109-141504/)).not.toBeInTheDocument();
});

it('titles the dialog as its button is labelled', async () => {
    await openModal();

    expect(screen.getByRole('heading', { name: 'Add from File' })).toBeInTheDocument();
});

it('offers no Data Installer destination while the Data Installer takes no writes from us', async () => {
    await openModal();

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByText(/Data Installer/)).not.toBeInTheDocument();
    await press(screen.getByRole('button', { name: 'Load' }));
    expect(loadCall()).toEqual({ path: OPENED.path, target: 'library', update: false });
});

// Clarity 2.9 (step-04 S10): the house text classes, as every other datapack dialog uses.
it('draws its opening line as the house lead, and the settings line as the house note', async () => {
    withService({ 'open-datapack-zip': { success: true, data: { ...OPENED, settingsLayer: { paths: ['a/b/c'] } } } });

    await openModal();

    expect(screen.getByText(/^Justrite B2B, v1\. It holds/)).toHaveClass('lead-text');
    expect(screen.getByText(/^Its store configuration/)).toHaveClass('dialog-note');
});

it('closes without a dialog when the picker was dismissed', async () => {
    withService({ 'open-datapack-zip': { success: true, data: { cancelled: true } } });

    const onClose = await openModal();

    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('loads into the library by default, private, without replacing anything', async () => {
    await openModal();

    await press(screen.getByRole('button', { name: 'Load' }));
    await settle();

    expect(loadCall()).toEqual({ path: OPENED.path, target: 'library', update: false });
    const heading = screen.getByRole('heading', { name: 'Justrite B2B Loaded' });
    expect(heading.querySelector('.text-positive')).not.toBeNull();
    expect(screen.getByText('Added to My Datapacks.')).toBeInTheDocument();
});

it('makes the outcome the title, and offers one way out rather than Close and Done', async () => {
    const onClose = await openModal();

    await press(screen.getByRole('button', { name: 'Load' }));
    await settle();

    expect(screen.queryByRole('heading', { name: 'Add from File' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();
    await press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
});

// Clarity 1.15 (step-04 S10): asked only when My Datapacks already holds this version. Asked as
// Replace or Keep Both since step-07 F1: `LoadDatapackFileModal-keepBoth.test.tsx`.
describe('the replace question', () => {
    it('is not asked about a version My Datapacks does not hold', async () => {
        await openModal({ mySaves: [{ name: 'justrite', version: 'v0' }] });

        expect(screen.queryByRole('radio')).not.toBeInTheDocument();
        expect(screen.queryByText(/already in My Datapacks/)).not.toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Load' }));
        expect(loadCall()).toMatchObject({ target: 'library', update: false });
    });
});

it('into the Data Installer: warns it is shared, and sends the pack name back as confirmation', async () => {
    withService({
        'load-datapack-zip': {
            success: true,
            data: {
                datapackName: 'justrite',
                version: 'v1',
                target: 'installer',
                pack: 'created',
                stored: ['categories'],
                failed: [],
            },
        },
    });
    await openModal({ offersInstaller: true });

    await press(screen.getByRole('radio', { name: /Data Installer/ }));

    expect(
        screen.getByText(/Other teams will see justrite in the shared catalog/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Replace Existing Version/ })).not.toBeInTheDocument();
    await press(screen.getByRole('button', { name: 'Load' }));
    await settle();
    expect(loadCall()).toEqual({
        path: OPENED.path,
        target: 'installer',
        update: false,
        confirmName: 'justrite',
    });
});

it('lists each refused type with its reason when only part of the file landed', async () => {
    withService({
        'load-datapack-zip': {
            success: true,
            data: {
                datapackName: 'justrite',
                version: 'v1',
                target: 'library',
                pack: 'created',
                stored: ['categories'],
                failed: [
                    {
                        dataType: 'customer_groups',
                        reason: 'customer_groups: too large to send in one request',
                    },
                ],
            },
        },
    });
    await openModal();

    await press(screen.getByRole('button', { name: 'Load' }));
    await settle();

    const heading = screen.getByRole('heading', { name: 'Justrite B2B Partly Loaded' });
    expect(heading.querySelector('.text-notice')).not.toBeNull();
    expect(screen.getByText('Loaded 1 of 2 data types. Added to My Datapacks.')).toBeInTheDocument();
    expect(screen.getByText(/too large to send in one request/)).toBeInTheDocument();
});

it('titles a load the service refused, with its reason in the body', async () => {
    withService({ 'load-datapack-zip': { success: false, error: 'The library is not reachable.' } });
    await openModal();

    await press(screen.getByRole('button', { name: 'Load' }));
    await settle();

    const heading = screen.getByRole('heading', { name: "Couldn't Load Justrite B2B" });
    expect(heading.querySelector('.text-negative')).not.toBeNull();
    expect(screen.getByText('The library is not reachable.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
});

it('explains a file that cannot be opened, in the handler words', async () => {
    withService({
        'open-datapack-zip': {
            success: false,
            error: 'This zip is not a Demo Builder datapack file.',
        },
    });

    await openModal();

    const heading = screen.getByRole('heading', { name: "Couldn't Open the File" });
    expect(heading.querySelector('.text-negative')).not.toBeNull();
    expect(screen.getByText('This zip is not a Demo Builder datapack file.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
});

// Step-07 F2 (P4-Q7): one row, one Delete, removing exactly what the load created, each by id and
// without the library's same-version layer, which the ids name when the load created it.
it('offers the one Delete after a load that created a library pack, and removes it on press', async () => {
    await openModal();
    await press(screen.getByRole('button', { name: 'Load' }));
    await settle();

    await press(screen.getByRole('button', { name: 'Delete' }));
    await settle();

    expect(deleteCalls()).toEqual([{ datapackName: 'justrite', version: 'v1', keepSettingsLayer: true, confirm: true }]);
    expect(screen.getByText('Deleted.')).toBeInTheDocument();
});

it('does not offer the Delete when the load updated a pack that was already there', async () => {
    withService({ 'load-datapack-zip': { success: true, data: loadedFile({ pack: 'updated', stored: ['categories'] }) } });
    await openModal();
    await press(screen.getByRole('button', { name: 'Load' }));
    await settle();

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
});

describe('a file that carries a settings layer (datapack-engine step 09)', () => {
    const LAYERED = { ...OPENED, settingsLayer: { paths: ['catalog/frontend/grid_per_page'] } };
    const loaded = (settingsLayer: NonNullable<LoadOutcome['settingsLayer']>, over: Partial<LoadOutcome> = {}) => ({
        success: true,
        data: loadedFile({ settingsLayer, ...over }),
    });
    const opened = { success: true, data: LAYERED };

    it('says, before anything is written, that its store configuration goes to My Datapacks, by count', async () => {
        withService({ 'open-datapack-zip': opened });

        await openModal();

        expect(screen.getByText('Its store configuration (1 setting) goes into My Datapacks.')).toBeInTheDocument();
    });

    it('says nothing of the kind for a file with none', async () => {
        await openModal();

        expect(screen.queryByText(/store configuration/i)).not.toBeInTheDocument();
    });

    it('offers one row and one Delete that removes the datapack and the layer the load created', async () => {
        withService({ 'open-datapack-zip': opened, 'load-datapack-zip': loaded({ datapackName: 'justrite-settings', version: 'v1', outcome: 'created' }) });
        await openModal();

        await press(screen.getByRole('button', { name: 'Load' }));
        expect(screen.getByText('Added to My Datapacks, with its store configuration.')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
        expect(screen.queryByRole('button', { name: 'Delete Store Configuration' })).not.toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Delete' }));
        await settle();

        expect(deleteCalls()).toEqual([
            { datapackName: 'justrite', version: 'v1', keepSettingsLayer: true, confirm: true },
            { datapackName: 'justrite-settings', version: 'v1', keepSettingsLayer: true, confirm: true },
        ]);
    });

    // Owner rule 1 (reversibility): a layer already in My Datapacks before the load is never removed by its Delete.
    it.each([
        ['the same version', 'v1'],
        ['another version', '3'],
    ])('never removes a layer that was there before the load, at %s', async (_what, version) => {
        const left = { datapackName: 'justrite-settings', version, outcome: 'left' as const, reason: `My Datapacks already holds justrite-settings@${version}, so it was left as it is.` };
        withService({ 'open-datapack-zip': opened, 'load-datapack-zip': loaded(left) });
        await openModal();

        await press(screen.getByRole('button', { name: 'Load' }));
        // A line of its own (layout variant 6): the part, then the reason under it.
        expect(screen.getByText('Store Configuration')).toBeInTheDocument();
        expect(screen.getByText(/already holds justrite-settings@/)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Justrite B2B Loaded' })).toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Delete' }));
        await settle();

        expect(deleteCalls()).toEqual([{ datapackName: 'justrite', version: 'v1', keepSettingsLayer: true, confirm: true }]);
    });

    it('offers the layer as the one row when the data went to the Data Installer', async () => {
        withService({ 'open-datapack-zip': opened, 'load-datapack-zip': loaded({ datapackName: 'justrite-settings', version: '3', outcome: 'created' }, { target: 'installer' }) });
        await openModal({ offersInstaller: true });
        await press(screen.getByRole('radio', { name: /Data Installer/ }));

        await press(screen.getByRole('button', { name: 'Load' }));
        expect(screen.getByText('Store Configuration')).toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Delete' }));
        await settle();

        expect(deleteCalls()).toEqual([{ datapackName: 'justrite-settings', version: '3', keepSettingsLayer: true, confirm: true }]);
    });
});
