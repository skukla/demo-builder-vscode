/**
 * CommerceStep — what it WRITES, and what it re-derives.
 *
 * The two sibling suites render the step and read the DOM, which a memoised value
 * answers identically whether or not it is stale. This one asserts the two things
 * that reading the output cannot see:
 *
 *  1. The exact partial state each child callback produces. `updateState` merges
 *     what it is handed straight into wizard state, so a dropped field is a
 *     silently unset one — the Catalog step stays locked, or the store-discovery
 *     data the form already fetched never round-trips back on remount.
 *  2. That the derived values follow their inputs. An emptied dependency array
 *     compiles, renders, and is only wrong on the SECOND render — after the brand
 *     changes, after a stack is committed, after the wizard clears the active step.
 *
 * Shares the family harness; declares its own ConnectStoreStepContent stub because
 * this suite needs the callbacks the other two do not exercise.
 */

import './CommerceStep.testUtils';
import React from 'react';
import { fireEvent, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PAAS, ACCS, setup, stepView } from './commerceStepTestHarness';

jest.mock('@/features/project-creation/ui/components/ConnectStoreStepContent', () => ({
    ConnectStoreStepContent: (props: {
        selectedStackId: string;
        onComponentConfigsChange: (configs: Record<string, unknown>) => void;
        onValidationChange: (validity: { connection: boolean; catalog: boolean }) => void;
        onStoreDiscoveryDataChange: (data: unknown) => void;
        onStoreLoadingChange: (loading: boolean) => void;
    }) => (
        <div data-testid="connect-store-panel" data-stack-id={props.selectedStackId}>
            <button
                type="button"
                data-testid="start-loading"
                onClick={() => props.onStoreLoadingChange(true)}
            >
                loading
            </button>
            <button
                type="button"
                data-testid="found-stores"
                onClick={() => props.onStoreDiscoveryDataChange({ websites: ['base'] })}
            >
                found
            </button>
            <button
                type="button"
                data-testid="found-nothing"
                onClick={() => props.onStoreDiscoveryDataChange(null)}
            >
                nothing
            </button>
            <button
                type="button"
                data-testid="configs-with-view"
                onClick={() =>
                    props.onComponentConfigsChange({
                        'adobe-commerce': { ADOBE_COMMERCE_STORE_VIEW_CODE: 'default' },
                    })
                }
            >
                with view
            </button>
            <button
                type="button"
                data-testid="configs-without-view"
                onClick={() =>
                    props.onComponentConfigsChange({
                        'adobe-commerce': { ADOBE_COMMERCE_BASE_URL: 'https://x.test' },
                    })
                }
            >
                without view
            </button>
        </div>
    ),
}));

beforeEach(() => {
    jest.clearAllMocks();
});

/** State that puts the single ConnectStoreStepContent on screen. */
const onConnection = {
    selectedPackage: 'citisignal',
    selectedBackend: PAAS,
    activeCommerceStep: 'connection' as const,
};

const panel = () => screen.getByTestId('connect-store-panel');

describe('CommerceStep — what each child callback writes to wizard state', () => {
    it('records that store discovery has started', () => {
        // The Business Structure Continue gate reads this; without it the SC can
        // walk past a structure that has not loaded.
        const { updateState } = setup(onConnection);

        fireEvent.click(screen.getByTestId('start-loading'));

        expect(updateState).toHaveBeenCalledWith({ commerceStoreLoading: true });
    });

    it('round-trips the discovered store data back to wizard state', () => {
        // Switching config sub-steps REMOUNTS the form. It rehydrates from this
        // value, so dropping it turns every sub-step change into a re-fetch.
        const { updateState } = setup(onConnection);

        fireEvent.click(screen.getByTestId('found-stores'));

        expect(updateState).toHaveBeenCalledWith({
            storeDiscoveryData: { websites: ['base'] },
        });
    });

    it('clears the stored discovery data when the form reports none', () => {
        const { updateState } = setup(onConnection);

        fireEvent.click(screen.getByTestId('found-nothing'));

        expect(updateState).toHaveBeenCalledWith({ storeDiscoveryData: undefined });
    });

    it('marks the store view chosen when the configs carry one', () => {
        const { updateState } = setup(onConnection);

        fireEvent.click(screen.getByTestId('configs-with-view'));

        expect(updateState).toHaveBeenCalledWith({
            componentConfigs: { 'adobe-commerce': { ADOBE_COMMERCE_STORE_VIEW_CODE: 'default' } },
            commerceStoreViewChosen: true,
        });
    });

    it('does NOT mark the store view chosen when the configs carry none', () => {
        // Catalog unlocks off this flag. Setting it for any config write would
        // open Catalog before a store view has been picked.
        const { updateState } = setup(onConnection);

        fireEvent.click(screen.getByTestId('configs-without-view'));

        expect(updateState).toHaveBeenCalledWith({
            componentConfigs: { 'adobe-commerce': { ADOBE_COMMERCE_BASE_URL: 'https://x.test' } },
            commerceStoreViewChosen: false,
        });
    });
});

