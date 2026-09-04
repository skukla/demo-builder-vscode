/**
 * The wizard helpers nothing was driving: the custom-block-library
 * reconciliation, the wizard title, the backward-navigation clear, the Adobe
 * context rebuilt from an import, and the corners of `buildProjectConfig` that
 * decide what actually reaches the extension.
 *
 * `filterRemovedCustomLibraries` had never been called at all. It is the
 * function that stops a project keeping a block library the SC has since
 * deleted from their VS Code settings, and it compares by owner/repo — not by
 * name — which is exactly the kind of decision a test has to pin.
 */

import {
    buildProjectConfig,
    computeStateUpdatesForBackwardNav,
    filterRemovedCustomLibraries,
    filterStepsByComponents,
    getEnabledWizardSteps,
    getNextButtonText,
    getWizardTitle,
    initializeAdobeContextFromImport,
} from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { DemoPackage } from '@/types/demoPackages';
import type { WizardState } from '@/types/webview';
import type { ImportedSettings } from '@/types/wizard';

const library = (name: string, owner: string, repo: string): CustomBlockLibrary => ({
    name,
    source: { owner, repo, branch: 'main' },
});

const NEUTRAL_AUTH: WizardState['adobeAuth'] = { isAuthenticated: false, isChecking: false };

describe('filterRemovedCustomLibraries', () => {
    it('should return an empty list when nothing was selected', () => {
        expect(filterRemovedCustomLibraries(undefined, [library('A', 'acme', 'a')])).toEqual([]);
        expect(filterRemovedCustomLibraries([], [library('A', 'acme', 'a')])).toEqual([]);
    });

    it('should keep every selection when the settings list is absent', () => {
        const selected = [library('A', 'acme', 'a')];

        expect(filterRemovedCustomLibraries(selected, undefined)).toBe(selected);
    });

    it('should drop every selection when the settings list is empty', () => {
        expect(filterRemovedCustomLibraries([library('A', 'acme', 'a')], [])).toEqual([]);
    });

    it('should keep only the selections the settings still offer', () => {
        const kept = library('Kept', 'acme', 'kept');
        const dropped = library('Dropped', 'acme', 'dropped');

        expect(filterRemovedCustomLibraries([kept, dropped], [kept])).toEqual([kept]);
    });

    it('should match on owner and repo, not on the display name', () => {
        const selected = library('Old name', 'acme', 'blocks');
        const renamed = library('New name', 'acme', 'blocks');
        const sameNameElsewhere = library('Old name', 'other', 'blocks');

        expect(filterRemovedCustomLibraries([selected], [renamed])).toEqual([selected]);
        expect(filterRemovedCustomLibraries([selected], [sameNameElsewhere])).toEqual([]);
    });
});

describe('getWizardTitle', () => {
    it.each([
        ['edit', 'Edit Project'],
        ['import', 'Import Project'],
        ['create', 'Create Demo Project'],
    ] as const)('should title the %s wizard "%s"', (mode, title) => {
        expect(getWizardTitle(mode)).toBe(title);
    });

    it('should title an unset mode as a new project', () => {
        expect(getWizardTitle(undefined)).toBe('Create Demo Project');
    });
});

describe('getNextButtonText', () => {
    it('should stay on Continue while a selection is being confirmed, even on review', () => {
        expect(getNextButtonText(true, 3, 5, 'edit', 'review')).toBe('Continue');
    });

    it('should offer Save Changes on the review step of an edit', () => {
        expect(getNextButtonText(false, 3, 5, 'edit', 'review')).toBe('Save Changes');
    });
});

describe('getEnabledWizardSteps', () => {
    it('should return nothing for an absent or empty step list', () => {
        expect(getEnabledWizardSteps(undefined)).toEqual([]);
        expect(getEnabledWizardSteps([])).toEqual([]);
    });
});

describe('filterStepsByComponents', () => {
    const step = (over: Record<string, unknown> = {}) => ({
        id: 'storefront-setup',
        name: 'Storefront',
        enabled: true,
        ...over,
    });

    it('should keep a step whose requiredComponents list is present but empty', () => {
        // An empty list is "no requirement", not "requires everything" — the
        // length check is what separates the two.
        const steps = [step({ requiredComponents: [] })];

        expect(filterStepsByComponents(steps, { frontend: 'eds' })).toHaveLength(1);
    });

    it('should fall through to requiredAny when requiredComponents is empty', () => {
        // An empty requiredComponents must not short-circuit as "all satisfied":
        // the step still has to clear its requiredAny gate.
        const steps = [step({ requiredComponents: [], requiredAny: ['commerce-mesh'] })];

        expect(filterStepsByComponents(steps, { frontend: 'eds' })).toEqual([]);
    });

    it('should drop a step whose required component is not selected', () => {
        const steps = [step({ requiredComponents: ['commerce-mesh'] })];

        expect(filterStepsByComponents(steps, { frontend: 'eds' })).toEqual([]);
    });
});

