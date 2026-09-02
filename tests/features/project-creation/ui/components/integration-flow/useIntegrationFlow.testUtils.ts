/**
 * The harness both useIntegrationFlow suites build, and only that.
 *
 * Their `setup()` functions are genuinely different — the base suite takes a
 * mode, a mesh component, a catalog and a reserved-id set, and returns a `sync`
 * that re-renders; the api-edit suite takes an edit target and never re-renders.
 * Neither is a variant of the other and merging them would produce a helper with
 * an options bag nobody reads in full.
 *
 * What they DO share, identically, is the controlled-state harness underneath:
 * a mutable `stateRef`, an `updateState` that applies partials to it, and the
 * two builder callbacks. That is what lives here.
 *
 * `SIGNED_IN` is deliberately NOT here. Both suites define one and they carry
 * different fields — the api-edit suite's includes a project and a workspace
 * because its flow needs a committed destination. Sharing the name while the
 * content differs is how a fixture starts lying.
 */

import type { WizardState } from '@/types/webview';

/** The two `useProjectBuilder` handlers the flow finishes through. */
export interface FlowBuilderStub {
    onAppBuilderComponentToggle: jest.Mock;
    onAddCustomAppBuilderComponent: jest.Mock;
}

export interface FlowHarness {
    /** Mutable current state — `updateState` writes here, a re-render reads it. */
    stateRef: { current: WizardState };
    updateState: jest.Mock;
    builder: FlowBuilderStub;
    onClose: jest.Mock;
}

/**
 * A controlled WizardState plus the callbacks the hook writes through.
 *
 * `updateState` applies partials to `stateRef` rather than replacing it, which
 * is what lets a suite re-render the hook with everything the flow has written
 * so far — the wizard's reducer-and-re-render cycle, in miniature.
 *
 * @param base - the fields this flow needs on top of an empty wizard state
 */
export function makeFlowHarness(base: Partial<WizardState>): FlowHarness {
    const stateRef: { current: WizardState } = {
        current: {
            currentStep: 'build-your-project',
            projectName: '',
            selectedPackage: 'citisignal',
            selectedStack: 'headless-paas',
            ...base,
        } as WizardState,
    };
    const updateState = jest.fn((partial: Partial<WizardState>) => {
        stateRef.current = { ...stateRef.current, ...partial };
    });
    return {
        stateRef,
        updateState,
        builder: {
            onAppBuilderComponentToggle: jest.fn(),
            onAddCustomAppBuilderComponent: jest.fn(),
        },
        onClose: jest.fn(),
    };
}
