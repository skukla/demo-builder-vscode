/**
 * CommerceStep Tests — rendering / step list / active-view / gate / summary
 * (Project Builder — vertical step list + dedicated view)
 *
 * The Commerce area renders its BODY — a [list | view] row with a
 * {@link VerticalStepList} (Backend · [Sign in] · Connection · Business Structure ·
 * Catalog) beside a dedicated view showing the ACTIVE step's body (the single
 * {@link ConnectStoreStepContent} instance for config steps). The harness renders the
 * unified BuildYourProjectSummary alongside it (as BuildYourProjectStep does) so the
 * `.sum-*` summary DOM is present for the summary-architecture assertions.
 *
 * This file covers the layout/step list, active-view switching, the ACCS sign-in
 * gate + locked tabs, the summary architecture label, and the dedicated-view content +
 * persistence passthrough. The Backend→stack bridge (selection/commit/security guard,
 * save & continue, continue gate) lives in CommerceStep.bridge.test.tsx.
 *
 * The shared harness (child mocks, fixtures, setup, DOM helpers) lives in
 * ./commerceStepTestHarness. jest.mock is hoisted per file, so the module factories are
 * declared here and delegate to the harness's exported mock factories.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    ACCS_STORE_VIEW_CODE,
    PAAS_STORE_VIEW_CODE,
} from '@/features/components/config/envVarKeys';
import type { ComponentConfigs, WizardState } from '@/types/webview';
import {
    PAAS,
    ACCS,
    setup,
    stepTab,
    isLocked,
    stepView,
    architectureLine,
} from './commerceStepTestHarness';

// ---------------------------------------------------------------------------
// Mocks (jest.mock is hoisted to the top of THIS file, above the harness import,
// so the factory bodies must be self-contained — no imported bindings). Services
// consumed by useProjectBuilder are stubbed so the real hook runs; the child
// stubs surface the props the step wires.
// ---------------------------------------------------------------------------

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn(), request: jest.fn(), onMessage: jest.fn(() => jest.fn()) },
}));

jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getAvailableBlockLibraries: jest.fn(() => []),
    getNativeBlockLibraries: jest.fn(() => []),
    getDefaultBlockLibraryIds: jest.fn(() => []),
    getPackageDefaultBlockLibraryIds: jest.fn(() => []),
}));

jest.mock('@/features/components/services/demoPackageLoader', () => ({
    // Default: mesh NOT required (non-mesh package) → optional deps reset to [].
    getResolvedMeshRequirement: jest.fn(() => false),
}));

jest.mock('@/features/project-creation/ui/components/ConnectStoreStepContent', () => ({
    ConnectStoreStepContent: (props: {
        section?: string;
        selectedStackId: string;
        componentConfigs: Record<string, unknown>;
        storeDiscoveryData?: unknown;
        onValidationChange: (valid: boolean) => void;
        onComponentConfigsChange: (configs: Record<string, unknown>) => void;
    }) => (
        <div
            data-testid="connect-store-panel"
            data-section={props.section ?? ''}
            data-stack-id={props.selectedStackId}
            data-has-store-discovery={props.storeDiscoveryData ? 'yes' : 'no'}
            data-config-keys={Object.keys(props.componentConfigs ?? {}).join(',')}
        >
            <button
                type="button"
                data-testid="connect-valid"
                onClick={() => props.onValidationChange(true)}
            >
                mark valid
            </button>
            <button
                type="button"
                data-testid="choose-store-view"
                onClick={() =>
                    props.onComponentConfigsChange({
                        'adobe-commerce': { ADOBE_COMMERCE_STORE_VIEW_CODE: 'default' },
                    })
                }
            >
                choose store view
            </button>
        </div>
    ),
}));

jest.mock('@/features/authentication/ui/steps/AdobeAuthStep', () => ({
    AdobeAuthStep: (props: { setCanProceed: (v: boolean) => void }) => (
        <div data-testid="adobe-auth-panel">
            <button type="button" data-testid="auth-noop" onClick={() => props.setCanProceed(true)}>
                ping setCanProceed
            </button>
        </div>
    ),
}));

beforeEach(() => {
    jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommerceStep (v7 tabs + dedicated views)', () => {
    describe('layout', () => {
        it('should render the vertical step list and the summary column', () => {
            setup();
            expect(document.querySelector('.vsteplist')).toBeInTheDocument();
            expect(document.querySelector('.sum-title')).toBeInTheDocument();
        });

        it('should render the "Commerce" area label above the step list', () => {
            setup();
            // The area label tells the user which area they configure now that the
            // area sub-nav left the wizard timeline. Queried by text (not class) so it
            // asserts the rendered label, not an implementation detail. There is a
            // "Commerce" exact-text node that sits BEFORE the step list in DOM order.
            const list = document.querySelector('.vsteplist');
            expect(list).toBeInTheDocument();
            const label = screen
                .getAllByText('Commerce')
                .find(
                    (el) =>
                        (el.compareDocumentPosition(list as Node) &
                            Node.DOCUMENT_POSITION_FOLLOWING) !==
                        0
                );
            expect(label).toBeTruthy();
        });

        it('should render every commerce step as a step button', () => {
            setup();
            expect(stepTab('backend')).toBeInTheDocument();
            expect(stepTab('connection')).toBeInTheDocument();
            expect(stepTab('business-structure')).toBeInTheDocument();
            expect(stepTab('catalog')).toBeInTheDocument();
        });

        it('should show the backend step active first (its body in the dedicated view)', () => {
            setup();
            expect(stepTab('backend')).toHaveAttribute('aria-selected', 'true');
            expect(stepView()).toContainElement(screen.getByTestId('backend-cards'));
        });
    });

    // The per-step view header was removed — the sub-step nav strip names the
    // active step, so there's no heading/description in the view body anymore.

    describe('backend cards (availability per package)', () => {
        it('should enable both PaaS and ACCS for citisignal', () => {
            setup();
            expect(screen.getByTestId(`backend-card-${PAAS}`)).not.toBeDisabled();
            expect(screen.getByTestId(`backend-card-${ACCS}`)).not.toBeDisabled();
        });

        it('should disable ACCS for buildright (PaaS only)', () => {
            setup({ selectedPackage: 'buildright' });
            expect(screen.getByTestId(`backend-card-${PAAS}`)).not.toBeDisabled();
            expect(screen.getByTestId(`backend-card-${ACCS}`)).toBeDisabled();
        });

        it('should show a "Not available" note on the disabled ACCS card for buildright', () => {
            setup({ selectedPackage: 'buildright' });
            expect(screen.getByTestId(`backend-note-${ACCS}`)).toHaveTextContent(/not available/i);
        });

        it('should render a check affordance only on the selected backend card', () => {
            // Seed a committed ACCS stack, then re-open the Backend tab (committed stack
            // opens a config step first) so both cards render with ACCS selected —
            // only the selected card shows the check.
            setup({ selectedBackend: ACCS, selectedStack: 'eds-accs' });
            fireEvent.click(stepTab('backend'));
            const cards = screen.getByTestId('backend-cards');
            const checks = cards.querySelectorAll('[data-testid="backend-card-check"]');
            expect(checks).toHaveLength(1);
            expect(screen.getByTestId(`backend-card-${ACCS}`)).toContainElement(
                checks[0] as HTMLElement
            );
            expect(
                screen
                    .getByTestId(`backend-card-${PAAS}`)
                    .querySelector('[data-testid="backend-card-check"]')
            ).toBeNull();
        });
    });

    describe('summary architecture label', () => {
        it('should show the committed stack name when a full stack is selected', () => {
            setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
            });
            expect(architectureLine()).toHaveTextContent('Edge Delivery + PaaS');
        });

        it('should show the pending placeholder when nothing is chosen', () => {
            setup();
            expect(architectureLine()).toHaveTextContent(/architecture pending/i);
        });
    });

    describe('summary — commit gating (✓ only after Continue, not on mere validity)', () => {
        // "Business" is the summary label (the step list says "Business Structure"),
        // so getByText('Business') unambiguously targets the summary row.
        const businessRow = () => screen.getByText('Business').closest('.sum-row');

        const validState: Partial<WizardState> = {
            selectedPackage: 'buildright',
            selectedBackend: PAAS,
            selectedStack: 'eds-paas',
            commerceConnectValid: true,
            commerceStoreViewChosen: true,
            componentConfigs: {
                'adobe-commerce': { [PAAS_STORE_VIEW_CODE]: 'default' },
            } as unknown as ComponentConfigs,
        };

        it('keeps a VALID-but-uncommitted Business row at "Not set"', () => {
            setup({ ...validState, committedCommerceSteps: [] });
            expect(businessRow()).toHaveTextContent(/not set/i);
            expect(businessRow()).not.toHaveClass('done');
        });

        it('shows ✓ + the general "Selected" value once Business is committed', () => {
            setup({
                ...validState,
                committedCommerceSteps: ['connection', 'business-structure'],
            });
            expect(businessRow()).toHaveTextContent('Selected');
            expect(businessRow()).toHaveClass('done');
        });
    });

    describe('dedicated view — active step content + persistence passthrough', () => {
        it('should render the config form in the dedicated view when a config step is active', () => {
            setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
            });
            const panel = screen.getByTestId('connect-store-panel');
            // The committed PaaS stack opens connection first → the form fills the view.
            expect(stepView()).toContainElement(panel);
            expect(panel).toHaveAttribute('data-section', 'connection');
        });

        it('should switch the active view + flip the section when another config tab is clicked', () => {
            // Connection + business done (store view chosen) so business-structure is a
            // REACHED tab the user can click BACK to — the active step opens on catalog.
            setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
                commerceConnectValid: true,
                commerceStoreViewChosen: true,
            });
            fireEvent.click(stepTab('business-structure'));
            const panel = screen.getByTestId('connect-store-panel');
            expect(stepView()).toContainElement(panel);
            expect(panel).toHaveAttribute('data-section', 'business-structure');
            // Only the single active step's body renders — backend cards are gone.
            expect(screen.queryByTestId('backend-cards')).not.toBeInTheDocument();
        });

        it('should keep passing persisted props so a remount rehydrates (no re-fetch)', () => {
            const storeDiscoveryData = {
                websites: [],
            } as unknown as WizardState['storeDiscoveryData'];
            const componentConfigs = {
                'adobe-commerce': { [PAAS_STORE_VIEW_CODE]: 'default' },
            } as unknown as ComponentConfigs;
            setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
                storeDiscoveryData,
                componentConfigs,
                // Connection + business done so business-structure is a REACHED tab the
                // user can click BACK to. With everything configured the area now
                // opens on Sample Data — the only sub-step not yet addressed — so
                // this names the config step it is actually about.
                commerceConnectValid: true,
                commerceStoreViewChosen: true,
            });
            fireEvent.click(stepTab('catalog'));
            // Persisted store structure + configs reach the active config panel.
            expect(screen.getByTestId('connect-store-panel')).toHaveAttribute(
                'data-has-store-discovery',
                'yes'
            );
            fireEvent.click(stepTab('business-structure'));
            // After the step switch (remount), the SAME persisted props are passed
            // back in — so the rehydrated panel will not re-fetch store discovery.
            const panel = screen.getByTestId('connect-store-panel');
            expect(panel).toHaveAttribute('data-has-store-discovery', 'yes');
            expect(panel).toHaveAttribute('data-config-keys', 'adobe-commerce');
        });
    });

    describe('ACCS sign-in gate', () => {
        it('should show the signin step (AdobeAuthStep) when ACCS is chosen and not signed in', () => {
            setup({ selectedBackend: ACCS, selectedStack: 'eds-accs' });
            expect(stepView()).toContainElement(screen.getByTestId('adobe-auth-panel'));
        });

        it('should lock connection/business/catalog tabs with a sign-in reason when gated', () => {
            setup({ selectedBackend: ACCS, selectedStack: 'eds-accs' });
            expect(isLocked('connection')).toBe(true);
            expect(isLocked('catalog')).toBe(true);
            expect(stepTab('connection')).toHaveAttribute(
                'title',
                expect.stringMatching(/sign in to adobe/i)
            );
        });

        it('should not switch the active view when a locked config tab is clicked', () => {
            setup({ selectedBackend: ACCS, selectedStack: 'eds-accs' });
            // signin is active first (gated). Clicking the locked connection tab is a no-op.
            fireEvent.click(stepTab('connection'));
            expect(stepView()).toContainElement(screen.getByTestId('adobe-auth-panel'));
            expect(screen.queryByTestId('connect-store-panel')).not.toBeInTheDocument();
        });

        it('should hand a no-op setCanProceed to the AdobeAuthStep (the step owns the gate)', () => {
            const { setCanProceed } = setup({ selectedBackend: ACCS, selectedStack: 'eds-accs' });
            const callsBefore = setCanProceed.mock.calls.length;
            fireEvent.click(screen.getByTestId('auth-noop'));
            // The auth body's setCanProceed is a NOOP — it must not reach the gate.
            expect(setCanProceed.mock.calls.length).toBe(callsBefore);
        });

        it('should STAY on the pinned signin step when the user signs in (no skip)', () => {
            // PM F5: the active sub-step is PINNED to wizard state, so signing in must
            // keep the sign-in step active (showing AdobeAuthStep's "Connected" result)
            // — it must NOT jump to Connection on its own. Only the footer Continue moves it.
            const { rerender, stateRef } = setup({
                selectedBackend: ACCS,
                selectedStack: 'eds-accs',
                activeCommerceStep: 'signin',
            });
            expect(screen.getByTestId('adobe-auth-panel')).toBeInTheDocument();
            act(() => {
                stateRef.current = {
                    ...stateRef.current,
                    adobeAuth: { isAuthenticated: true, isChecking: false },
                    adobeOrg: { id: 'org-1', name: 'Org One', code: 'ORG1' },
                } as WizardState;
            });
            rerender();
            // STILL on the sign-in step — the auth panel remains and Connection has NOT
            // taken over the view.
            expect(screen.getByTestId('adobe-auth-panel')).toBeInTheDocument();
            expect(screen.queryByTestId('connect-store-panel')).not.toBeInTheDocument();
        });

        it('should NOT jump to Connection on sign-in when entered via the default path (F5 repro)', () => {
            // Default path: user picks ACCS on Backend (activeCommerceStep UNSET). The
            // seeding effect pins it to the first openable = signin. Signing in must then
            // STAY on signin (showing the result), NOT skip to Connection.
            const { rerender, stateRef } = setup({
                selectedBackend: ACCS,
                selectedStack: 'eds-accs',
            });
            // Seeded to signin (first openable while gated) → auth panel shows.
            expect(screen.getByTestId('adobe-auth-panel')).toBeInTheDocument();
            act(() => {
                stateRef.current = {
                    ...stateRef.current,
                    adobeAuth: { isAuthenticated: true, isChecking: false },
                    adobeOrg: { id: 'org-1', name: 'Org One', code: 'ORG1' },
                } as WizardState;
            });
            rerender();
            // STILL on signin — no implicit jump to Connection.
            expect(screen.getByTestId('adobe-auth-panel')).toBeInTheDocument();
            expect(screen.queryByTestId('connect-store-panel')).not.toBeInTheDocument();
        });

        it('should seed activeCommerceStep to the first openable step on mount when unset', () => {
            // Fresh state (no backend, activeCommerceStep unset) → the seeding effect
            // pins the active sub-step ONCE to the first openable (backend), so later
            // completion changes can no longer move it via the derived fallback.
            const { updateState } = setup({ selectedPackage: 'citisignal' });
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ activeCommerceStep: 'backend' })
            );
        });

        it('should NOT re-seed activeCommerceStep when it is already set', () => {
            // With activeCommerceStep already pinned, the seeding effect is a no-op —
            // it must not overwrite the user's / footer's chosen sub-step.
            const { updateState } = setup({
                selectedBackend: ACCS,
                selectedStack: 'eds-accs',
                activeCommerceStep: 'signin',
            });
            const seededCalls = updateState.mock.calls.filter(([partial]) =>
                Object.prototype.hasOwnProperty.call(partial, 'activeCommerceStep')
            );
            expect(seededCalls).toHaveLength(0);
        });

        it('should keep the active sub-step from state.activeCommerceStep when set', () => {
            // Signed-in ACCS with the active sub-step pinned to business-structure and
            // connection done → the displayed body is business-structure, derived from
            // state (not from any auto-advance effect).
            setup({
                selectedBackend: ACCS,
                selectedStack: 'eds-accs',
                adobeAuth: { isAuthenticated: true, isChecking: false },
                adobeOrg: { id: 'org-1', name: 'Org One', code: 'ORG1' },
                commerceConnectValid: true,
                activeCommerceStep: 'business-structure',
            });
            expect(screen.getByTestId('connect-store-panel')).toHaveAttribute(
                'data-section',
                'business-structure'
            );
        });
    });

    describe('store-view keys guard', () => {
        it('should reuse the shared ACCS/PaaS store-view keys', () => {
            expect(ACCS_STORE_VIEW_CODE).toBe('ACCS_STORE_VIEW_CODE');
            expect(PAAS_STORE_VIEW_CODE).toBe('ADOBE_COMMERCE_STORE_VIEW_CODE');
        });
    });
});
