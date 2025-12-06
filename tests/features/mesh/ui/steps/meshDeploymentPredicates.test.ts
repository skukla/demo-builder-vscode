/**
 * Tests for mesh deployment step predicates (SOP §10 compliance)
 * Step 3: Create Mesh Deployment Predicates
 *
 * Extracts state logic into testable predicate functions for clean UI rendering.
 */

import {
    isDeploymentActive,
    canShowRecoveryOptions,
    isDeploymentSuccess,
    isDeploymentTerminal,
} from '@/features/mesh/ui/steps/meshDeploymentPredicates';
import { MeshDeploymentState } from '@/features/mesh/ui/steps/meshDeploymentTypes';

describe('Mesh Deployment Predicates', () => {
    // Helper to create minimal state with given status
    const createState = (
        status: MeshDeploymentState['status'],
        overrides?: Partial<MeshDeploymentState>
    ): MeshDeploymentState => ({
        status,
        attempt: 1,
        maxAttempts: 16,
        elapsedSeconds: 0,
        message: 'Test message',
        ...overrides,
    });

    describe('isDeploymentActive', () => {
        it('returns true for deploying status', () => {
            const state = createState('deploying');

            expect(isDeploymentActive(state)).toBe(true);
        });

        it('returns true for verifying status', () => {
            const state = createState('verifying');

            expect(isDeploymentActive(state)).toBe(true);
        });

        it('returns false for timeout status', () => {
            const state = createState('timeout');

            expect(isDeploymentActive(state)).toBe(false);
        });

        it('returns false for success status', () => {
            const state = createState('success');

            expect(isDeploymentActive(state)).toBe(false);
        });

        it('returns false for error status', () => {
            const state = createState('error');

            expect(isDeploymentActive(state)).toBe(false);
        });
    });

    describe('canShowRecoveryOptions', () => {
        it('returns true for timeout status', () => {
            const state = createState('timeout');

            expect(canShowRecoveryOptions(state)).toBe(true);
        });

        it('returns true for error status', () => {
            const state = createState('error');

            expect(canShowRecoveryOptions(state)).toBe(true);
        });

        it('returns false for deploying status', () => {
            const state = createState('deploying');

            expect(canShowRecoveryOptions(state)).toBe(false);
        });

        it('returns false for verifying status', () => {
            const state = createState('verifying');

            expect(canShowRecoveryOptions(state)).toBe(false);
        });

        it('returns false for success status', () => {
            const state = createState('success');

            expect(canShowRecoveryOptions(state)).toBe(false);
        });
    });

    describe('isDeploymentSuccess', () => {
        it('returns true for success status', () => {
            const state = createState('success', {
                meshId: 'mesh-123',
                endpoint: 'https://graph.adobe.io/...',
            });

            expect(isDeploymentSuccess(state)).toBe(true);
        });

        it('returns false for deploying status', () => {
            const state = createState('deploying');

            expect(isDeploymentSuccess(state)).toBe(false);
        });

        it('returns false for timeout status', () => {
            const state = createState('timeout');

            expect(isDeploymentSuccess(state)).toBe(false);
        });

        it('returns false for error status', () => {
            const state = createState('error');

            expect(isDeploymentSuccess(state)).toBe(false);
        });
    });

    describe('isDeploymentTerminal', () => {
        it('returns true for success status', () => {
            const state = createState('success');

            expect(isDeploymentTerminal(state)).toBe(true);
        });

        it('returns true for timeout status', () => {
            const state = createState('timeout');

            expect(isDeploymentTerminal(state)).toBe(true);
        });

        it('returns true for error status', () => {
            const state = createState('error');

            expect(isDeploymentTerminal(state)).toBe(true);
        });

        it('returns false for deploying status', () => {
            const state = createState('deploying');

            expect(isDeploymentTerminal(state)).toBe(false);
        });

        it('returns false for verifying status', () => {
            const state = createState('verifying');

            expect(isDeploymentTerminal(state)).toBe(false);
        });
    });

    describe('Predicate consistency', () => {
        it('active and terminal states are mutually exclusive', () => {
            const allStates: MeshDeploymentState['status'][] = [
                'deploying',
                'verifying',
                'timeout',
                'success',
                'error',
            ];

            for (const status of allStates) {
                const state = createState(status);
                const isActive = isDeploymentActive(state);
                const isTerminal = isDeploymentTerminal(state);

                // A state cannot be both active and terminal
                expect(isActive && isTerminal).toBe(false);

                // A state must be either active or terminal
                expect(isActive || isTerminal).toBe(true);
            }
        });

        it('recovery options only shown for terminal non-success states', () => {
            const allStates: MeshDeploymentState['status'][] = [
                'deploying',
                'verifying',
                'timeout',
                'success',
                'error',
            ];

            for (const status of allStates) {
                const state = createState(status);
                const canRecover = canShowRecoveryOptions(state);
                const isSuccess = isDeploymentSuccess(state);
                const isTerminal = isDeploymentTerminal(state);

                // Recovery is only for terminal non-success states
                if (canRecover) {
                    expect(isTerminal).toBe(true);
                    expect(isSuccess).toBe(false);
                }
            }
        });
    });
});
