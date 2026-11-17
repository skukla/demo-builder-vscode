/**
 * ReviewStep — the four cards it renders and when each one appears.
 *
 * Review is the last screen before a project is created, so every row on it is a
 * claim about what is about to happen. The Edge Delivery card in particular
 * carries three derived strings — the repo full name, the repo MODE (new /
 * existing / reset to template) and the DA.live org+site — each assembled from
 * two or three optional fields with a documented precedence. These tests render
 * the step and read the rows back.
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ReviewStep } from '@/features/project-creation/ui/steps/ReviewStep';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

function renderReview(state: Partial<WizardState>) {
    return render(
        <Provider theme={defaultTheme}>
            <ReviewStep
                state={{ projectName: 'demo', ...state } as WizardState}
                updateState={jest.fn()}
                setCanProceed={jest.fn()}
            />
        </Provider>
    );
}

/** The sub-item line a LabelValue renders under its value. */
function subItemsUnder(label: string): string | null {
    const row = screen.getByText(label).parentElement;
    const description = row?.querySelector('.description-text');
    return description?.textContent ?? null;
}

type EdsConfig = NonNullable<WizardState['edsConfig']>;

function withEds(edsConfig: Partial<EdsConfig>): Partial<WizardState> {
    return { edsConfig: edsConfig as EdsConfig };
}

describe('the Edge Delivery card', () => {
    it('is absent entirely when the wizard has no EDS config', () => {
        renderReview({});

        expect(screen.queryByText('Edge Delivery Services')).not.toBeInTheDocument();
    });

    it('is absent when the EDS config carries no repo and no site', () => {
        renderReview(withEds({ daLiveOrg: 'acme-da' }));

        expect(screen.queryByText('Edge Delivery Services')).not.toBeInTheDocument();
    });

    it('appears for a config carrying only a repo name', () => {
        renderReview(withEds({ repoName: 'acme-site' }));

        expect(screen.getByText('Edge Delivery Services')).toBeInTheDocument();
    });

    it('appears for a config carrying only a selected site', () => {
        renderReview(withEds({ selectedSite: { id: 's', name: 'acme-site-da' } }));

        expect(screen.getByText('Edge Delivery Services')).toBeInTheDocument();
    });

    it('appears for a config carrying only a selected repo', () => {
        renderReview(
            withEds({
                selectedRepo: {
                    id: 'acme/site',
                    name: 'site',
                    fullName: 'acme/site',
                    htmlUrl: 'https://github.com/acme/site',
                },
            })
        );

        expect(screen.getByText('Edge Delivery Services')).toBeInTheDocument();
    });

    it('appears for a config carrying only a DA.live site name', () => {
        renderReview(withEds({ daLiveSite: 'acme-site-da' }));

        expect(screen.getByText('Edge Delivery Services')).toBeInTheDocument();
    });
});

