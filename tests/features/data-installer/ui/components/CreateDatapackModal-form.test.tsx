/**
 * The service's engine, a Commerce pack: what lets you go on, and what is sent.
 *
 * Nothing here is guessed: the export writes into a catalog other teams share, so a name, a version
 * and at least one data type are all required, all typed, and all trimmed. Each is checked ALONE,
 * because a rule that only ever sees the fields filled in one fixed order cannot tell "all three"
 * from "any of the three".
 */

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { press, settle } from '../../../../helpers/reactSettle';
import {
    button,
    card,
    CreateDatapackModal,
    isOff,
    exportCall,
    fillIdentity,
    mockRequest,
    renderExport,
    withService,
} from './CreateDatapackModal.testUtils';

async function toTheName(): Promise<void> {
    await press(card('Attribute sets'));
    await press(button('Continue'));
}

beforeEach(() => {
    mockRequest.mockReset();
    withService();
});

describe('what Continue waits for on the data types', () => {
    it('is off until a type is chosen', async () => {
        await renderExport();
        expect(isOff('Continue')).toBe(true);

        await press(card('Attribute sets'));

        expect(isOff('Continue')).toBe(false);
    });

    it('is off again when the last type is taken away', async () => {
        await renderExport();
        await press(card('Attribute sets'));
        await press(card('Attribute sets'));

        expect(isOff('Continue')).toBe(true);
    });
});

describe('what Export waits for on the name', () => {
    it('is off with neither', async () => {
        await renderExport();
        await toTheName();

        expect(isOff('Export')).toBe(true);
    });

    it('is off with a name and no version', async () => {
        await renderExport();
        await toTheName();
        await fillIdentity('captured', '');

        expect(isOff('Export')).toBe(true);
    });

    it('is off with a version and no name', async () => {
        await renderExport();
        await toTheName();
        await fillIdentity('', 'v1');

        expect(isOff('Export')).toBe(true);
    });

    // Whitespace is not a name. Both fields are trimmed BEFORE the length check, or a pack called
    // "   " reaches the shared catalog.
    it('rejects a name that is only whitespace', async () => {
        await renderExport();
        await toTheName();
        await fillIdentity('   ', 'v1');

        expect(isOff('Export')).toBe(true);
    });

    it('rejects a version that is only whitespace', async () => {
        await renderExport();
        await toTheName();
        await fillIdentity('captured', '   ');

        expect(isOff('Export')).toBe(true);
    });

    it('is on with both', async () => {
        await renderExport();
        await toTheName();
        await fillIdentity('captured', 'v1');

        expect(isOff('Export')).toBe(false);
    });

    it('says the name is seen in the shared catalog', async () => {
        await renderExport();
        await toTheName();

        expect(screen.getByText(/identify it in the shared catalog/)).toBeInTheDocument();
    });
});

describe('the payload', () => {
    it('trims the identity it sends', async () => {
        await renderExport();
        await toTheName();
        await fillIdentity('  captured-pack  ', '  v1  ');
        await press(button('Export'));

        expect(exportCall()).toMatchObject({ datapackName: 'captured-pack', version: 'v1' });
    });

    // The instance is the project's, not the user's: it comes from `get-datapack-import-target` and
    // is the one thing nobody types.
    it('names the instance the project is connected to', async () => {
        await renderExport();
        await toTheName();
        await fillIdentity('captured-pack', 'v1');
        await press(button('Export'));

        expect(exportCall()).toEqual({ datapackName: 'captured-pack', version: 'v1', commerceInstance: 'inst-1', dataTypes: ['attribute_sets'] });
    });

    // The target request can refuse (an unopened project, for one). The export still has to be
    // sendable, with an empty instance rather than a crash.
    it('sends an empty instance when the target could not be resolved', async () => {
        withService({ 'get-datapack-import-target': { success: false, error: 'Open a project first.' } });
        await renderExport();
        await toTheName();
        await fillIdentity('captured-pack', 'v1');
        await press(button('Export'));

        expect(exportCall()).toMatchObject({ commerceInstance: '' });
    });
});