describe('computeStateUpdatesForBackwardNav', () => {
    const state = { currentStep: 'welcome' } as WizardState;

    it('should clear the Adobe project and workspace when moving before their host step', () => {
        const updates = computeStateUpdatesForBackwardNav(state, 'welcome', 0, {
            buildStepIndex: 2,
        });

        // `toEqual` ignores keys whose value is undefined, and clearing IS
        // setting them to undefined — so the key list is the assertion.
        expect(Object.keys(updates).sort()).toEqual([
            'adobeProject',
            'adobeWorkspace',
            'currentStep',
            'projectsCache',
            'workspacesCache',
        ]);
    });

    it('should clear them when the host step is the very next one', () => {
        const updates = computeStateUpdatesForBackwardNav(state, 'welcome', 0, {
            buildStepIndex: 1,
        });

        expect(Object.keys(updates)).toContain('adobeWorkspace');
    });

    it('should keep them when the target is the host step itself', () => {
        const updates = computeStateUpdatesForBackwardNav(state, 'build-your-project', 2, {
            buildStepIndex: 2,
        });

        expect(Object.keys(updates)).toEqual(['currentStep']);
    });

    it('should keep them when there is no host step in this wizard', () => {
        const updates = computeStateUpdatesForBackwardNav(state, 'welcome', 0, {
            buildStepIndex: -1,
        });

        expect(Object.keys(updates)).toEqual(['currentStep']);
    });
});

describe('initializeAdobeContextFromImport', () => {
    it('should return nothing when the import carries no Adobe section at all', () => {
        expect(initializeAdobeContextFromImport({} as ImportedSettings)).toEqual({});
    });

    it('should rebuild only the parts the import actually names', () => {
        const imported = {
            adobe: { orgId: 'org-1', workspaceId: 'ws-1' },
        } as ImportedSettings;

        expect(initializeAdobeContextFromImport(imported)).toEqual({
            org: { id: 'org-1', code: '', name: '' },
            workspace: { id: 'ws-1', name: '', title: undefined },
        });
    });
});