describe('the GitHub Repository row', () => {
    it('takes the owner from the selected repo full name', () => {
        renderReview(
            withEds({
                selectedRepo: {
                    id: 'acme-org/acme-site',
                    name: 'acme-site',
                    fullName: 'acme-org/acme-site',
                    htmlUrl: 'https://github.com/acme-org/acme-site',
                },
            })
        );

        expect(screen.getByText('acme-org/acme-site')).toBeInTheDocument();
    });

    it('falls back to the signed-in GitHub login for the owner', () => {
        renderReview(
            withEds({
                repoName: 'acme-site',
                githubAuth: {
                    isAuthenticated: true,
                    user: { login: 'acme-user', email: null, name: null, avatarUrl: null },
                },
            })
        );

        expect(screen.getByText('acme-user/acme-site')).toBeInTheDocument();
    });

    it('shows the bare repo name when no owner can be resolved', () => {
        renderReview(withEds({ repoName: 'acme-site' }));

        expect(screen.getByText('acme-site')).toBeInTheDocument();
    });

    it('prefers the selected repo name over the stored one', () => {
        renderReview(
            withEds({
                repoName: 'stale-name',
                selectedRepo: {
                    id: 'acme-org/fresh-name',
                    name: 'fresh-name',
                    fullName: 'acme-org/fresh-name',
                    htmlUrl: 'https://github.com/acme-org/fresh-name',
                },
            })
        );

        expect(screen.getByText('acme-org/fresh-name')).toBeInTheDocument();
        expect(screen.queryByText('acme-org/stale-name')).not.toBeInTheDocument();
    });

    it('is absent when the config names a site but no repo', () => {
        renderReview(withEds({ daLiveSite: 'acme-site-da' }));

        expect(screen.queryByText('GitHub Repository')).not.toBeInTheDocument();
    });

    // Walk F203 (owner, 2026-11-17): New creates the repository at once and selects it as an
    // existing one (EDS-18), so the review called the repository it had just made "Existing
    // repository". Neither word is said; only a reset, which replaces what is in it, is.
    it('says nothing under a new repository', () => {
        renderReview(withEds({ repoName: 'acme-site' }));

        expect(subItemsUnder('GitHub Repository')).toBeNull();
    });

    it('says nothing under an existing repository that is not being reset', () => {
        renderReview(withEds({ repoName: 'acme-site', repoMode: 'existing' }));

        expect(subItemsUnder('GitHub Repository')).toBeNull();
    });

    it('reads "Reset to template" for an existing repo that is being reset', () => {
        renderReview(
            withEds({ repoName: 'acme-site', repoMode: 'existing', resetToTemplate: true })
        );

        expect(subItemsUnder('GitHub Repository')).toBe('Reset to template');
    });

    it('says no reset when one is flagged on a repo that is not existing', () => {
        renderReview(withEds({ repoName: 'acme-site', resetToTemplate: true }));

        expect(subItemsUnder('GitHub Repository')).toBeNull();
    });
});

describe('the DA.live row', () => {
    it('joins the org and site with a slash', () => {
        renderReview(withEds({ daLiveOrg: 'acme-da', daLiveSite: 'acme-site-da' }));

        expect(screen.getByText('acme-da/acme-site-da')).toBeInTheDocument();
    });

    it('shows the site alone when no org was chosen', () => {
        renderReview(withEds({ daLiveSite: 'acme-site-da' }));

        expect(screen.getByText('acme-site-da')).toBeInTheDocument();
    });

    it('prefers the selected site name over the stored one', () => {
        renderReview(
            withEds({
                daLiveOrg: 'acme-da',
                daLiveSite: 'stale-site',
                selectedSite: { id: 'fresh-site', name: 'fresh-site' },
            })
        );

        expect(screen.getByText('acme-da/fresh-site')).toBeInTheDocument();
    });

    it('is absent when the config names a repo but no site', () => {
        renderReview(withEds({ repoName: 'acme-site', daLiveOrg: 'acme-da' }));

        expect(screen.queryByText('DA.live Project')).not.toBeInTheDocument();
    });

    it('reads "New site" when creating a project, which makes the site', () => {
        renderReview(withEds({ daLiveSite: 'acme-site-da' }));

        expect(subItemsUnder('DA.live Project')).toBe('New site');
    });

    // `siteMode` was read here and set nowhere, so Edit called the project's own site
    // "New site" (owner, 2026-10-17). In Edit the site is the one the project has.
    // An Edit says whether the site's pages are kept or replaced (2026-10-19).
    it('reads "Existing site, pages kept" in Edit', () => {
        renderReview({ ...withEds({ daLiveSite: 'acme-site-da' }), wizardMode: 'edit' });

        expect(subItemsUnder('DA.live Project')).toBe('Existing site, pages kept');
    });

    it('reads "Existing site, pages replaced" in an Edit that resets to the template', () => {
        renderReview({ ...withEds({ daLiveSite: 'acme-site-da', resetToTemplate: true }), wizardMode: 'edit' });

        expect(subItemsUnder('DA.live Project')).toBe('Existing site, pages replaced');
    });
});

