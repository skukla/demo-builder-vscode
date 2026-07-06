/**
 * integrationsSections tests — the Integrations area is TWO sub-steps:
 * Services (the deployable list) → Adobe I/O (the project/workspace gate).
 * Adobe I/O appears ONLY once a deployable is selected, so an empty Integrations area
 * is just "Services" and is skippable. The Continue/Finish gate lives on Adobe I/O:
 * complete unless a deployable is selected without a fully-chosen project + workspace
 * (signed in + project + a committed OR pending workspace). Services is always valid.
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
const PENDING = {
    adobeProject: { id: 'p' },
    pendingAdobeWorkspace: { id: 'w-pending' },
} as Partial<WizardState>;

describe('integrationsSections', () => {
    it('titles the two sub-steps (Services + Adobe I/O)', () => {
        expect(INTEGRATIONS_SECTION_TITLES).toEqual({
            deployables: 'Services',
            'adobe-io': 'Adobe I/O',
        });
    });

    describe('integrationsSectionStates', () => {
        it('is a single Services screen when nothing is selected (Adobe I/O hidden)', () => {
            expect(integrationsSectionStates(state({}))).toEqual([
                { id: 'deployables', status: 'done' },
            ]);
        });

        it('adds Adobe I/O (current) when a deployable is selected without a workspace', () => {
            expect(integrationsSectionStates(state({ ...MESH }))).toEqual([
                { id: 'deployables', status: 'done' },
                { id: 'adobe-io', status: 'current' },
            ]);
        });

        it('marks Adobe I/O done once the selected deployable has a full workspace', () => {
            expect(
                integrationsSectionStates(state({ ...MESH, ...SIGNED_IN, ...DESTINATION })),
            ).toEqual([
                { id: 'deployables', status: 'done' },
                { id: 'adobe-io', status: 'done' },
            ]);
        });

        it('marks Adobe I/O done on a PENDING (uncommitted) workspace too', () => {
            expect(
                integrationsSectionStates(state({ ...MESH, ...SIGNED_IN, ...PENDING })),
            ).toEqual([
                { id: 'deployables', status: 'done' },
                { id: 'adobe-io', status: 'done' },
            ]);
        });
    });

    describe('isIntegrationsStepComplete', () => {
        it('Services is always complete (deployables list is always valid)', () => {
            expect(isIntegrationsStepComplete(state({}), 'deployables')).toBe(true);
            expect(isIntegrationsStepComplete(state({ ...MESH }), 'deployables')).toBe(true);
        });

        it('Adobe I/O is complete when nothing is deployed (optional)', () => {
            expect(isIntegrationsStepComplete(state({}), 'adobe-io')).toBe(true);
        });

        it('Adobe I/O is incomplete when a deployable is selected but not signed in', () => {
            expect(
                isIntegrationsStepComplete(state({ ...MESH, ...DESTINATION }), 'adobe-io'),
            ).toBe(false);
        });

        it('Adobe I/O is incomplete when signed in but missing project or workspace', () => {
            expect(
                isIntegrationsStepComplete(state({ ...MESH, ...SIGNED_IN }), 'adobe-io'),
            ).toBe(false);
            expect(
                isIntegrationsStepComplete(
                    state({ ...MESH, ...SIGNED_IN, adobeProject: { id: 'p' } } as Partial<WizardState>),
                    'adobe-io',
                ),
            ).toBe(false);
        });

        it('Adobe I/O is complete with a COMMITTED project + workspace', () => {
            expect(
                isIntegrationsStepComplete(
                    state({ ...MESH, ...SIGNED_IN, ...DESTINATION }),
                    'adobe-io',
                ),
            ).toBe(true);
        });

        it('Adobe I/O is complete with a PENDING workspace (Continue enables while pending)', () => {
            expect(
                isIntegrationsStepComplete(state({ ...MESH, ...SIGNED_IN, ...PENDING }), 'adobe-io'),
            ).toBe(true);
        });
    });
});
