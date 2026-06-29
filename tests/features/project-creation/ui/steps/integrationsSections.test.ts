/**
 * integrationsSections tests — the Integrations area's sub-step model (Services · [Sign in]
 * · Destination), mirroring storefrontSections. `signin`/`target` are conditional on a
 * deployable being selected; `signin` is further conditional on a non-ACCS backend (ACCS
 * signs in at Commerce). `deployables` is always complete (optional).
 */

import {
    integrationsSectionStates,
    isIntegrationsStepComplete,
    INTEGRATIONS_SECTION_TITLES,
} from '@/features/project-creation/ui/steps/integrationsSections';
import type { WizardState } from '@/types/webview';

const state = (partial: Partial<WizardState>): WizardState => partial as WizardState;

const ACCS = 'adobe-commerce-accs';
const PAAS = 'adobe-commerce-paas';
const MESH = { selectedAppBuilderComponents: ['commerce-paas-mesh'] };
const SIGNED_IN = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: { id: 'o', name: 'Acme' },
} as unknown as Partial<WizardState>;

describe('integrationsSections', () => {
    it('titles the three sub-steps', () => {
        expect(INTEGRATIONS_SECTION_TITLES).toEqual({
            deployables: 'Services',
            signin: 'Sign in',
            target: 'Destination',
        });
    });

    describe('integrationsSectionStates', () => {
        it('lists only deployables (done) when nothing is selected', () => {
            expect(integrationsSectionStates(state({}))).toEqual([
                { id: 'deployables', status: 'done' },
            ]);
        });

        it('PaaS: adds Sign in + target once a deployable is selected', () => {
            const states = integrationsSectionStates(state({ ...MESH, selectedBackend: PAAS }));
            expect(states.map(s => s.id)).toEqual(['deployables', 'signin', 'target']);
            // deployables done; signin current (not signed in); target locked.
            expect(states.map(s => s.status)).toEqual(['done', 'current', 'locked']);
        });

        it('ACCS: adds only target (no Sign in — signed in at Commerce)', () => {
            const states = integrationsSectionStates(state({ ...MESH, selectedBackend: ACCS }));
            expect(states.map(s => s.id)).toEqual(['deployables', 'target']);
        });

        it('PaaS: signin done once signed in, target then current', () => {
            const states = integrationsSectionStates(
                state({ ...MESH, selectedBackend: PAAS, ...SIGNED_IN }),
            );
            expect(states.map(s => s.status)).toEqual(['done', 'done', 'current']);
        });

        it('marks target done once project + workspace are chosen (ACCS)', () => {
            const states = integrationsSectionStates(
                state({
                    ...MESH,
                    selectedBackend: ACCS,
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

        it('signin requires a signed-in Adobe session', () => {
            expect(isIntegrationsStepComplete(state({}), 'signin')).toBe(false);
            expect(isIntegrationsStepComplete(state({ ...SIGNED_IN }), 'signin')).toBe(true);
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