describe('the AEM Assets row', () => {
    it('appears when the storefront config turns it on', () => {
        renderReview({
            ...withEds({ repoName: 'acme-site' }),
            componentConfigs: { 'eds-storefront': { AEM_ASSETS_ENABLED: 'true' } },
        });

        expect(screen.getByText('AEM Assets')).toBeInTheDocument();
        expect(screen.getByText('Enabled')).toBeInTheDocument();
    });

    it('is absent when the flag is the string false', () => {
        renderReview({
            ...withEds({ repoName: 'acme-site' }),
            componentConfigs: { 'eds-storefront': { AEM_ASSETS_ENABLED: 'false' } },
        });

        expect(screen.queryByText('AEM Assets')).not.toBeInTheDocument();
    });

    it('is absent when the storefront has no config at all', () => {
        renderReview(withEds({ repoName: 'acme-site' }));

        expect(screen.queryByText('AEM Assets')).not.toBeInTheDocument();
    });
});

describe('the Adobe I/O card', () => {
    it('is absent when none of the three is known', () => {
        renderReview({});

        expect(screen.queryByText('Adobe I/O')).not.toBeInTheDocument();
    });

    it('shows only the organization when that is all that is known', () => {
        renderReview({ adobeOrg: { id: 'o', code: '', name: 'Acme Org' } });

        expect(screen.getByText('Organization')).toBeInTheDocument();
        expect(screen.getByText('Acme Org')).toBeInTheDocument();
        expect(screen.queryByText('Project')).not.toBeInTheDocument();
        expect(screen.queryByText('Workspace')).not.toBeInTheDocument();
    });

    it('shows only the project when that is all that is known', () => {
        renderReview({ adobeProject: { id: 'p', name: 'acme-proj' } });

        expect(screen.getByText('Project')).toBeInTheDocument();
        expect(screen.queryByText('Organization')).not.toBeInTheDocument();
    });

    it('shows only the workspace when that is all that is known', () => {
        renderReview({ adobeWorkspace: { id: 'w', name: 'stage' } });

        expect(screen.getByText('Workspace')).toBeInTheDocument();
        expect(screen.queryByText('Organization')).not.toBeInTheDocument();
    });

    it('prefers the project title over its name', () => {
        renderReview({ adobeProject: { id: 'p', name: 'acme-proj', title: 'Acme Project' } });

        expect(screen.getByText('Acme Project')).toBeInTheDocument();
        expect(screen.queryByText('acme-proj')).not.toBeInTheDocument();
    });

    it('falls back to the project name when the title is an empty string', () => {
        renderReview({ adobeProject: { id: 'p', name: 'acme-proj', title: '' } });

        expect(screen.getByText('acme-proj')).toBeInTheDocument();
    });

    it('prefers the workspace title over its name', () => {
        renderReview({ adobeWorkspace: { id: 'w', name: 'stage', title: 'Stage' } });

        expect(screen.getByText('Stage')).toBeInTheDocument();
        expect(screen.queryByText('stage')).not.toBeInTheDocument();
    });

    it('falls back to the workspace name when the title is an empty string', () => {
        renderReview({ adobeWorkspace: { id: 'w', name: 'stage', title: '' } });

        expect(screen.getByText('stage')).toBeInTheDocument();
    });
});

