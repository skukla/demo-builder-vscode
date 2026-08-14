/**
 * SampleDataStep — the Build-Your-Project area that records a datapack choice.
 *
 * The contract worth pinning is what it does NOT do: it must never start an
 * import. An import needs a reachable instance with working credentials and
 * runs for minutes; a failure inside project creation would leave a
 * half-populated instance the wizard has no story for. So the area writes the
 * choice to wizard state and the dashboard installs it later.
 *
 * Strict TDD: written BEFORE the component's behaviour was wired.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

beforeEach(() => {
    jest.clearAllMocks();
    mockTypes.length = 0;
    mockState = { loading: false, error: null, data: CATALOG };
});

describe('SampleDataStep', () => {
    it('offers each datapack NAME once, not each version', async () => {
        renderStep();

        await waitFor(() => expect(screen.getByRole('radio', { name: 'Bodea' })).toBeInTheDocument());
        expect(screen.getByRole('radio', { name: 'CitiSignal' })).toBeInTheDocument();
        // Three rows, two names — the second bodea version must not add a row.
        expect(screen.getAllByRole('radio')).toHaveLength(3); // None + 2 names
    });

    it('records the choice on wizard state', async () => {
        const { updateState } = renderStep();

        fireEvent.click(screen.getByRole('radio', { name: 'Bodea' }));

        await waitFor(() =>
            expect(updateState).toHaveBeenCalledWith({
                datapack: { name: 'bodea', version: 'main' },
            }),
        );
    });

    /** The whole point of the area: choosing must not write to an instance. */
    it('NEVER starts an import — it only reads the catalog', async () => {
        renderStep();

        fireEvent.click(screen.getByRole('radio', { name: 'Bodea' }));

        await waitFor(() => expect(mockTypes).toContain('find-datapacks'));
        expect(mockTypes).not.toContain('start-datapack-import');
        expect(mockTypes).not.toContain('validate-datapack-import');
        // The only request fired is the catalog read.
        expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it('clears the choice when None is picked', async () => {
        const { updateState } = renderStep({
            datapack: { name: 'bodea', version: 'main' },
        } as Partial<WizardState>);

        fireEvent.click(screen.getByRole('radio', { name: 'None' }));

        await waitFor(() => expect(updateState).toHaveBeenCalledWith({ datapack: undefined }));
    });

    it('marks the recorded choice as selected', async () => {
        renderStep({ datapack: { name: 'bodea', version: 'main' } } as Partial<WizardState>);

        await waitFor(() =>
            expect(screen.getByRole('radio', { name: 'Bodea' })).toHaveAttribute(
                'aria-checked',
                'true',
            ),
        );
        expect(screen.getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'false');
    });

    /** A catalog that cannot load must not block creating the project. */
    it('explains a failed catalog without offering a broken list', async () => {
        mockState = { loading: false, error: new Error('offline'), data: null };
        renderStep();

        await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument());
        expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    });
});