describe('CommerceStep — the stack the config form runs off', () => {
    it('uses the committed stack when there is one', () => {
        setup({ ...onConnection, selectedStack: 'headless-paas' });

        // Not the eds-preferred provisional id — the committed choice wins.
        expect(panel()).toHaveAttribute('data-stack-id', 'headless-paas');
    });

    it('falls back to the eds-preferred provisional stack when none is committed', () => {
        setup(onConnection);

        expect(panel()).toHaveAttribute('data-stack-id', 'eds-paas');
    });

    it('renders with no stack at all when the state names a brand the catalog lacks', () => {
        // Reachable from an older project file, or a catalog that dropped a brand.
        // Resolving a stack for a package that is not there must not crash the area.
        setup({
            selectedPackage: 'no-such-brand',
            selectedBackend: PAAS,
            activeCommerceStep: 'connection' as const,
        });

        expect(panel()).toHaveAttribute('data-stack-id', '');
    });
});

describe('CommerceStep — the brand name on an unavailable backend', () => {
    it('names the brand that cannot offer the backend', () => {
        // "Not available for BuildRight" is the whole point of the note; an empty
        // name leaves the SC reading "Not available for ".
        setup({ selectedPackage: 'buildright', activeCommerceStep: 'backend' as const });

        expect(screen.getByTestId(`backend-note-${ACCS}`)).toHaveTextContent('BuildRight');
    });
});

describe('CommerceStep — choosing a backend drops the downstream commitments', () => {
    it('clears the committed sub-steps on a unique backend', () => {
        // isle5 maps PaaS to exactly one stack.
        const { updateState } = setup({
            selectedPackage: 'isle5',
            activeCommerceStep: 'backend' as const,
        });

        fireEvent.click(screen.getByTestId(`backend-card-${PAAS}`));

        expect(updateState).toHaveBeenCalledWith({
            selectedBackend: PAAS,
            committedCommerceSteps: [],
        });
    });

    it('clears the committed sub-steps AND the stale stack on an ambiguous backend', () => {
        // citisignal maps PaaS to two stacks, so no stack is committed here.
        const { updateState } = setup({
            selectedPackage: 'citisignal',
            activeCommerceStep: 'backend' as const,
        });

        fireEvent.click(screen.getByTestId(`backend-card-${PAAS}`));

        expect(updateState).toHaveBeenCalledWith({
            selectedBackend: PAAS,
            selectedStack: undefined,
            commerceConnectValid: false,
            commerceStoreViewChosen: false,
            committedCommerceSteps: [],
        });
    });
});

/**
 * Everything below is about the SECOND render. Each of these values is memoised,
 * and a memo that lists the wrong inputs is indistinguishable from a correct one
 * until something it depends on changes.
 */
describe('CommerceStep — derived values follow their inputs', () => {
    /** Push a new state object from outside, as the wizard does. */
    const pushState = (
        harness: ReturnType<typeof setup>,
        partial: Record<string, unknown>
    ) => {
        harness.stateRef.current = { ...harness.stateRef.current, ...partial };
        harness.rerender();
    };

    it('re-reads the brand when the wizard switches package', () => {
        // buildright cannot offer ACCS; isle5 can. If either the package lookup or
        // the available-backend list is pinned to its first value, the ACCS card
        // keeps its "Not available" note after the switch.
        const harness = setup({
            selectedPackage: 'buildright',
            activeCommerceStep: 'backend' as const,
        });
        expect(screen.getByTestId(`backend-note-${ACCS}`)).toBeInTheDocument();

        pushState(harness, { selectedPackage: 'isle5' });

        expect(screen.queryByTestId(`backend-note-${ACCS}`)).not.toBeInTheDocument();
    });

    it('re-reads the config stack when a stack is committed', () => {
        const harness = setup(onConnection);
        expect(panel()).toHaveAttribute('data-stack-id', 'eds-paas');

        pushState(harness, { selectedStack: 'headless-paas' });

        expect(panel()).toHaveAttribute('data-stack-id', 'headless-paas');
    });

    it('re-seeds the active sub-step when the wizard clears it', () => {
        // The seeding effect is what stops the view following completion. It has to
        // fire again when the active step is cleared, not only on the first mount.
        const harness = setup({ ...onConnection, activeCommerceStep: 'catalog' as const });
        harness.updateState.mockClear();

        pushState(harness, { activeCommerceStep: undefined });

        expect(harness.updateState).toHaveBeenCalledWith({
            activeCommerceStep: expect.any(String),
        });
    });

    it('resolves the backend against the CURRENT brand, not the one it mounted with', () => {
        // citisignal makes PaaS ambiguous, isle5 makes it unique. A handler pinned to
        // the mounting brand would defer the stack for a brand that has exactly one.
        const harness = setup({
            selectedPackage: 'citisignal',
            activeCommerceStep: 'backend' as const,
        });
        pushState(harness, { selectedPackage: 'isle5' });
        harness.updateState.mockClear();

        act(() => {
            fireEvent.click(screen.getByTestId(`backend-card-${PAAS}`));
        });

        expect(harness.updateState).toHaveBeenCalledWith({
            selectedBackend: PAAS,
            committedCommerceSteps: [],
        });
    });
});

/** Guard: the dedicated view is what all of the above reads out of. */
describe('CommerceStep — the dedicated view exists', () => {
    it('renders the active step body inside the dedicated view', () => {
        setup(onConnection);

        expect(stepView()).toContainElement(panel());
    });
});