describe('choosing types', () => {
    it('offers the EXPORT type list, by the key the handler reads', async () => {
        await renderExport();

        const call = mockRequest.mock.calls.find((c) => c[0] === 'list-datapack-data-types');
        // `operationMode` is the handler's key; `mode` is refused.
        expect(call?.[1]).toEqual({ operationMode: 'export' });
    });

    it('turns a card on and off with a check', async () => {
        await renderExport();
        await press(card('Categories'));
        expect(card('Categories')).toHaveAttribute('aria-pressed', 'true');
        expect(card('Categories')).toHaveAttribute('data-selected', 'true');

        await press(card('Categories'));

        expect(card('Categories')).toHaveAttribute('aria-pressed', 'false');
    });

    it('drops a type again when it is taken away', async () => {
        await renderExport();
        await press(button('Select all'));
        await press(card('Categories'));
        await press(button('Continue'));
        await fillIdentity('captured-pack', 'v1');
        await press(button('Export'));

        // Exactly the one left standing: not both, not none, and not the one clicked away.
        expect(exportCall()).toMatchObject({ dataTypes: ['attribute_sets'] });
    });

    it('Select all turns every card on, and becomes Clear all', async () => {
        await renderExport();
        await press(button('Select all'));

        expect(card('Attribute sets')).toHaveAttribute('aria-pressed', 'true');
        expect(card('Categories')).toHaveAttribute('aria-pressed', 'true');
        expect(isOff('Continue')).toBe(false);

        await press(button('Clear all'));

        expect(card('Attribute sets')).toHaveAttribute('aria-pressed', 'false');
        expect(card('Categories')).toHaveAttribute('aria-pressed', 'false');
        // Not merely unmarked: the selection has to be genuinely EMPTY, which only the off button can show.
        expect(isOff('Continue')).toBe(true);
    });

    /** Selecting all must send CODES: the labels are presentation only. */
    it('sends the codes it selected, never the names it showed', async () => {
        await renderExport();
        await press(button('Select all'));
        await press(button('Continue'));
        await fillIdentity('captured-pack', 'v1');
        await press(button('Export'));

        expect(exportCall()).toMatchObject({ dataTypes: ['attribute_sets', 'categories'] });
    });

    // The service has answered with a blank entry in the list; a card with no name is unusable and
    // would be sent as an empty data type.
    it('drops blank entries the service sends in the type list', async () => {
        withService({ 'list-datapack-data-types': { success: true, data: { mode: 'export', dataTypes: ['attribute_sets', '', 'categories'] } } });
        await renderExport();

        expect(screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))).toHaveLength(2);
    });

    it('keeps what was chosen through Back and forward, and reads the list once', async () => {
        await renderExport();
        await press(card('Categories'));
        await press(button('Continue'));
        await press(button('Back'));
        expect(card('Categories')).toHaveAttribute('aria-pressed', 'true');

        await press(button('Back'));
        await press(button('Continue'));

        expect(card('Categories')).toHaveAttribute('aria-pressed', 'true');
        expect(mockRequest.mock.calls.filter((c) => c[0] === 'list-datapack-data-types')).toHaveLength(1);
    });
});

describe('before the list arrives, and when it cannot', () => {
    it('shows only the wait while it reads, with no words', async () => {
        mockRequest.mockImplementation(() => new Promise(() => undefined));
        render(<CreateDatapackModal engine="service" onClose={jest.fn()} onSaveFromStore={jest.fn()} />);
        await settle();
        fireEvent.click(card('Commerce datapack'));
        fireEvent.click(button('Continue'));
        await settle();

        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.queryByText(/Reading|Loading/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Select all' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
        expect(button('Close')).toBeInTheDocument();
    });

    /** The section must never sit empty and unexplained: that is the silence this feature was built through. */
    it('says why when the type list cannot be loaded', async () => {
        withService({ 'list-datapack-data-types': { success: false, error: 'An operation mode is required.' } });
        await renderExport();

        expect(screen.getByText(/could not be loaded: An operation mode is required/)).toBeInTheDocument();
        expect(isOff('Continue')).toBe(true);
    });
});
