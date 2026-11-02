/**
 * An ACO pack (datapack-engine step 14 item 19): cards for the store views, cards for the five ACO
 * kinds, a name, and what `start-datapack-export` is sent. Several of each can be chosen.
 */

import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press } from '../../../../helpers/reactSettle';
import { button, check, isOff, exportCall, fillIdentity, mockRequest, renderExport, SCOPES, withService } from './CreateDatapackModal.testUtils';

const VIEWS = ['Default Store View', 'French', 'CitiSignal US'];
const KINDS = ['ACO metadata', 'ACO categories', 'ACO products', 'ACO price books', 'ACO prices'];

/** From the store views, on through the kinds to the name. */
async function toTheName(): Promise<void> {
    await press(button('Continue'));
    await press(button('Continue'));
}

beforeEach(() => {
    mockRequest.mockReset();
    withService(SCOPES);
});

describe('an ACO pack', () => {
    it('reads the store views once it is on the way, and no Commerce types', async () => {
        await renderExport('aco');

        expect(mockRequest.mock.calls.some((c) => c[0] === 'list-datapack-import-scopes')).toBe(true);
        expect(mockRequest.mock.calls.some((c) => c[0] === 'list-datapack-data-types')).toBe(false);
    });

    it('offers every store view as a checkbox with its website, all on', async () => {
        await renderExport('aco');

        for (const view of VIEWS) expect(check(view)).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /^Default Store View.*Main Website/ })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /^CitiSignal US.*CitiSignal Website/ })).toBeInTheDocument();
    });

    it('then the five ACO kinds as cards, all on', async () => {
        await renderExport('aco');
        await press(button('Continue'));

        for (const kind of KINDS) expect(check(kind)).toBeChecked();
        expect(screen.queryByRole('button', { name: /^Attribute sets/ })).not.toBeInTheDocument();
    });

    it('sends every store view and kind as none named, which makes the pack for all of them', async () => {
        await renderExport('aco');
        await toTheName();
        await fillIdentity('aco_acme', 'main');
        await press(button('Export'));

        expect(exportCall()).toEqual({ datapackName: 'aco_acme', version: 'main', aco: true });
    });

    it('sends the store views and kinds still on when some are off', async () => {
        await renderExport('aco');
        await press(check('CitiSignal US'));
        await press(button('Continue'));
        await press(check('ACO prices'));
        await press(button('Continue'));
        await fillIdentity('aco_acme', 'main');
        await press(button('Export'));

        expect(exportCall()).toEqual({
            datapackName: 'aco_acme',
            version: 'main',
            aco: true,
            storeViews: ['default', 'fr'],
            dataTypes: ['aco_metadata', 'aco_categories', 'aco_products', 'aco_price_books'],
        });
    });

    it('cannot go on with no store view on', async () => {
        await renderExport('aco');
        for (const view of VIEWS) await press(check(view));

        expect(isOff('Continue')).toBe(true);
    });

    it('cannot go on with no kind on, and the store views stay answerable behind it', async () => {
        await renderExport('aco');
        await press(button('Continue'));
        for (const kind of KINDS) await press(check(kind));
        expect(isOff('Continue')).toBe(true);

        await press(button('Back'));

        expect(isOff('Continue')).toBe(false);
    });

    it('keeps what was turned off through Back and forward, and reads the store views once', async () => {
        await renderExport('aco');
        await press(check('French'));
        await press(button('Continue'));
        await press(button('Back'));
        await press(button('Back'));
        await press(button('Continue'));

        expect(check('French')).not.toBeChecked();
        expect(check('Default Store View')).toBeChecked();
        expect(mockRequest.mock.calls.filter((c) => c[0] === 'list-datapack-import-scopes')).toHaveLength(1);
    });

    it('makes the pack for every store view, and says so, when the store views cannot be listed', async () => {
        withService({ 'list-datapack-import-scopes': { success: true, data: { websites: [] } } });
        await renderExport('aco');

        expect(screen.getByText("Couldn't load store views. The datapack will include all of them.")).toBeInTheDocument();
        expect(isOff('Continue')).toBe(false);
    });

    it('waits with no words while it reads the store views', async () => {
        mockRequest.mockImplementation(() => new Promise(() => undefined));
        await renderExport('aco');

        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.queryByText(/Reading/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
        expect(button('Cancel')).toBeInTheDocument();
    });

    it('has no shared-catalog line on the name screen', async () => {
        await renderExport('aco');
        await toTheName();

        expect(screen.queryByText(/shared catalog/)).not.toBeInTheDocument();
    });

    it('saves the result as a file from the library, where the pack was written', async () => {
        withService({
            ...SCOPES,
            'start-datapack-export': {
                success: true,
                data: { success: true, perType: [{ dataType: 'aco_products', success: true, exported: 3, excluded: 2 }] },
            },
        });
        await renderExport('aco');
        await toTheName();
        await fillIdentity('aco_acme', 'main');
        await press(button('Export'));
        expect(screen.getByText(/ACO products: 3 exported \(2 left out\)/)).toBeInTheDocument();

        await press(button('Save as file'));

        expect(mockRequest.mock.calls.find((c) => c[0] === 'save-datapack-zip')?.[1]).toEqual({
            source: 'library',
            datapackName: 'aco_acme',
            version: 'main',
        });
    });
});