describe('buildProjectConfig', () => {
    const base = {
        currentStep: 'review',
        projectName: 'demo',
        adobeAuth: NEUTRAL_AUTH,
        selectedStack: 'eds-accs',
        selectedPackage: 'citisignal',
    } as unknown as WizardState;

    it('should carry the imported mesh endpoint out of the component configs', () => {
        const config = buildProjectConfig(
            {
                ...base,
                componentConfigs: {
                    'eds-storefront': { PORT: '3000' },
                    'commerce-mesh': { MESH_ENDPOINT: 'https://mesh.adobe.io/graphql' },
                },
            } as unknown as WizardState,
            null,
            []
        );

        expect(config.importedMeshEndpoint).toBe('https://mesh.adobe.io/graphql');
    });

    it('should ignore a mesh endpoint that is not a string', () => {
        const config = buildProjectConfig(
            {
                ...base,
                componentConfigs: { 'commerce-mesh': { MESH_ENDPOINT: 42 } },
            } as unknown as WizardState,
            null,
            []
        );

        expect(config.importedMeshEndpoint).toBeUndefined();
    });

    it('should step over a component that has no config object at all', () => {
        const config = buildProjectConfig(
            {
                ...base,
                componentConfigs: {
                    'eds-storefront': undefined,
                    'commerce-mesh': { MESH_ENDPOINT: 'https://mesh.adobe.io/graphql' },
                },
            } as unknown as WizardState,
            null,
            []
        );

        expect(config.importedMeshEndpoint).toBe('https://mesh.adobe.io/graphql');
    });

    it('should carry no mesh endpoint when there are no component configs', () => {
        const config = buildProjectConfig(base, null, []);

        expect(config.importedMeshEndpoint).toBeUndefined();
    });

    it('should resolve the frontend source from the selected package and stack', () => {
        const source = { type: 'git', url: 'https://github.com/acme/storefront', branch: 'main' };
        const packages = [
            { id: 'other', name: 'Other', storefronts: { 'eds-accs': { source: { url: 'no' } } } },
            { id: 'citisignal', name: 'CitiSignal', storefronts: { 'eds-accs': { source } } },
        ];

        const config = buildProjectConfig(base, null, packages as unknown as DemoPackage[]);

        expect(config.frontendSource).toEqual(source);
    });

    it('should resolve no frontend source when the package has no storefront for this stack', () => {
        const packages = [
            { id: 'citisignal', name: 'CitiSignal', storefronts: { 'headless-paas': {} } },
        ];

        const config = buildProjectConfig(base, null, packages as unknown as DemoPackage[]);

        expect(config.frontendSource).toBeUndefined();
    });

    it('should resolve no frontend source when the package lists no storefronts at all', () => {
        const packages = [{ id: 'citisignal', name: 'CitiSignal' }];

        expect(buildProjectConfig(base, null, packages as unknown as DemoPackage[]).frontendSource).toBeUndefined();
    });

    it('should resolve no frontend source when no package list was supplied', () => {
        expect(buildProjectConfig(base, null, undefined).frontendSource).toBeUndefined();
    });

    it('should default the list-shaped selections to empty rather than undefined', () => {
        const config = buildProjectConfig(base, null, []);

        expect(config.selectedAddons).toEqual([]);
        expect(config.selectedBlockLibraries).toEqual([]);
        expect(config.customBlockLibraries).toEqual([]);
        expect(config.selectedAppBuilderComponents).toEqual([]);
    });

    it('should carry the workspace id the import named', () => {
        const imported = { adobe: { workspaceId: 'ws-imported' } } as ImportedSettings;

        expect(buildProjectConfig(base, imported, []).importedWorkspaceId).toBe('ws-imported');
    });

    it('should carry no workspace id when the import has no Adobe section', () => {
        expect(
            buildProjectConfig(base, {} as ImportedSettings, []).importedWorkspaceId
        ).toBeUndefined();
    });

    it('should send integrations and app-builder components as empty lists', () => {
        // The wire shape is fixed: creation reads these keys, and the mesh rides
        // in `dependencies` rather than in `appBuilder`.
        const config = buildProjectConfig(
            {
                ...base,
                selectedStack: 'eds-accs',
                selectedAppBuilderComponents: ['eds-commerce-mesh', 'app-builder-shell'],
            } as unknown as WizardState,
            null,
            []
        );

        expect(config.components).toMatchObject({ integrations: [], appBuilder: [] });
        expect(config.components?.dependencies).toEqual(['eds-commerce-mesh']);
    });

    describe('the EDS config it hands over', () => {
        const withEds = (eds: Record<string, unknown>) =>
            buildProjectConfig({ ...base, edsConfig: eds } as unknown as WizardState, null, [])
                .edsConfig;

        it('should be absent when the wizard collected no EDS state', () => {
            expect(buildProjectConfig(base, null, []).edsConfig).toBeUndefined();
        });

        it('should prefer the picked repository over the typed one', () => {
            expect(
                withEds({
                    selectedRepo: { fullName: 'acme/picked', isPrivate: true },
                    existingRepo: 'acme/typed',
                })
            ).toMatchObject({ existingRepo: 'acme/picked', isPrivate: true });
        });

        it('should fall back to the typed repository when none was picked', () => {
            expect(withEds({ existingRepo: 'acme/typed' })).toMatchObject({
                existingRepo: 'acme/typed',
            });
        });

        it('should default the repo mode to new', () => {
            expect(withEds({})).toMatchObject({ repoMode: 'new', repoName: '', daLiveOrg: '' });
        });

        it('should keep an explicit repo mode', () => {
            expect(withEds({ repoMode: 'existing' })).toMatchObject({ repoMode: 'existing' });
        });

        it('should record the signed-in GitHub owner, or an empty string', () => {
            expect(
                withEds({ githubAuth: { isAuthenticated: true, user: { login: 'octocat' } } })
            ).toMatchObject({ githubOwner: 'octocat' });
            expect(withEds({ githubAuth: { isAuthenticated: false } })).toMatchObject({
                githubOwner: '',
            });
        });

        it('should default the site-content reset to false and keep an explicit true', () => {
            expect(withEds({})).toMatchObject({ resetSiteContent: false });
            expect(withEds({ resetSiteContent: true })).toMatchObject({ resetSiteContent: true });
        });

        it('should skip the tools install unless the ACO addon was chosen', () => {
            expect(withEds({})).toMatchObject({ skipTools: true });

            const withAco = buildProjectConfig(
                {
                    ...base,
                    edsConfig: {},
                    selectedAddons: ['adobe-commerce-aco'],
                } as unknown as WizardState,
                null,
                []
            );

            expect(withAco.edsConfig).toMatchObject({ skipTools: false });
        });
    });
});