describe('the project configuration card', () => {
    const PACKAGES: DemoPackage[] = [
        {
            id: 'citisignal',
            name: 'CitiSignal',
            description: 'Telco demo',
            configDefaults: {},
            storefronts: {},
        },
    ];
    const STACKS: Stack[] = [
        {
            id: 'headless-paas',
            name: 'Headless + PaaS',
            description: 'Next.js over Commerce PaaS',
            frontend: 'headless',
            backend: 'adobe-commerce-paas',
            dependencies: [],
        },
    ];

    function renderWithCatalogs(state: Partial<WizardState>) {
        return render(
            <Provider theme={defaultTheme}>
                <ReviewStep
                    state={{ projectName: 'demo', ...state } as WizardState}
                    updateState={jest.fn()}
                    setCanProceed={jest.fn()}
                    packages={PACKAGES}
                    stacks={STACKS}
                />
            </Provider>
        );
    }

    it('is absent when neither a package nor a stack was chosen', () => {
        renderWithCatalogs({});

        expect(screen.queryByText('Project Configuration')).not.toBeInTheDocument();
    });

    it('shows the package name for the selected package id', () => {
        renderWithCatalogs({ selectedPackage: 'citisignal' });

        expect(screen.getByText('Package')).toBeInTheDocument();
        expect(screen.getByText('CitiSignal')).toBeInTheDocument();
        expect(screen.queryByText('Architecture')).not.toBeInTheDocument();
    });

    it('shows the stack name for the selected stack id', () => {
        renderWithCatalogs({ selectedStack: 'headless-paas' });

        expect(screen.getByText('Architecture')).toBeInTheDocument();
        expect(screen.getByText('Headless + PaaS')).toBeInTheDocument();
    });

    it('is absent when the selected ids match nothing in the catalogs', () => {
        renderWithCatalogs({ selectedPackage: 'unknown', selectedStack: 'unknown' });

        expect(screen.queryByText('Project Configuration')).not.toBeInTheDocument();
    });
});

// The datapack the project gets, by the name the SC picked it by (live run 8, owner 2026-11-16:
// Final Review said nothing of an Edit that switched it).
describe('the Datapack row', () => {
    it('names the chosen datapack as the card did', () => {
        renderReview({ datapack: { name: 'frescopa', version: 'main' }, datapackDisplayName: 'Frescopa' });

        expect(screen.getByText('Datapack')).toBeInTheDocument();
        expect(screen.getByText('Frescopa')).toBeInTheDocument();
    });

    it('CONTROL: shows no row when no datapack is chosen', () => {
        renderReview({});

        expect(screen.queryByText('Datapack')).toBeNull();
    });
});

// Walk F211 (owner, 2026-11-17): Scratch 1028 B was created on the live store's website, picked by
// mistake from two of the same brand, and the review never said which website it would write to.
describe('where the project writes in Commerce', () => {
    const STORE: CommerceStoreStructure = {
        websites: [
            { id: 1, code: 'acme', name: 'Acme Website' },
            { id: 2, code: 'acme_test', name: 'Acme Test' },
        ],
        storeGroups: [{ id: 3, code: 'acme_test_store', name: 'Acme Test Store', website_id: 2, root_category_id: 2 }],
        storeViews: [{ id: 4, code: 'acme_test_us', name: 'Acme Test Store US', store_group_id: 3, website_id: 2 }],
    };
    const chosen = (website: string, storeView: string): Partial<WizardState> => ({
        selectedBackend: 'adobe-commerce-accs',
        storeDiscoveryData: STORE,
        componentConfigs: { 'adobe-commerce-accs': { ACCS_WEBSITE_CODE: website, ACCS_STORE_VIEW_CODE: storeView } },
    });

    it('names the website and store view by their names', () => {
        renderReview(chosen('acme_test', 'acme_test_us'));

        expect(screen.getByText('Website')).toBeInTheDocument();
        expect(screen.getByText('Acme Test')).toBeInTheDocument();
        expect(screen.getByText('Store View')).toBeInTheDocument();
        expect(screen.getByText('Acme Test Store US')).toBeInTheDocument();
    });

    it('shows neither row before a website is chosen', () => {
        renderReview({});

        expect(screen.queryByText('Website')).not.toBeInTheDocument();
        expect(screen.queryByText('Store View')).not.toBeInTheDocument();
    });
});
