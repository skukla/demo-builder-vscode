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
 *
 * **The mock returns the ENVELOPE, and that is load-bearing.** A handler's reply
 * reaches the webview whole — `{success, data, error}` — because the
 * communication manager sends the entire `HandlerResponse` as the payload
 * (`webviewCommunicationManager.ts:383`). An earlier fixture here returned the
 * unwrapped page, so `data.items` read true in tests and `undefined` in the Dev
 * Host: the step rendered "None" and nothing else, every time, while eight green
 * tests said otherwise. Mocking the envelope makes the real unwrapping run.
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

/** A handler reply as it really arrives: the whole envelope, not the payload. */
function envelope(data: unknown) {
    return { loading: false, error: null, data: { success: true, data } };
}

/** A guard refusal — `success:false` with a reason. It does NOT reject. */
function refusal(message: string) {
    return { loading: false, error: null, data: { success: false, error: message } };
}

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
    // The real hook awaits `execute` and attaches `.catch` — a bare jest.fn()
    // returns undefined and blows up inside it. The mock has to be shaped like
    // the thing it stands in for.
    mockExecute.mockResolvedValue(undefined);
    mockTypes.length = 0;
    mockState = envelope(CATALOG);
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
        mockState = refusal('The Data Installer is not configured.');
        renderStep();

        await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument());
        expect(screen.queryByTestId('datapack-card')).not.toBeInTheDocument();
    });
});

/**
 * Filtering, the same way the panel's catalog does it.
 *
 * `matchesSearchFields` rather than a local includes(): the panel's catalog
 * already matches on `name` + `displayName` and nothing else, and a second
 * matching rule here would be a second answer to "does this pack match".
 *
 * The service cannot help. Its `datapack_name` is half of an IDENTITY —
 * `(datapack_name, version)`, and the docs are explicit that "a lookup by name
 * alone has no answer" — so there is no server-side search to call. The whole
 * catalog is 40 rows for 25 names and is already fetched, so the filter is local
 * and instant.
 */
describe('SampleDataStep — filtering', () => {
    async function typeQuery(text: string) {
        const field = screen.getByRole('searchbox', { name: /filter sample data/i });
        fireEvent.change(field, { target: { value: text } });
    }

    it('narrows the packs to the ones that match', async () => {
        renderStep();
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        await typeQuery('citi');

        expect(screen.getAllByTestId('datapack-card')).toHaveLength(1);
        expect(cardFor('CitiSignal')).toBeInTheDocument();
    });

    /** The label is what the user reads; the id is what they may have been told. */
    it('matches the id as well as the display name', async () => {
        renderStep();
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        await typeQuery('citisignal_new');

        expect(screen.getAllByTestId('datapack-card')).toHaveLength(1);
    });

    it('ignores case', async () => {
        renderStep();
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        await typeQuery('BODEA');

        expect(cardFor('Bodea')).toBeInTheDocument();
    });

    it('restores every pack when the query is cleared', async () => {
        renderStep();
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        await typeQuery('citi');
        await typeQuery('');

        expect(screen.getAllByTestId('datapack-card')).toHaveLength(2);
    });

    /**
     * None is the opt-out, not a catalog entry, so a query never hides it.
     * Filtering it away would leave a radio group with nothing selectable at the
     * moment the user has decided they want nothing.
     */
    it('keeps None visible under any query', async () => {
        renderStep();
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        await typeQuery('zzzz-no-such-pack');

        expect(screen.getByRole('radio', { name: 'None' })).toBeInTheDocument();
        expect(screen.queryByTestId('datapack-card')).not.toBeInTheDocument();
    });

    it('says so when nothing matches, rather than showing a bare empty grid', async () => {
        renderStep();
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        await typeQuery('zzzz-no-such-pack');

        expect(screen.getByText(/no sample data matches/i)).toBeInTheDocument();
    });

    /** A choice already made must survive a query that hides its card. */
    it('keeps the recorded choice when a query hides it', async () => {
        const { updateState } = renderStep({
            datapack: { name: 'bodea', version: 'main' },
        } as Partial<WizardState>);
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        await typeQuery('citi');

        expect(updateState).not.toHaveBeenCalled();
    });
});
