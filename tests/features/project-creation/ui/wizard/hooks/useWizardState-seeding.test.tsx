/**
 * useWizardState — what the wizard opens with.
 *
 * The hook computes its whole initial state once, from three mutually exclusive
 * inputs: an edit project, imported settings, or neither. Each produces a
 * different EDS config (edit assumes the stored auth is unproven; import assumes
 * it is good), a different wizard mode, and a different Adobe context. These
 * tests pin all three.
 */

import type { ImportedSettings, WizardStepDefinition } from '@/types/wizard';
import { editProjectWith, renderWizard, stateFor } from './useWizardState.testUtils';

const FULL_EDS = {
    githubOwner: 'acme-org',
    repoName: 'acme-site',
    daLiveOrg: 'acme-da',
    daLiveSite: 'acme-site-da',
    repoUrl: 'https://github.com/acme-org/acme-site',
};

describe('edit mode seeds an EDS config whose auth is unproven', () => {
    it('carries the repo and site over, and marks both auth checks as still running', () => {
        const eds = stateFor({ editProject: editProjectWith({ edsConfig: FULL_EDS }) }).edsConfig;

        expect(eds).toEqual({
            accsHost: '',
            storeViewCode: '',
            customerGroup: '',
            repoName: 'acme-site',
            daLiveOrg: 'acme-da',
            daLiveSite: 'acme-site-da',
            githubAuth: {
                isAuthenticated: false,
                isChecking: true,
                user: { login: 'acme-org', email: null, name: null, avatarUrl: null },
            },
            daLiveAuth: { isAuthenticated: false, isChecking: true },
            repoUrl: 'https://github.com/acme-org/acme-site',
            repoMode: 'existing',
            selectedRepo: {
                id: 'acme-org/acme-site',
                name: 'acme-site',
                fullName: 'acme-org/acme-site',
                htmlUrl: 'https://github.com/acme-org/acme-site',
            },
            selectedSite: { id: 'acme-site-da', name: 'acme-site-da' },
        });
    });

    it('leaves the GitHub half unset when only the owner was stored', () => {
        const eds = stateFor({
            editProject: editProjectWith({ edsConfig: { githubOwner: 'acme-org' } }),
        }).edsConfig;

        expect(eds?.githubAuth).toBeUndefined();
        expect(eds?.selectedRepo).toBeUndefined();
        expect(eds?.repoMode).toBeUndefined();
        expect(eds?.repoName).toBe('');
    });

    it('leaves the GitHub half unset when only the repo was stored', () => {
        const eds = stateFor({
            editProject: editProjectWith({ edsConfig: { repoName: 'acme-site' } }),
        }).edsConfig;

        expect(eds?.githubAuth).toBeUndefined();
        expect(eds?.selectedRepo).toBeUndefined();
    });

    it('leaves the DA.live half unset when no org was stored', () => {
        const eds = stateFor({
            editProject: editProjectWith({
                edsConfig: { githubOwner: 'o', repoName: 'r', daLiveSite: 's' },
            }),
        }).edsConfig;

        expect(eds?.daLiveAuth).toBeUndefined();
        expect(eds?.daLiveOrg).toBe('');
        expect(eds?.selectedSite).toEqual({ id: 's', name: 's' });
    });

    it('leaves selectedSite unset when no site was stored', () => {
        const eds = stateFor({
            editProject: editProjectWith({ edsConfig: { daLiveOrg: 'acme-da' } }),
        }).edsConfig;

        expect(eds?.selectedSite).toBeUndefined();
        expect(eds?.daLiveSite).toBe('');
    });

    it('has no EDS config at all for a project that stored none', () => {
        expect(stateFor({ editProject: editProjectWith({}) }).edsConfig).toBeUndefined();
    });
});

