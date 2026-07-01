/**
 * integrationsSections tests — the Integrations area is a SINGLE screen ("Services").
 * The former `signin`/`target` sub-steps are dissolved into the mesh card (which expands
 * inline to host its Adobe I/O destination), so only `deployables` remains and the
 * Continue/Finish gate lives on it: complete unless a deployable is selected without a
 * fully-chosen destination (signed in + project + workspace).
 */

import {
    integrationsSectionStates,
    isIntegrationsStepComplete,
    INTEGRATIONS_SECTION_TITLES,
} from '@/features/project-creation/ui/steps/integrationsSections';
import type { WizardState } from '@/types/webview';

const state = (partial: Partial<WizardState>): WizardState => partial as WizardState;

const MESH = { selectedAppBuilderComponents: ['commerce-paas-mesh'] };
const SIGNED_IN = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: { id: 'o', name: 'Acme' },
} as unknown as Partial<WizardState>;
const DESTINATION = {
    adobeProject: { id: 'p' },
    adobeWorkspace: { id: 'w' },
} as Partial<WizardState>;

describe('integrationsSections', () => {
    it('titles the single Services sub-step', () => {
        expect(INTEGRATIONS_SECTION_TITLES).toEqual({ deployables: 'Services' });
    });

    describe('integrationsSectionStates', () => {
        it('is a single deployables screen — done when nothing is selected', () => {
            expect(integrationsSectionStates(state({}))).toEqual([
                { id: 'deployables', status: 'done' },
            ]);
        });

        it('is current (not done) when a deployable is selected without a destination', () => {
            expect(integrationsSectionStates(state({ ...MESH }))).toEqual([
                { id: 'deployables', status: 'current' },
            ]);
        });

        it('is done once the selected deployable has a full destination', () => {
            expect(
                integrationsSectionStates(state({ ...MESH, ...SIGNED_IN, ...DESTINATION })),
            ).toEqual([{ id: 'deployables', status: 'done' }]);
        });
    });

    describe('isIntegrationsStepComplete (deployables gate)', () => {
        it('is complete when nothing is deployed (optional)', () => {
            expect(isIntegrationsStepComplete(state({}), 'deployables')).toBe(true);
        });

        it('is incomplete when a deployable is selected but not signed in', () => {
            expect(isIntegrationsStepComplete(state({ ...MESH, ...DESTINATION }), 'deployables')).toBe(
                false,
            );
        });

        it('is incomplete when signed in but missing project or workspace', () => {
            expect(
                isIntegrationsStepComplete(state({ ...MESH, ...SIGNED_IN }), 'deployables'),
            ).toBe(false);
            expect(
                isIntegrationsStepComplete(
                    state({ ...MESH, ...SIGNED_IN, adobeProject: { id: 'p' } } as Partial<WizardState>),
                    'deployables',
                ),
            ).toBe(false);
        });

        it('is complete when a deployable has signed-in + project + workspace', () => {
            expect(
                isIntegrationsStepComplete(
                    state({ ...MESH, ...SIGNED_IN, ...DESTINATION }),
                    'deployables',
                ),
            ).toBe(true);
        });
    });
});
