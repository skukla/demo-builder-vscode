/**
 * ExportDatapackModal — what the form lets you send, and what it sends.
 *
 * Nothing here is guessed: the export writes into a catalog other teams share,
 * so a name, a version and at least one data type are all required, all typed,
 * and all trimmed. Each of those three is checked ALONE, because a rule that
 * only ever sees the fields filled in one fixed order cannot tell "all three"
 * from "any of the three".
 *
 * Mocks and helpers live in `ExportDatapackModal.testUtils.tsx`.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { change, press, settle } from '../../../../helpers/reactSettle';
import {
    ExportDatapackModal,
    exportCall,
    expectExportDisabled,
    mockRequest,
    renderModal,
    withService,
} from './ExportDatapackModal.testUtils';

/** Fill the two text fields without pressing anything. */
async function fillIdentity(name: string, version: string): Promise<void> {
    await change(screen.getByRole('textbox', { name: /datapack name/i }), name);
    await change(screen.getByRole('textbox', { name: /version/i }), version);
}

async function chooseAttributeSets(): Promise<void> {
    await press(await screen.findByRole('checkbox', { name: 'Attribute sets' }));
}

beforeEach(() => {
    mockRequest.mockReset();
    withService();
});

describe('ExportDatapackModal — what the Export button waits for', () => {
    it('is not enough to have chosen a type', async () => {
        await renderModal();

        await chooseAttributeSets();

        expectExportDisabled(true);
    });

    it('is not enough to have a name and a type but no version', async () => {
        await renderModal();

        await fillIdentity('captured', '');
        await chooseAttributeSets();

        expectExportDisabled(true);
    });

    it('is not enough to have a version and a type but no name', async () => {
        await renderModal();

        await fillIdentity('', 'v1');
        await chooseAttributeSets();

        expectExportDisabled(true);
    });

    // Whitespace is not a name. Both fields are trimmed BEFORE the length check,
    // or a pack called "   " reaches the shared catalog.
    it('rejects a name that is only whitespace', async () => {
        await renderModal();

        await fillIdentity('   ', 'v1');
        await chooseAttributeSets();

        expectExportDisabled(true);
    });

    it('rejects a version that is only whitespace', async () => {
        await renderModal();

        await fillIdentity('captured', '   ');
        await chooseAttributeSets();

        expectExportDisabled(true);
    });
});

describe('ExportDatapackModal — the payload', () => {
    it('trims the identity it sends', async () => {
        await renderModal();

        await fillIdentity('  captured-pack  ', '  v1  ');
        await chooseAttributeSets();
        await press(screen.getByRole('button', { name: /^export$/i }));

        expect(exportCall()).toMatchObject({ datapackName: 'captured-pack', version: 'v1' });
    });

    // The instance is the project's, not the user's — it comes from
    // `get-datapack-import-target` and is the one thing on this form nobody types.
    it('names the instance the project is connected to', async () => {
        await renderModal();

        await fillIdentity('captured-pack', 'v1');
        await chooseAttributeSets();
        await press(screen.getByRole('button', { name: /^export$/i }));

        expect(exportCall()).toMatchObject({ commerceInstance: 'inst-1' });
    });

    // The target request can refuse — an unopened project, for one. The export
    // still has to be sendable, with an empty instance rather than a crash.
    it('sends an empty instance when the target could not be resolved', async () => {
        withService({
            'get-datapack-import-target': { success: false, error: 'Open a project first.' },
        });
        await renderModal();

        await fillIdentity('captured-pack', 'v1');
        await chooseAttributeSets();
        await press(screen.getByRole('button', { name: /^export$/i }));

        expect(exportCall()).toMatchObject({ commerceInstance: '' });
    });

    it('names the project in the intro when the target resolved', async () => {
        await renderModal();

        expect(screen.getByText(/Capture data from demo-1/)).toBeInTheDocument();
    });
});

describe('ExportDatapackModal — choosing types', () => {
    it('drops a type again when it is unchecked', async () => {
        await renderModal();

        await press(screen.getByRole('button', { name: /select all/i }));
        await press(screen.getByRole('checkbox', { name: 'Categories' }));
        await fillIdentity('captured-pack', 'v1');
        await press(screen.getByRole('button', { name: /^export$/i }));

        // Exactly the one left standing — not both, not none, and not the one
        // that was clicked away.
        expect(exportCall()).toMatchObject({ dataTypes: ['attribute_sets'] });
    });

    it('leaves nothing selectable after Clear all', async () => {
        await renderModal();
        await fillIdentity('captured-pack', 'v1');
        await press(screen.getByRole('button', { name: /select all/i }));
        expectExportDisabled(false);

        await press(screen.getByRole('button', { name: /clear all/i }));

        // Not merely unchecked: the selection has to be genuinely EMPTY, which
        // only the disabled button can show.
        expectExportDisabled(true);
    });

    // The service has answered with a blank entry in the list; a checkbox with no
    // label is unusable and would be sent as an empty data type.
    it('drops blank entries the service sends in the type list', async () => {
        withService({
            'list-datapack-data-types': {
                success: true,
                data: { mode: 'export', dataTypes: ['attribute_sets', '', 'categories'] },
            },
        });
        await renderModal();

        expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    });

    /**
     * Frame 1 is a real state, and it used to draw an empty grid.
     *
     * `loading` starts false and the fetch runs from a useEffect, so the first
     * render falls past a loading-only guard — which is why the guard reads
     * `!settled` too. Deliberately NOT `renderModal()`: that settles.
     */
    it('says it is still finding out, before anything has come back', async () => {
        render(<ExportDatapackModal onClose={jest.fn()} />);

        expect(screen.getByText(/loading what can be exported/i)).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

        await settle();
    });
});