describe('import mode seeds an EDS config whose auth is already good', () => {
    it('marks both sides authenticated and carries the DA.live org onto the auth', () => {
        const eds = stateFor({ importedSettings: { edsConfig: FULL_EDS } }).edsConfig;

        expect(eds).toEqual({
            accsHost: '',
            storeViewCode: '',
            customerGroup: '',
            repoName: 'acme-site',
            daLiveOrg: 'acme-da',
            daLiveSite: 'acme-site-da',
            githubAuth: {
                isAuthenticated: true,
                user: { login: 'acme-org', email: null, name: null, avatarUrl: null },
            },
            daLiveAuth: { isAuthenticated: true, org: 'acme-da' },
            repoUrl: 'https://github.com/acme-org/acme-site',
            repoMode: 'existing',
            selectedRepo: {
                id: 'acme-org/acme-site',
                name: 'acme-site',
                fullName: 'acme-org/acme-site',
                htmlUrl: 'https://github.com/acme-org/acme-site',
            },
            selectedSite: { id: 'acme-site-da', name: 'acme-site-da' },
        });
    });

    it('leaves the GitHub half unset when the repo is missing', () => {
        const eds = stateFor({
            importedSettings: { edsConfig: { githubOwner: 'acme-org', daLiveOrg: 'd' } },
        }).edsConfig;

        expect(eds?.githubAuth).toBeUndefined();
        expect(eds?.repoMode).toBeUndefined();
        expect(eds?.selectedRepo).toBeUndefined();
    });

    it('leaves the DA.live half unset when the org is missing', () => {
        const eds = stateFor({
            importedSettings: { edsConfig: { githubOwner: 'o', repoName: 'r' } },
        }).edsConfig;

        expect(eds?.daLiveAuth).toBeUndefined();
    });

    it('has no EDS config for an import that carried none', () => {
        expect(stateFor({ importedSettings: {} }).edsConfig).toBeUndefined();
    });
});

