/**
 * integrationsSections tests — the Integrations area's sub-step model (Deployables ·
 * Deployment target), mirroring storefrontSections. The `target` sub-step is
 * conditional on a deployable being selected; deployables is always complete (optional).
 */

import {
    integrationsSectionStates,
    isIntegrationsStepComplete,
    INTEGRATIONS_SECTION_TITLES,
} from '@/features/project-creation/ui/steps/integrationsSections';
import type { WizardState } from '@/types/webview';

const state = (partial: Partial<WizardState>): WizardState => partial as WizardState;

describe('integrationsSections', () => {
    it('titles the two sub-steps', () => {
        expect(INTEGRATIONS_SECTION_TITLES).toEqual({
            deployables: 'Services',
            target: 'Destination',
        });
    });

    describe('integrationsSectionStates', () => {
        it('lists only deployables (done) when nothing is selected', () => {
            expect(integrationsSectionStates(state({}))).toEqual([
                { id: 'deployables', status: 'done' },
            ]);
        });

        it('adds target (current) once a deployable is selected', () => {
            const states = integrationsSectionStates(
                state({ selectedAppBuilderComponents: ['commerce-paas-mesh'] }),
            );
            expect(states).toEqual([
                { id: 'deployables', status: 'done' },
                { id: 'target', status: 'current' },
            ]);
        });

        it('marks target done once project + workspace are chosen', () => {
            const states = integrationsSectionStates(
                state({
                    selectedAppBuilderComponents: ['commerce-paas-mesh'],
                    adobeProject: { id: 'p' },
                    adobeWorkspace: { id: 'w' },
                } as Partial<WizardState>),
            );
            expect(states.map(s => s.status)).toEqual(['done', 'done']);
        });
    });

    describe('isIntegrationsStepComplete', () => {
        it('deployables is always complete (optional)', () => {
            expect(isIntegrationsStepComplete(state({}), 'deployables')).toBe(true);
        });

        it('target requires BOTH project and workspace', () => {
            expect(isIntegrationsStepComplete(state({}), 'target')).toBe(false);
            expect(
                isIntegrationsStepComplete(
                    state({ adobeProject: { id: 'p' } } as Partial<WizardState>),
                    'target',
                ),
            ).toBe(false);
            expect(
                isIntegrationsStepComplete(
                    state({
                        adobeProject: { id: 'p' },
                        adobeWorkspace: { id: 'w' },
                    } as Partial<WizardState>),
                    'target',
                ),
            ).toBe(true);
        });
    });
});
