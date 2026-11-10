/**
 * SampleDataStep — choosing a pack, and choosing its VERSION.
 *
 * A pack's identity is `(name, version)`, so the version on show is half the
 * choice. Two states hold it and they are deliberately separate: `state.datapack`
 * is what the project records, and a local `browsing` map is what a card shows
 * for a pack the user has not chosen. Turning the picker on an unchosen pack
 * must therefore record NOTHING — and then a press must record the version that
 * was on show, not the default it started at.
 *
 * The mock preamble, fixtures and helpers are shared through
 * SampleDataStep.testUtils; the grid, filtering and failure treatments live in
 * the base suite.
 */

import React from 'react';
import { act, screen, fireEvent, waitFor, within } from '@testing-library/react';

import {
    mockExecute,
    mockMessageHandlers,
    envelope,
    notYetAsked,
    refusal,
    CATALOG,
    renderStep,
    cardFor,
    setMockState,
    resetDataInstallerMocks,
    SampleDataStep,
} from './SampleDataStep.testUtils';
import type { WizardState } from '@/types/webview';

beforeEach(resetDataInstallerMocks);

/** The hidden select the Spectrum Picker mock drives, for one pack's card. */
function versionSelect(displayName: string): HTMLSelectElement {
    return within(cardFor(displayName)).getByTestId(
        'spectrum-picker-select'
    ) as HTMLSelectElement;
}

/** The version a card is currently showing, read off its own aria-label. */
function versionShownOn(displayName: string): string {
    return versionSelect(displayName).value;
}

/** The same list the Datapacks screen has: its hidden select, in the Picker mock. */
function showSelect(): HTMLSelectElement {
    const select = screen.getByRole('button', { name: 'Show' }).parentElement?.querySelector('select');
    if (!select) throw new Error('The Show list has no select');
    return select;
}

describe('SampleDataStep — the Show list', () => {
    const COLLEAGUE = {
        id: { name: 'colleague', version: 'main' },
        displayName: 'Colleague Pack',
        dataTypes: [],
        art: {},
        store: 'library' as const,
    };

    it("opens on Recommended, leaving a colleague's pack out until asked for", async () => {
        setMockState(envelope({ ...CATALOG, items: [...CATALOG.items, COLLEAGUE] }));
        renderStep();

        await screen.findAllByTestId('datapack-card');
        expect(screen.queryByText('Colleague Pack')).not.toBeInTheDocument();

        fireEvent.change(showSelect(), { target: { value: 'community' } });

        expect(await screen.findByText('Colleague Pack')).toBeInTheDocument();
        expect(screen.queryByText('Bodea')).not.toBeInTheDocument();
    });

    it("keeps a chosen colleague's pack on view in Recommended", async () => {
        const chosen = { name: 'colleague', version: 'main', store: 'library' as const };
        setMockState(envelope({ ...CATALOG, items: [...CATALOG.items, COLLEAGUE] }));
        renderStep({ datapack: chosen });

        await waitFor(() => expect(cardFor('Colleague Pack')).toHaveAttribute('aria-checked', 'true'));
    });

    it('reads the catalog again when a setting it depends on changes', async () => {
        renderStep();
        await waitFor(() => expect(mockExecute).toHaveBeenCalledTimes(1));

        act(() => mockMessageHandlers.get('datapack-list-changed')?.(undefined));

        expect(mockExecute).toHaveBeenCalledTimes(2);
        expect(mockExecute).toHaveBeenLastCalledWith({ includeCommunity: true });
    });

    it('says a choice with nothing in it is empty, and keeps None to choose', async () => {
        renderStep();
        await screen.findAllByTestId('datapack-card');

        fireEvent.change(showSelect(), { target: { value: 'team' } });

        expect(await screen.findByText('No Team Datapacks. Choose another view.')).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'None' })).toBeInTheDocument();
    });
});

describe('SampleDataStep — the catalog request', () => {
    it('asks for the whole catalog, which the Show list narrows', async () => {
        renderStep();

        await waitFor(() => expect(mockExecute).toHaveBeenCalledTimes(1));
        expect(mockExecute).toHaveBeenCalledWith({ includeCommunity: true });
    });

    it('retries with the same request after a failure', async () => {
        setMockState(refusal('The Data Installer service is unreachable.'));
        renderStep();

        fireEvent.click(await screen.findByRole('button', { name: /retry/i }));

        await waitFor(() => expect(mockExecute).toHaveBeenCalledTimes(2));
        expect(mockExecute).toHaveBeenLastCalledWith({ includeCommunity: true });
    });

    it('fills the grid when the catalog lands after the first frame', async () => {
        setMockState(notYetAsked());
        const view = renderStep();
        expect(screen.queryByTestId('datapack-card')).not.toBeInTheDocument();

        setMockState(envelope(CATALOG));
        view.rerender(
            <SampleDataStep
                state={{} as WizardState}
                updateState={view.updateState}
                setCanProceed={jest.fn()}
            />
        );

        await waitFor(() => expect(screen.getAllByTestId('datapack-card')).toHaveLength(2));
    });
});

