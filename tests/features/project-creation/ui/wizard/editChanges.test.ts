/**
 * editChanges — did the SC change anything in this Edit? (PL-75)
 *
 * When nothing changed, the storefront step is skipped and Finish only saves. So
 * the two mistakes that matter are different in cost: calling a real change
 * "unchanged" drops it, calling screen-only state a change only costs the rebuild
 * that always ran. These pin both directions.
 */

import {
    editChoicesOf,
    isEditUnchanged,
} from '@/features/project-creation/ui/wizard/editChanges';
import { buildProjectConfig } from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { WizardState } from '@/types/webview';

/** An Edit as it opens: the project's choices, and its baseline taken from them. */
function opened(overrides: Partial<WizardState> = {}): WizardState {
    const state: WizardState = {
        currentStep: 'welcome',
        projectName: 'justrite',
        projectTitle: 'Justrite',
        wizardMode: 'edit',
        adobeAuth: { isAuthenticated: true, isChecking: false },
        selectedPackage: 'justrite',
        selectedStack: 'eds-accs',
        selectedBackend: 'adobe-commerce-accs',
        selectedAppBuilderComponents: ['erp-integration'],
        selectedBlockLibraries: ['demo-builder-blocks'],
        datapack: { name: 'justrite', version: '1.0.0' },
        adobeOrg: { id: 'org-1', code: '', name: 'Acme' },
        adobeProject: { id: 'proj-1', name: 'Kukla Justrite' },
        adobeWorkspace: { id: 'ws-1', name: 'Stage' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_STORE_VIEW_CODE: 'default' } },
        edsConfig: {
            repoName: 'kukla-justrite',
            repoMode: 'existing',
            selectedRepo: {
                id: 'me/kukla-justrite',
                name: 'kukla-justrite',
                fullName: 'me/kukla-justrite',
                htmlUrl: 'https://github.com/me/kukla-justrite',
            },
            daLiveOrg: 'me',
            daLiveSite: 'kukla-justrite',
        },
        ...overrides,
    };
    return { ...state, editBaseline: editChoicesOf(state) };
}

describe('isEditUnchanged — nothing the SC chose has changed', () => {
    it('is true for the Edit exactly as it opened', () => {
        expect(isEditUnchanged(opened())).toBe(true);
    });

    it('ignores what only the screen holds: the step, sign-ins, caches, verdicts', () => {
        const state = opened();
        const moved: WizardState = {
            ...state,
            currentStep: 'review',
            activeBuildArea: 'integrations',
            commerceConnectValid: true,
            projectsCache: [{ id: 'proj-1', name: 'Kukla Justrite' }],
            apiMesh: { isChecking: false, apiEnabled: true, meshExists: true },
            edsConfig: {
                ...state.edsConfig!,
                githubAuth: { isAuthenticated: true, isChecking: false },
                templateOwner: 'hlxsites',
                patches: ['pdp-sku'],
            },
        };

        expect(isEditUnchanged(moved)).toBe(true);
    });

    it('reads an Adobe entity, repo or site by its id, not by a refetched name', () => {
        const state = opened();
        const refetched: WizardState = {
            ...state,
            adobeProject: { id: 'proj-1', name: 'Renamed in the Console', title: 'Renamed' },
            edsConfig: {
                ...state.edsConfig!,
                selectedRepo: {
                    id: 'me/kukla-justrite',
                    name: 'kukla-justrite',
                    fullName: 'me/kukla-justrite',
                    htmlUrl: 'https://github.com/me/kukla-justrite',
                    description: 'Refetched by the picker',
                    updatedAt: '2026-10-13T00:00:00Z',
                },
            },
        };

        expect(isEditUnchanged(refetched)).toBe(true);
    });

    it('reads an empty list the project never had as no change', () => {
        expect(isEditUnchanged({ ...opened(), selectedAddons: [] })).toBe(true);
    });

    it('reads "do not reset" the same whether it is false or unset', () => {
        const state = opened();
        const pickerSetFalse: WizardState = {
            ...state,
            edsConfig: { ...state.edsConfig!, resetToTemplate: false, resetSiteContent: false },
        };

        expect(isEditUnchanged(pickerSetFalse)).toBe(true);
    });
});

describe('isEditUnchanged — a change the SC made', () => {
    const changes: Array<[string, (s: WizardState) => Partial<WizardState>]> = [
        ['the demo package', () => ({ selectedPackage: 'citisignal' })],
        ['the backend', () => ({ selectedBackend: 'adobe-commerce-paas' })],
        ['an integration added', () => ({ selectedAppBuilderComponents: ['erp-integration', 'mesh'] })],
        ['an integration removed', () => ({ selectedAppBuilderComponents: [] })],
        ['the datapack', () => ({ datapack: { name: 'citisignal', version: '1.0.0' } })],
        ['the Adobe workspace', () => ({ adobeWorkspace: { id: 'ws-2', name: 'Production' } })],
        ['a setting', () => ({ componentConfigs: { 'adobe-commerce-accs': { ACCS_STORE_VIEW_CODE: 'b2b' } } })],
        ['the storefront reset', (s) => ({ edsConfig: { ...s.edsConfig!, resetToTemplate: true } })],
        [
            'another repository',
            (s) => ({
                edsConfig: {
                    ...s.edsConfig!,
                    selectedRepo: {
                        id: 'me/other',
                        name: 'other',
                        fullName: 'me/other',
                        htmlUrl: 'https://github.com/me/other',
                    },
                },
            }),
        ],
    ];

    it.each(changes)('is false when %s changed', (_what, change) => {
        const state = opened();

        expect(isEditUnchanged({ ...state, ...change(state) })).toBe(false);
    });
});

describe('isEditUnchanged — outside an Edit', () => {
    it('is false when creating, whatever the state', () => {
        expect(isEditUnchanged({ ...opened(), wizardMode: 'create' })).toBe(false);
    });

    it('is false for an Edit with no baseline, so it falls back to the full Finish', () => {
        expect(isEditUnchanged({ ...opened(), editBaseline: undefined })).toBe(false);
    });
});

describe('what Finish is told', () => {
    it('says an unchanged Edit is unchanged, so the extension only saves', () => {
        expect(buildProjectConfig(opened()).editUnchanged).toBe(true);
    });

    it('says nothing once the SC changed a choice, so the full Finish runs', () => {
        const changed = { ...opened(), datapack: { name: 'citisignal', version: '1.0.0' } };

        expect(buildProjectConfig(changed)).not.toHaveProperty('editUnchanged');
    });

    it('says nothing when creating', () => {
        expect(buildProjectConfig({ ...opened(), wizardMode: 'create' })).not.toHaveProperty(
            'editUnchanged',
        );
    });
});