describe('the Adobe context an edit restores', () => {
    it('rebuilds org, project and workspace from the stored ids', () => {
        const state = stateFor({
            editProject: editProjectWith({
                adobe: {
                    orgId: 'org-1',
                    orgName: 'Acme Org',
                    projectId: 'proj-1',
                    projectName: 'acme-proj',
                    projectTitle: 'Acme Project',
                    workspaceId: 'ws-1',
                    workspaceName: 'stage',
                    workspaceTitle: 'Stage',
                },
            }),
        });

        expect(state.adobeOrg).toEqual({ id: 'org-1', code: '', name: 'Acme Org' });
        expect(state.adobeProject).toEqual({
            id: 'proj-1',
            name: 'acme-proj',
            title: 'Acme Project',
        });
        expect(state.adobeWorkspace).toEqual({ id: 'ws-1', name: 'stage', title: 'Stage' });
    });

    it('fills the display names with empty strings when only ids were stored', () => {
        const state = stateFor({
            editProject: editProjectWith({
                adobe: { orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-1' },
            }),
        });

        expect(state.adobeOrg).toEqual({ id: 'org-1', code: '', name: '' });
        expect(state.adobeProject).toEqual({ id: 'proj-1', name: '', title: undefined });
        expect(state.adobeWorkspace).toEqual({ id: 'ws-1', name: '', title: undefined });
    });

    it('leaves each part unset when its id is missing', () => {
        const state = stateFor({ editProject: editProjectWith({ adobe: {} }) });

        expect(state.adobeOrg).toBeUndefined();
        expect(state.adobeProject).toBeUndefined();
        expect(state.adobeWorkspace).toBeUndefined();
    });

    it('leaves each part unset when the project stored no Adobe context at all', () => {
        const state = stateFor({ editProject: editProjectWith({}) });

        expect(state.adobeOrg).toBeUndefined();
        expect(state.adobeProject).toBeUndefined();
        expect(state.adobeWorkspace).toBeUndefined();
    });

    it('treats an edit project as already authenticated with Adobe', () => {
        expect(stateFor({ editProject: editProjectWith({}) }).adobeAuth).toEqual({
            isAuthenticated: true,
            isChecking: false,
        });
    });

    it('rebuilds the Adobe context from imported settings too', () => {
        const state = stateFor({
            importedSettings: {
                adobe: { orgId: 'org-2', projectId: 'proj-2', workspaceId: 'ws-2' },
            },
        });

        expect(state.adobeOrg).toEqual({ id: 'org-2', code: '', name: '' });
        expect(state.adobeProject).toEqual({ id: 'proj-2', name: '', title: undefined });
        expect(state.adobeWorkspace).toEqual({ id: 'ws-2', name: '', title: undefined });
    });
});

describe('mode, name and selections', () => {
    it('opens in create mode with an empty name when nothing was handed in', () => {
        const state = stateFor({});

        expect(state.wizardMode).toBe('create');
        expect(state.projectName).toBe('');
        expect(state.adobeAuth).toEqual({ isAuthenticated: false, isChecking: false });
        expect(state.componentConfigs).toEqual({});
    });

    it('opens in import mode and takes the source project name', () => {
        const state = stateFor({ importedSettings: { source: { project: 'acme' } } });

        expect(state.wizardMode).toBe('import');
        expect(state.projectName).toBe('acme');
    });

    it('makes the imported name unique against the projects that already exist', () => {
        const state = stateFor({
            importedSettings: { source: { project: 'acme' } },
            existingProjectNames: ['acme'],
        });

        expect(state.projectName).toBe('acme-copy');
    });

    it('opens in edit mode carrying the project name, title and path', () => {
        const state = stateFor({ editProject: editProjectWith({}) });

        expect(state.wizardMode).toBe('edit');
        expect(state.projectName).toBe('edit-me');
        expect(state.projectTitle).toBe('Edit Me');
        expect(state.editProjectPath).toBe('/projects/edit-me');
        expect(state.editOriginalName).toBe('edit-me');
    });

    it('restores the backend selection so the Commerce cards open pre-selected', () => {
        const state = stateFor({
            editProject: editProjectWith({ selections: { backend: 'adobe-commerce-accs' } }),
        });

        expect(state.selectedBackend).toBe('adobe-commerce-accs');
        expect(state.components).toEqual({
            frontend: undefined,
            backend: 'adobe-commerce-accs',
            dependencies: [],
            integrations: [],
            appBuilder: [],
        });
    });

    it('keeps the lists an edit project stored, rather than replacing them with empties', () => {
        const state = stateFor({
            editProject: editProjectWith({
                selections: {
                    frontend: 'eds-storefront',
                    backend: 'adobe-commerce-paas',
                    dependencies: ['dep-a'],
                    integrations: ['int-a'],
                    appBuilder: ['app-a'],
                },
            }),
        });

        expect(state.components).toEqual({
            frontend: 'eds-storefront',
            backend: 'adobe-commerce-paas',
            dependencies: ['dep-a'],
            integrations: ['int-a'],
            appBuilder: ['app-a'],
        });
    });

    it('leaves components unset for an edit project that stored no selections', () => {
        expect(stateFor({ editProject: editProjectWith({}) }).components).toBeUndefined();
        expect(stateFor({ editProject: editProjectWith({}) }).selectedBackend).toBeUndefined();
    });

    it('takes the component defaults when creating with no import', () => {
        const defaults = {
            frontend: 'eds-storefront',
            backend: 'adobe-commerce-paas',
            dependencies: ['dep'],
            integrations: [],
            appBuilder: [],
        };

        expect(stateFor({ componentDefaults: defaults }).components).toEqual(defaults);
    });

    it('lets imported selections beat the component defaults', () => {
        const state = stateFor({
            componentDefaults: {
                frontend: 'default-frontend',
                backend: 'default-backend',
                dependencies: [],
                integrations: [],
                appBuilder: [],
            },
            importedSettings: { selections: { frontend: 'imported-frontend' } },
        });

        expect(state.components?.frontend).toBe('imported-frontend');
    });

    it('carries the package, stack, addons and block libraries through an import', () => {
        const state = stateFor({
            importedSettings: {
                selectedPackage: 'citisignal',
                selectedStack: 'eds-accs',
                selectedAddons: ['b2b'],
                selectedBlockLibraries: ['lib-a'],
                configs: { backend: { API_URL: 'https://api' } },
            } as ImportedSettings,
        });

        expect(state.selectedPackage).toBe('citisignal');
        expect(state.selectedStack).toBe('eds-accs');
        expect(state.selectedAddons).toEqual(['b2b']);
        expect(state.selectedBlockLibraries).toEqual(['lib-a']);
        expect(state.componentConfigs).toEqual({ backend: { API_URL: 'https://api' } });
    });

    it('carries the package, stack, addons and block libraries through an edit', () => {
        const state = stateFor({
            editProject: editProjectWith({
                selectedPackage: 'bodea',
                selectedStack: 'eds-paas',
                selectedAddons: ['pdp'],
                selectedBlockLibraries: ['lib-b'],
                configs: { backend: { API_URL: 'https://api' } },
            } as ImportedSettings),
        });

        expect(state.selectedPackage).toBe('bodea');
        expect(state.selectedStack).toBe('eds-paas');
        expect(state.selectedAddons).toEqual(['pdp']);
        expect(state.selectedBlockLibraries).toEqual(['lib-b']);
        expect(state.componentConfigs).toEqual({ backend: { API_URL: 'https://api' } });
    });

    it('starts componentConfigs empty for an edit project that stored none', () => {
        expect(stateFor({ editProject: editProjectWith({}) }).componentConfigs).toEqual({});
    });

    it('falls back to the flat API list when the keyed picks object is present but empty', () => {
        const state = stateFor({
            editProject: editProjectWith({
                componentApiPicks: {},
                additionalConsoleApis: ['CCAPI'],
            }),
        });

        expect(state.selectedConsoleApis).toEqual({ __existing__: ['CCAPI'] });
    });

    it('starts on the first enabled step', () => {
        const { result } = renderWizard({
            wizardSteps: [
                { id: 'welcome', name: 'Welcome', enabled: false },
                { id: 'build-your-project', name: 'Build', enabled: true },
            ] as WizardStepDefinition[],
        });

        expect(result.current.state.currentStep).toBe('build-your-project');
    });
});
