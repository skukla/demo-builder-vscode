/**
 * Wizard Helpers Tests - Adobe Org Step (Phase 2)
 *
 * The org step (`adobe-org`) sits between auth and project. These tests lock the
 * backward-nav index math: navigating before the org step must clear adobeOrg +
 * organizationsCache (and, by cascade, project + workspace).
 */

import {
    getAdobeStepIndices,
    computeStateUpdatesForBackwardNav,
    WizardStepConfig,
} from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { WizardState } from '@/types/webview';

const wizardSteps: WizardStepConfig[] = [
    { id: 'adobe-auth', name: 'Auth' },
    { id: 'adobe-org', name: 'Organization' },
    { id: 'adobe-project', name: 'Project' },
    { id: 'adobe-workspace', name: 'Workspace' },
];

describe('wizardHelpers - adobe-org step', () => {
    describe('getAdobeStepIndices', () => {
        it('includes the org step index', () => {
            const result = getAdobeStepIndices(wizardSteps);
            expect(result.orgIndex).toBe(1);
            expect(result.projectIndex).toBe(2);
            expect(result.workspaceIndex).toBe(3);
        });

        it('returns -1 for a missing org step', () => {
            const result = getAdobeStepIndices([{ id: 'adobe-auth', name: 'Auth' }]);
            expect(result.orgIndex).toBe(-1);
        });
    });

    describe('computeStateUpdatesForBackwardNav - org clearing', () => {
        const indices = { orgIndex: 1, projectIndex: 2, workspaceIndex: 3 };

        const createState = (): WizardState => ({
            currentStep: 'adobe-workspace',
            projectName: 'test',
            adobeAuth: { isAuthenticated: true, isChecking: false },
            adobeOrg: { id: 'org-1', code: 'C1', name: 'Org 1' },
            adobeProject: { id: 'proj-1', name: 'Project 1' },
            adobeWorkspace: { id: 'ws-1', name: 'Workspace 1' },
            organizationsCache: [{ id: 'org-1', code: 'C1', name: 'Org 1' }],
            projectsCache: [{ id: 'proj-1', name: 'Project 1' }],
            workspacesCache: [{ id: 'ws-1', name: 'Workspace 1' }],
        });

        it('clears org + organizationsCache (and downstream) when going before the org step', () => {
            const state = createState();
            const result = computeStateUpdatesForBackwardNav(state, 'adobe-auth', 0, indices);
            expect(result.adobeOrg).toBeUndefined();
            expect(result.organizationsCache).toBeUndefined();
            // Cascade: project + workspace also cleared
            expect(result.adobeProject).toBeUndefined();
            expect(result.adobeWorkspace).toBeUndefined();
            expect(result.projectsCache).toBeUndefined();
            expect(result.workspacesCache).toBeUndefined();
        });

        it('does NOT clear org when navigating to the org step itself', () => {
            const state = createState();
            const result = computeStateUpdatesForBackwardNav(state, 'adobe-org', 1, indices);
            expect('adobeOrg' in result).toBe(false);
            expect('organizationsCache' in result).toBe(false);
        });

        it('clears project (not org) when going before the project step but at/after org', () => {
            const state = createState();
            const result = computeStateUpdatesForBackwardNav(state, 'adobe-org', 1, indices);
            expect(result.adobeProject).toBeUndefined();
            expect(result.projectsCache).toBeUndefined();
            // org is preserved
            expect('adobeOrg' in result).toBe(false);
        });
    });
});