describe('SampleDataStep — the version on show', () => {
    it('shows the RECORDED version on the chosen pack, not the default', async () => {
        renderStep({ datapack: { name: 'bodea', version: 'hold' } } as Partial<WizardState>);

        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());
        expect(versionShownOn('Bodea')).toBe('hold');
        // The pack nobody chose still shows its own default.
        expect(versionShownOn('CitiSignal')).toBe('main');
    });

    it('records the version on show, not the one the card opened at', async () => {
        const { updateState } = renderStep();
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        fireEvent.change(versionSelect('Bodea'), { target: { value: 'hold' } });
        expect(versionShownOn('Bodea')).toBe('hold');
        // Browsing a version is not choosing a pack.
        expect(updateState).not.toHaveBeenCalled();

        fireEvent.click(cardFor('Bodea'));

        await waitFor(() =>
            expect(updateState).toHaveBeenCalledWith({
                datapack: { name: 'bodea', version: 'hold', store: 'installer' },
            })
        );
    });

    it('re-records the chosen pack the moment its version changes', async () => {
        const { updateState } = renderStep({
            datapack: { name: 'bodea', version: 'main' },
        } as Partial<WizardState>);
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        fireEvent.change(versionSelect('Bodea'), { target: { value: 'hold' } });

        await waitFor(() =>
            expect(updateState).toHaveBeenCalledWith({
                datapack: { name: 'bodea', version: 'hold', store: 'installer' },
            })
        );
    });

    it('records nothing when the version changes on a pack that is not the chosen one', async () => {
        const { updateState } = renderStep({
            datapack: { name: 'citisignal_new', version: 'main' },
        } as Partial<WizardState>);
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        fireEvent.change(versionSelect('Bodea'), { target: { value: 'hold' } });

        expect(updateState).not.toHaveBeenCalled();
        expect(versionShownOn('Bodea')).toBe('hold');
    });
});

/**
 * The wizard hands a fresh `updateState` down whenever its own state moves, so
 * every handler here has to write through the one it currently holds. A handler
 * memoised without it keeps calling the updater from the render it was made in,
 * and the write lands nowhere the wizard is looking.
 */
describe('SampleDataStep — writing through the CURRENT updater', () => {
    /** Re-render with a second updater and hand it back. */
    function swapUpdater(
        view: ReturnType<typeof renderStep>,
        state: Partial<WizardState>
    ): jest.Mock {
        const next = jest.fn();
        view.rerender(
            <SampleDataStep
                state={state as WizardState}
                updateState={next}
                setCanProceed={jest.fn()}
            />
        );
        return next;
    }

    it('clears through the current updater', async () => {
        const view = renderStep({
            datapack: { name: 'bodea', version: 'main' },
        } as Partial<WizardState>);
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());
        const next = swapUpdater(view, { datapack: { name: 'bodea', version: 'main' } });

        fireEvent.click(screen.getByRole('radio', { name: 'None' }));

        await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
        const cleared = next.mock.calls[0][0] as Record<string, unknown>;
        // The key must be PRESENT and undefined — an empty object leaves the old
        // choice in place, and `toHaveBeenCalledWith` cannot tell the two apart.
        expect(Object.prototype.hasOwnProperty.call(cleared, 'datapack')).toBe(true);
        expect(cleared.datapack).toBeUndefined();
        expect(view.updateState).not.toHaveBeenCalled();
    });

    it('chooses through the current updater', async () => {
        const view = renderStep();
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());
        const next = swapUpdater(view, {});

        fireEvent.click(cardFor('Bodea'));

        await waitFor(() =>
            expect(next).toHaveBeenCalledWith({ datapack: { name: 'bodea', version: 'main', store: 'installer' } })
        );
        expect(view.updateState).not.toHaveBeenCalled();
    });

    it('re-records a version change through the current updater', async () => {
        const chosen = { datapack: { name: 'bodea', version: 'main' } } as Partial<WizardState>;
        const view = renderStep(chosen);
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());
        const next = swapUpdater(view, chosen);

        fireEvent.change(versionSelect('Bodea'), { target: { value: 'hold' } });

        await waitFor(() =>
            expect(next).toHaveBeenCalledWith({ datapack: { name: 'bodea', version: 'hold', store: 'installer' } })
        );
        expect(view.updateState).not.toHaveBeenCalled();
    });
});

describe('SampleDataStep — the None card', () => {
    it('wears the selected class when nothing is chosen', async () => {
        renderStep();

        const none = await screen.findByRole('radio', { name: 'None' });
        expect(none).toHaveClass('sample-data-none');
        expect(none).toHaveClass('is-selected');
    });

    it('drops the selected class once a pack is chosen', async () => {
        renderStep({ datapack: { name: 'bodea', version: 'main' } } as Partial<WizardState>);

        const none = await screen.findByRole('radio', { name: 'None' });
        expect(none).toHaveClass('sample-data-none');
        expect(none).not.toHaveClass('is-selected');
    });
});

describe('SampleDataStep — the no-match note', () => {
    it('is absent when the grid has cards to show', async () => {
        renderStep();

        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());
        expect(screen.queryByText(/No datapacks match/i)).not.toBeInTheDocument();
    });

    it('stays absent while a query still matches something', async () => {
        renderStep();
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        fireEvent.change(screen.getByRole('searchbox', { name: /filter datapacks/i }), {
            target: { value: 'bodea' },
        });

        expect(cardFor('Bodea')).toBeInTheDocument();
        expect(screen.queryByText(/No datapacks match/i)).not.toBeInTheDocument();
    });

    // The panel matches on the id AND the display label; a pack whose label
    // shares no substring with its id is the only case that tells them apart.
    it('matches a display name that shares nothing with the id', async () => {
        setMockState(
            envelope({
                items: [
                    {
                        id: { name: 'acme_pack', version: 'main' },
                        displayName: 'Widget World',
                        shared: true,
                        dataTypes: [],
                        art: {},
                    },
                ],
                total: 1,
            })
        );
        renderStep();
        await waitFor(() => expect(cardFor('Widget World')).toBeInTheDocument());

        fireEvent.change(screen.getByRole('searchbox', { name: /filter datapacks/i }), {
            target: { value: 'Widget' },
        });

        expect(cardFor('Widget World')).toBeInTheDocument();
        expect(screen.queryByText(/No datapacks match/i)).not.toBeInTheDocument();
    });
});
