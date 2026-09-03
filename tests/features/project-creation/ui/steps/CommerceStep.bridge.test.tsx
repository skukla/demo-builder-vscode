/**
 * CommerceStep Tests — Backend→stack bridge (Project Builder v7)
 *
 * Backend selection drives the architecture: a UNIQUE backend→stack mapping commits
 * the stack via useProjectBuilder.onStackSelect (preserving the mesh reconciliation);
 * an AMBIGUOUS one (>1 frontend) persists `selectedBackend` only and shows "Frontend
 * pending", while still driving the single ConnectStoreStepContent from a provisional
 * (eds-preferred) stack id.
 *
 * This file covers backend selection (unique commit / ambiguous persist), the
 * committed-unique→ambiguous security guard (stale-config clearing), the selected
 * backend-card `data-selected` assertion, save & continue / lock advancement, and the
 * continue gate (isCommerceConfigured). Rendering/layout/gate/summary tests live in
 * CommerceStep.test.tsx.
 *
 * The shared harness (child mocks, fixtures, setup, DOM helpers) lives in
 * ./commerceStepTestHarness. jest.mock is hoisted per file, so the module factories are
 * declared here and delegate to the harness's exported mock factories.
 *
 */

import './CommerceStep.testUtils';
import React from 'react';
import { screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { isCommerceConfigured } from '@/features/project-creation/ui/steps/tileStatus';
import { COMPONENT_IDS } from '@/core/constants';
import type { WizardState } from '@/types/webview';
import { PAAS, ACCS, setup, stepTab, isLocked, architectureLine } from './commerceStepTestHarness';

// ---------------------------------------------------------------------------
// Mocks (jest.mock is hoisted to the top of THIS file, above the harness import,
// so the factory bodies must be self-contained — no imported bindings). Services
// consumed by useProjectBuilder are stubbed so the real hook runs; the child
// stubs surface the props the step wires.
// ---------------------------------------------------------------------------

jest.mock('@/features/project-creation/ui/components/ConnectStoreStepContent', () => ({
    ConnectStoreStepContent: (props: {
        section?: string;
        selectedStackId: string;
        componentConfigs: Record<string, unknown>;
        storeDiscoveryData?: unknown;
        onValidationChange: (validity: Record<string, boolean>) => void;
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
                onClick={() =>
                    props.onValidationChange({
                        connection: true,
                        'business-structure': true,
                        catalog: true,
                    })
                }
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

beforeEach(() => {
    jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommerceStep — Backend→stack bridge (v7)', () => {
    describe('backend cards (selection marker)', () => {
        it('should mark the selected backend card with data-selected="true" (others "false")', () => {
            setup({ selectedBackend: ACCS, selectedStack: 'eds-accs' });
            // Re-open Backend (a committed stack opens a config step first).
            fireEvent.click(stepTab('backend'));
            expect(screen.getByTestId(`backend-card-${ACCS}`)).toHaveAttribute(
                'data-selected',
                'true'
            );
            expect(screen.getByTestId(`backend-card-${PAAS}`)).toHaveAttribute(
                'data-selected',
                'false'
            );
        });
    });

    describe('backend selection — unique mapping', () => {
        it('should commit eds-accs (unique) for citisignal + ACCS via onStackSelect', () => {
            const { updateState } = setup();
            fireEvent.click(screen.getByTestId(`backend-card-${ACCS}`));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedStack: 'eds-accs' })
            );
        });

        it('should commit eds-paas (unique) for buildright + PaaS via onStackSelect', () => {
            const { updateState } = setup({ selectedPackage: 'buildright' });
            fireEvent.click(screen.getByTestId(`backend-card-${PAAS}`));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedStack: 'eds-paas' })
            );
        });

        it('should commit eds-accs (unique) for isle5 + ACCS via onStackSelect', () => {
            const { updateState } = setup({ selectedPackage: 'isle5' });
            fireEvent.click(screen.getByTestId(`backend-card-${ACCS}`));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedStack: 'eds-accs' })
            );
        });

        it('should persist selectedBackend on a unique pick', () => {
            const { updateState } = setup({ selectedPackage: 'buildright' });
            fireEvent.click(screen.getByTestId(`backend-card-${PAAS}`));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedBackend: PAAS })
            );
        });

        it('should strip a stale mesh selection for a non-mesh package on a unique pick', () => {
            const { updateState } = setup({
                selectedPackage: 'buildright',
                selectedAppBuilderComponents: [COMPONENT_IDS.EDS_COMMERCE_MESH],
            });
            fireEvent.click(screen.getByTestId(`backend-card-${PAAS}`));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedAppBuilderComponents: [] })
            );
        });
    });

    describe('backend selection — ambiguous mapping (citisignal + PaaS)', () => {
        it('should persist selectedBackend without committing selectedStack', () => {
            const { updateState } = setup();
            fireEvent.click(screen.getByTestId(`backend-card-${PAAS}`));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedBackend: PAAS })
            );
            // The ambiguous branch may CLEAR selectedStack (defense-in-depth) but must
            // never COMMIT a real stack id while the frontend is still pending.
            const committedRealStack = updateState.mock.calls.some(([partial]) =>
                Boolean(partial.selectedStack)
            );
            expect(committedRealStack).toBe(false);
        });

        it('should show "Frontend pending" in the summary for an ambiguous backend', () => {
            const { rerender } = setup();
            fireEvent.click(screen.getByTestId(`backend-card-${PAAS}`));
            rerender();
            expect(architectureLine()).toHaveTextContent(/frontend pending/i);
        });

        it('should drive ConnectStoreStepContent from the provisional eds-paas stack id', () => {
            const { rerender } = setup({ selectedBackend: PAAS });
            rerender();
            // Open the connection step to expose the config form (backend is active first).
            fireEvent.click(stepTab('connection'));
            expect(screen.getByTestId('connect-store-panel')).toHaveAttribute(
                'data-stack-id',
                'eds-paas'
            );
        });
    });

    describe('backend switch — committed-unique → ambiguous clears stale config (defense-in-depth)', () => {
        // Start already at a committed UNIQUE ACCS state (eds-accs) with the connection
        // verdict + a store view persisted, signed in so the config steps are open.
        // Switching to PaaS (ambiguous for citisignal) must NOT leave the prior stack +
        // validity verdicts in place — that would keep isCommerceConfigured true and show
        // a committed architecture even though the frontend is now pending and the config
        // steps are re-locked behind the provisional flow.
        const committedAccs: Partial<WizardState> = {
            selectedPackage: 'citisignal',
            selectedBackend: ACCS,
            selectedStack: 'eds-accs',
            adobeAuth: { isAuthenticated: true, isChecking: false },
            adobeOrg: { id: 'org-1', name: 'Org One', code: 'ORG1' },
            commerceConnectValid: true,
            commerceStoreViewChosen: true,
        };

        // The committed state opens a config step first, so re-open Backend to expose
        // its cards before switching backend.
        const switchToPaas = (): void => {
            fireEvent.click(stepTab('backend'));
            fireEvent.click(screen.getByTestId(`backend-card-${PAAS}`));
        };

        it('should clear selectedStack when switching to an ambiguous backend', () => {
            const { updateState } = setup(committedAccs);
            switchToPaas();
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedStack: undefined })
            );
        });

        it('should clear commerceConnectValid + commerceStoreViewChosen on the ambiguous switch', () => {
            const { updateState } = setup(committedAccs);
            switchToPaas();
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    commerceConnectValid: false,
                    commerceStoreViewChosen: false,
                })
            );
        });

        it('should keep selectedBackend set to the newly chosen ambiguous backend', () => {
            const { stateRef } = setup(committedAccs);
            switchToPaas();
            expect(stateRef.current.selectedBackend).toBe(PAAS);
        });

        it('should leave isCommerceConfigured false after the ambiguous switch', () => {
            const { stateRef } = setup(committedAccs);
            switchToPaas();
            expect(isCommerceConfigured(stateRef.current)).toBe(false);
        });

        it('should show "Frontend pending" (no stale committed stack) after the switch', () => {
            const { rerender } = setup(committedAccs);
            switchToPaas();
            rerender();
            expect(architectureLine()).toHaveTextContent(/frontend pending/i);
        });
    });

    describe('config steps — validity / locks (footer Continue advances)', () => {
        it('should default the active config step to connection for a committed PaaS stack', () => {
            setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
            });
            expect(screen.getByTestId('connect-store-panel')).toHaveAttribute(
                'data-section',
                'connection'
            );
        });

        it('should NOT render an in-body "Save & continue" CTA on a config step', () => {
            // The footer Continue (WizardContainer) advances the sub-step now; the
            // config body renders only the form, no in-body advance button.
            setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
            });
            expect(
                screen.queryByRole('button', { name: /save & continue/i })
            ).not.toBeInTheDocument();
        });

        it('should render the active config sub-step body from state.activeCommerceStep', () => {
            // The active sub-step is lifted to wizard state; pinning it to
            // business-structure (connection done) shows that body directly.
            setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
                commerceConnectValid: true,
                activeCommerceStep: 'business-structure',
            });
            expect(screen.getByTestId('connect-store-panel')).toHaveAttribute(
                'data-section',
                'business-structure'
            );
        });

        it('persists the per-section verdicts the connect panel reports', () => {
            // One whole-form boolean gating both Connection and Catalog is what
            // deadlocked PaaS; the panel now answers per sub-step.
            const { updateState } = setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
            });
            fireEvent.click(screen.getByTestId('connect-valid'));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    commerceConnectValid: true,
                    commerceCatalogValid: true,
                })
            );
        });

        it('should persist commerceStoreViewChosen when a store-view code becomes present', () => {
            // Connection done → business-structure is the first OPEN step (active), so
            // its body renders without needing to click ahead to a not-yet-reached tab.
            const { updateState } = setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
                commerceConnectValid: true,
            });
            expect(stepTab('business-structure')).toHaveAttribute('aria-selected', 'true');
            fireEvent.click(screen.getByTestId('choose-store-view'));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ commerceStoreViewChosen: true })
            );
        });

        it('should keep the catalog tab locked until a store view is chosen', () => {
            // Connection done so the lock is on the store view (not the connection chain).
            setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
                commerceConnectValid: true,
            });
            expect(isLocked('catalog')).toBe(true);
            expect(stepTab('catalog')).toHaveAttribute(
                'title',
                expect.stringMatching(/store view/i)
            );
        });

        it('should keep the catalog tab locked until connection is done (chain)', () => {
            // A store view chosen but no connection → catalog stays locked on the
            // connection, not the store view (config-step chain).
            setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
                commerceStoreViewChosen: true,
            });
            expect(isLocked('catalog')).toBe(true);
            expect(stepTab('catalog')).toHaveAttribute('title', expect.stringMatching(/connect/i));
        });

        it('should unlock the catalog tab once connection is done and a store view is chosen', () => {
            setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
                commerceConnectValid: true,
                commerceStoreViewChosen: true,
            });
            expect(isLocked('catalog')).toBe(false);
        });

        it('should NOT auto-advance to catalog when a store view is chosen (footer drives it)', () => {
            // Connection done → business-structure is the first OPEN (active) step, so
            // its store-view control renders. Choosing a store view persists the flag
            // (unlocking catalog) but must NOT auto-advance — the active sub-step stays
            // on business-structure until the footer Continue moves it.
            // Pin the active sub-step to business-structure so the derivation can't
            // move it — proving there is no auto-advance EFFECT (only the footer moves it).
            const { rerender } = setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
                commerceConnectValid: true,
                activeCommerceStep: 'business-structure',
            });
            expect(stepTab('business-structure')).toHaveAttribute('aria-selected', 'true');
            act(() => {
                fireEvent.click(screen.getByTestId('choose-store-view'));
            });
            rerender();
            expect(screen.getByTestId('connect-store-panel')).toHaveAttribute(
                'data-section',
                'business-structure'
            );
            // Catalog is now unlocked (reachable) even though we stayed put.
            expect(isLocked('catalog')).toBe(false);
        });
    });

    describe('continue gate (isCommerceConfigured)', () => {
        it('should be false when a stack exists but connect is not valid', () => {
            const { setCanProceed } = setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
            });
            expect(setCanProceed).toHaveBeenLastCalledWith(false);
        });

        it('should be true when a stack is selected AND commerceConnectValid is true', () => {
            const { setCanProceed } = setup({
                selectedPackage: 'buildright',
                selectedBackend: PAAS,
                selectedStack: 'eds-paas',
                commerceConnectValid: true,
            });
            expect(setCanProceed).toHaveBeenLastCalledWith(true);
        });
    });
});
