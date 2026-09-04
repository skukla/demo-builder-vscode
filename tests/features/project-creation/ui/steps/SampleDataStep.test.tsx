/**
 * SampleDataStep — the Commerce sub-step that records a datapack choice.
 *
 * The contract worth pinning is what it does NOT do: it must never start an
 * import. An import needs a reachable instance with working credentials and
 * runs for minutes; a failure inside project creation would leave a
 * half-populated instance the wizard has no story for. So it writes the choice
 * to wizard state and the dashboard installs it later.
 *
 * This suite covers the grid, the failure treatments, filtering, loading and
 * copy. Choosing a pack and its version lives in the -choosing suite. The mock
 * preamble, fixtures and helpers are shared through SampleDataStep.testUtils.
 */

import { screen, fireEvent, waitFor, within } from '@testing-library/react';

import {
    mockExecute,
    mockPostMessage,
    mockTypes,
    pending,
    notYetAsked,
    refusal,
    notConfigured,
    renderStep,
    cardFor,
    setMockState,
    resetDataInstallerMocks,
} from './SampleDataStep.testUtils';
import type { WizardState } from '@/types/webview';

beforeEach(resetDataInstallerMocks);

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
            })
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
        expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute(
            'aria-checked',
            'false'
        );
    });

    /** The group is never blank: None carries the mark when nothing else does. */
    it('marks None when no pack is chosen', async () => {
        renderStep();

        await waitFor(() =>
            expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute(
                'aria-checked',
                'true'
            )
        );
    });

    /** A catalog that cannot load must not block creating the project. */
    it('explains a failed catalog without offering a broken list', async () => {
        setMockState(refusal('The Data Installer service is unreachable.'));
        renderStep();

        await waitFor(() =>
            expect(
                screen.getByText(/The Data Installer service is unreachable\./i)
            ).toBeInTheDocument()
        );
        expect(screen.queryByTestId('datapack-card')).not.toBeInTheDocument();
    });

    /**
     * The reason this step failed for a colleague on 2026-08-18: nobody but the
     * author has `demoBuilder.dataInstaller.apiBaseUrl` set (it ships with no
     * default, deliberately — the repo is public). The step must say so and hand
     * her the setting, not report a generic failure.
     */
    describe('when the Data Installer has never been configured', () => {
        it('names the setting that is missing', async () => {
            setMockState(notConfigured());
            renderStep();

            // findAllBy: the handler's own message names the key and the shared
            // renderer's detail line names it again. Both are legitimate.
            expect(
                (await screen.findAllByText(/demoBuilder\.dataInstaller\.apiBaseUrl/)).length
            ).toBeGreaterThan(0);
        });

        it('offers a button that opens the setting', async () => {
            setMockState(notConfigured());
            renderStep();

            const open = await screen.findByRole('button', { name: /open settings/i });
            fireEvent.click(open);

            expect(mockPostMessage).toHaveBeenCalledWith('open-data-installer-settings');
        });

        /**
         * The copy used to end "You can still create this project and choose
         * sample data later from the dashboard." The dashboard tile is hidden by
         * the SAME predicate that produced this refusal, so the sentence was
         * false exactly when it was shown — it sent the user to a door that had
         * been removed.
         */
        it('does not promise a dashboard route that this same condition hides', async () => {
            setMockState(notConfigured());
            renderStep();

            await screen.findAllByText(/demoBuilder\.dataInstaller\.apiBaseUrl/);
            expect(screen.queryByText(/from the dashboard/i)).not.toBeInTheDocument();
        });

        /** A reachability failure is not a settings problem — no false fix. */
        it('offers no settings button for a failure configuration cannot fix', async () => {
            setMockState(refusal('The Data Installer service is unreachable.'));
            renderStep();

            await waitFor(() => expect(screen.getByText(/unreachable/i)).toBeInTheDocument());
            expect(
                screen.queryByRole('button', { name: /open settings/i })
            ).not.toBeInTheDocument();
        });
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
        const field = screen.getByRole('searchbox', { name: /filter datapacks/i });
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

        expect(screen.getByText(/no datapacks match/i)).toBeInTheDocument();
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

/**
 * While the catalog is in flight the grid is not "empty", it is unknown.
 *
 * Rendering the None card and an empty grid during the fetch says "there is no
 * sample data" for as long as the request takes — the same false-empty the step
 * showed for its whole broken life. A spinner says "not yet".
 */
describe('SampleDataStep — loading', () => {
    it('shows a spinner instead of the grid while the catalog loads', () => {
        setMockState(pending());
        renderStep();

        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.queryByTestId('datapack-card')).not.toBeInTheDocument();
        expect(screen.queryByRole('radio', { name: 'None' })).not.toBeInTheDocument();
    });

    /** The filter cannot act on a list that has not arrived. */
    it('withholds the filter until there is something to filter', () => {
        setMockState(pending());
        renderStep();

        expect(
            screen.queryByRole('searchbox', { name: /filter datapacks/i })
        ).not.toBeInTheDocument();
    });

    /**
     * The blip, reported 2026-08-20: for one frame the grid rendered before the
     * spinner did.
     *
     * The branch asked `loading`, which is false until the useEffect fires —
     * i.e. until after the first paint. So the first frame had nothing loading
     * and nothing loaded, fell past the spinner, and drew the empty grid. It
     * asks `!settled` now: has anything actually come back?
     */
    it('shows the spinner on the FIRST frame, before the fetch has even started', () => {
        setMockState(notYetAsked());
        renderStep();

        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.queryByRole('radio', { name: 'None' })).not.toBeInTheDocument();
    });

    it('replaces the spinner with the grid once the catalog lands', async () => {
        renderStep();

        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    /** A failure is not a permanent spinner. */
    it('shows the reason rather than spinning forever when the catalog fails', () => {
        setMockState(refusal('The Data Installer service is unreachable.'));
        renderStep();

        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        expect(screen.getByText(/unreachable/i)).toBeInTheDocument();
    });
});

describe('SampleDataStep — copy', () => {
    /**
     * The intro explained the wizard's own mechanics — that nothing installs
     * now, that the dashboard does it later. The sub-step is titled Sample Data
     * and sits in the Commerce rail; the paragraph restated what the surface
     * already says and pushed the grid below the fold.
     */
    it('carries no explanatory intro paragraph', async () => {
        renderStep();
        await waitFor(() => expect(cardFor('Bodea')).toBeInTheDocument());

        expect(screen.queryByText(/nothing is installed now/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/seed this project/i)).not.toBeInTheDocument();
    });
});
