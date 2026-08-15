/**
 * SampleDataStep — the Commerce sub-step that records a datapack choice.
 *
 * The contract worth pinning is what it does NOT do: it must never start an
 * import. An import needs a reachable instance with working credentials and
 * runs for minutes; a failure inside project creation would leave a
 * half-populated instance the wizard has no story for. So it writes the choice
 * to wizard state and the dashboard installs it later.
 *
 * **It shows the panel's own grid.** A pack is a demo — brand art, a version, a
 * count of what it carries — and the Data Installer already presents it that
 * way. A flat list of names asks the user to pick a demo they cannot see, so the
 * step reuses `DatapackCard` rather than growing a second, poorer catalog. What
 * it does not reuse is the flyout: opening detail needs `get-datapack-detail`
 * registered too, and the wizard keeps its handler surface at the one read it
 * needs. Here a card press CHOOSES.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mockExecute = jest.fn();
let mockState: { loading: boolean; error: Error | null; data: unknown } = {
    loading: false,
    error: null,
    data: null,
};

jest.mock('@/core/ui/hooks/useVSCodeRequest', () => ({
    useVSCodeRequest: (type: string) => {
        mockTypes.push(type);
        return { execute: mockExecute, reset: jest.fn(), ...mockState };
    },
}));

const mockTypes: string[] = [];

// Below the mock on purpose — see webview-test-authoring §3.
import { SampleDataStep } from '@/features/project-creation/ui/steps/SampleDataStep';
import type { WizardState } from '@/types/webview';

/** Two names, three rows — so the grouping is actually exercised. */
const CATALOG = {
    // The REAL DatapackSummary shape: identity is a nested `id: {name, version}`,
    // not flat fields. A flat fixture looks right and crashes groupDatapacks.
    items: [
        { id: { name: 'bodea', version: 'main' }, displayName: 'Bodea', shared: true, dataTypes: [], art: {} },
        { id: { name: 'bodea', version: 'hold' }, displayName: 'Bodea', shared: true, dataTypes: [], art: {} },
        {
            id: { name: 'citisignal_new', version: 'main' },
            displayName: 'CitiSignal',
            shared: true,
            dataTypes: [],
            art: {},
        },
    ],
    total: 3,
};

function renderStep(state: Partial<WizardState> = {}) {
    const updateState = jest.fn();
    render(
        <SampleDataStep
            state={state as WizardState}
            updateState={updateState}
            setCanProceed={jest.fn()}
        />,
    );
    return { updateState };
}

/** The card for one pack, found by the name it displays. */
function cardFor(displayName: string): HTMLElement {
    const card = screen
        .getAllByTestId('datapack-card')
        .find((candidate) => within(candidate).queryByText(displayName));
    if (!card) {
        throw new Error(`no datapack card for ${displayName}`);
    }
    return card;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockTypes.length = 0;
    mockState = { loading: false, error: null, data: CATALOG };
});

describe('SampleDataStep', () => {
    it('offers each datapack NAME once, not each version', async () => {
        renderStep();

        await waitFor(() => expect(screen.getAllByTestId('datapack-card')).toHaveLength(2));
        // Three rows, two names — the second bodea version must not add a card.
        expect(screen.getAllByRole('radio')).toHaveLength(3); // None + 2 names
    });

    /** The redesign's point: a pack is SHOWN, not named in a list. */
    it('shows the panel’s card for each pack, art and version and all', async () => {
        renderStep();

        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());
        expect(cardFor('CitiSignal')).toBeInTheDocument();
        // The version control rides along on the card, as it does in the panel.
        expect(within(cardFor('Bodea')).getByTestId('spectrum-picker')).toBeInTheDocument();
    });

    it('records the choice on wizard state', async () => {
        const { updateState } = renderStep();
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        fireEvent.click(cardFor('Bodea'));

        await waitFor(() =>
            expect(updateState).toHaveBeenCalledWith({
                datapack: { name: 'bodea', version: 'main' },
            }),
        );
    });

    /** The whole point of the sub-step: choosing must not write to an instance. */
    it('NEVER starts an import — it only reads the catalog', async () => {
        renderStep();
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        fireEvent.click(cardFor('Bodea'));

        await waitFor(() => expect(mockTypes).toContain('find-datapacks'));
        expect(mockTypes).not.toContain('start-datapack-import');
        expect(mockTypes).not.toContain('validate-datapack-import');
        // The only request fired is the catalog read.
        expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    /**
     * A card press CHOOSES; it must not try to open the panel's detail flyout,
     * whose handler the wizard deliberately does not register.
     */
    it('never asks for datapack detail — the flyout is the panel’s, not this', async () => {
        renderStep();
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        fireEvent.click(cardFor('Bodea'));

        expect(mockTypes).not.toContain('get-datapack-detail');
    });

    it('clears the choice when None is picked', async () => {
        const { updateState } = renderStep({
            datapack: { name: 'bodea', version: 'main' },
        } as Partial<WizardState>);
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('radio', { name: 'None' }));

        await waitFor(() => expect(updateState).toHaveBeenCalledWith({ datapack: undefined }));
    });

    it('marks the recorded choice, and only that one', async () => {
        renderStep({ datapack: { name: 'bodea', version: 'main' } } as Partial<WizardState>);

        await waitFor(() => expect(cardFor('Bodea')).toHaveAttribute('aria-checked', 'true'));
        expect(cardFor('CitiSignal')).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'false');
    });

    /** The group is never blank: None carries the mark when nothing else does. */
    it('marks None when no pack is chosen', async () => {
        renderStep();

        await waitFor(() =>
            expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute(
                'aria-checked',
                'true',
            ),
        );
    });

    /** A catalog that cannot load must not block creating the project. */
    it('explains a failed catalog without offering a broken list', async () => {
        mockState = { loading: false, error: new Error('offline'), data: null };
        renderStep();

        await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument());
        expect(screen.queryByTestId('datapack-card')).not.toBeInTheDocument();
    });
});
