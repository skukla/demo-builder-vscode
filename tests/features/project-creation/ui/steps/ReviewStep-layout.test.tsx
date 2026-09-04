/**
 * ReviewStep — the layout decisions, and what each memo is allowed to go stale on.
 *
 * Two things here are only visible in the DOM rather than in the text: the
 * project-configuration card spans both grid columns when there is no Adobe I/O
 * card beside it, and a plain string value is wrapped in the shared text class
 * while a composed value keeps its own markup.
 *
 * The rest is staleness. Every derived value on this screen is memoised, and a
 * memo whose dependency list is wrong keeps showing the previous project's
 * answer after the user goes back and changes something. Each block below
 * re-renders with one input changed and reads the row again.
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ReviewStep, type ComponentsData } from '@/features/project-creation/ui/steps/ReviewStep';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';

const COMPONENTS_DATA: ComponentsData = {
    frontends: [
        { id: 'headless', name: 'CitiSignal Next.js' },
        { id: 'eds-storefront', name: 'EDS Storefront' },
    ],
    backends: [
        {
            id: 'adobe-commerce-paas',
            name: 'Commerce PaaS',
            configuration: { requiredServices: ['catalog'] },
        },
        {
            id: 'adobe-commerce-accs',
            name: 'Commerce ACCS',
            configuration: { providesServices: ['catalog'] },
        },
    ],
    dependencies: [{ id: 'some-app', name: 'Some App' }],
    mesh: [{ id: 'headless-commerce-mesh', name: 'Headless Commerce API Mesh' }],
    services: { catalog: { name: 'Catalog Service' } },
};

function renderReview(
    state: Partial<WizardState>,
    props: { componentsData?: ComponentsData; packages?: DemoPackage[]; stacks?: Stack[] } = {}
) {
    const ui = (s: Partial<WizardState>) => (
        <Provider theme={defaultTheme}>
            <ReviewStep
                state={{ projectName: 'demo', ...s } as WizardState}
                updateState={jest.fn()}
                setCanProceed={jest.fn()}
                componentsData={props.componentsData}
                packages={props.packages}
                stacks={props.stacks}
            />
        </Provider>
    );
    const view = render(ui(state));
    return {
        ...view,
        /** Re-render with a changed slice of state, as going back a step would. */
        change: (next: Partial<WizardState>) => view.rerender(ui({ ...state, ...next })),
        rerenderWith: (s: Partial<WizardState>) => view.rerender(ui(s)),
    };
}

/** The wrapper the project-configuration card sits in — the grid's first cell. */
function configCell(): HTMLElement {
    const grid = document.querySelector('[style*="grid"]') as HTMLElement;
    return grid.firstElementChild as HTMLElement;
}

/** The value of a labelled row, as its rendered text. */
function valueOf(label: string): string {
    const row = screen.getByText(label).parentElement as HTMLElement;
    return (row.lastElementChild as HTMLElement).textContent ?? '';
}

describe('the two-column grid', () => {
    it('lays the cards out in two equal columns', () => {
        renderReview({ selectedStack: 'headless-paas' });

        const grid = document.querySelector('[style*="grid-template-columns"]') as HTMLElement;
        expect(grid).toHaveStyle({ display: 'grid', gridTemplateColumns: '1fr 1fr' });
    });

    it('spans the project-configuration card across both columns when there is no Adobe I/O card', () => {
        renderReview({});

        expect(configCell()).toHaveStyle({ gridColumn: '1 / -1' });
    });

    it('leaves the card in one column when an organization is known', () => {
        renderReview({ adobeOrg: { id: 'o', code: '', name: 'Acme Org' } });

        expect(configCell().getAttribute('style') ?? '').not.toContain('grid-column');
    });

    it('leaves the card in one column when only a project is known', () => {
        renderReview({ adobeProject: { id: 'p', name: 'acme-proj' } });

        expect(configCell().getAttribute('style') ?? '').not.toContain('grid-column');
    });

    it('leaves the card in one column when only a workspace is known', () => {
        renderReview({ adobeWorkspace: { id: 'w', name: 'stage' } });

        expect(configCell().getAttribute('style') ?? '').not.toContain('grid-column');
    });
});

describe('row and card presentation', () => {
    it('gives every label a fixed width so the cards line up', () => {
        renderReview({ edsConfig: { repoName: 'acme-site' } as WizardState['edsConfig'] });

        expect(document.querySelector('.review-label')).toHaveStyle({
            width: '120px',
            flexShrink: '0',
        });
    });

    it('gives each card the subtle background that separates it from the page', () => {
        renderReview({ edsConfig: { repoName: 'acme-site' } as WizardState['edsConfig'] });

        const card = screen.getByText('EDGE DELIVERY SERVICES').parentElement as HTMLElement;
        expect(card).toHaveStyle({ backgroundColor: 'var(--spectrum-gray-75)' });
    });

    it('wraps a plain string value in the shared text class', () => {
        renderReview({ edsConfig: { repoName: 'acme-site' } as WizardState['edsConfig'] });

        expect(screen.getByText('acme-site')).toHaveClass('text-md');
    });

    it('leaves a composed value its own markup rather than wrapping it', () => {
        renderReview(
            {
                selectedStack: 'headless-paas',
                selectedAppBuilderComponents: ['headless-commerce-mesh'],
                apiMesh: { meshStatus: 'deployed' } as WizardState['apiMesh'],
            },
            { componentsData: COMPONENTS_DATA }
        );

        // The deployed-mesh value is a Flex, not a string. Nothing that carries
        // the string-value class may contain element markup.
        for (const wrapper of Array.from(document.querySelectorAll('.text-md'))) {
            expect(wrapper.querySelector('div')).toBeNull();
        }
        expect(screen.getByText('Deployed')).toBeInTheDocument();
    });

    it('renders no components card at all when nothing resolved into it', () => {
        renderReview({});

        expect(screen.queryByText('COMPONENTS')).not.toBeInTheDocument();
    });
});

describe('the derived EDS strings when the config carries partial data', () => {
    it('uses the bare repo name when the selected repo has no full name', () => {
        renderReview({
            edsConfig: {
                selectedRepo: { id: 'r', name: 'acme-site' },
            } as WizardState['edsConfig'],
        });

        expect(screen.getByText('acme-site')).toBeInTheDocument();
    });

    it('uses the bare repo name when the GitHub auth carries no user', () => {
        renderReview({
            edsConfig: {
                repoName: 'acme-site',
                githubAuth: { isAuthenticated: false, isChecking: true },
            } as WizardState['edsConfig'],
        });

        expect(screen.getByText('acme-site')).toBeInTheDocument();
    });
});

describe('the package lookup', () => {
    it('shows no package name when the catalog was never handed in', () => {
        renderReview({ selectedPackage: 'citisignal' });

        expect(screen.queryByText('Package')).not.toBeInTheDocument();
    });
});

describe('what the memos recompute on', () => {
    const STACKS: Stack[] = [
        {
            id: 'headless-paas',
            name: 'Headless + PaaS',
            description: 'd',
            frontend: 'headless',
            backend: 'adobe-commerce-paas',
            dependencies: [],
        },
    ];

    it('follows the stack to a different frontend when the user goes back and changes it', () => {
        const { change } = renderReview(
            { selectedStack: 'headless-paas' },
            { componentsData: COMPONENTS_DATA }
        );
        expect(valueOf('Frontend')).toBe('CitiSignal Next.js');

        change({ selectedStack: 'eds-paas' });

        expect(valueOf('Frontend')).toBe('EDS Storefront');
    });

    it('follows the backend to its own service list', () => {
        const { change } = renderReview(
            { selectedStack: 'headless-paas' },
            { componentsData: COMPONENTS_DATA }
        );
        expect(screen.getByText('Catalog Service')).toBeInTheDocument();

        change({ selectedStack: 'headless-accs' });

        expect(screen.getByText('Catalog Service (built-in)')).toBeInTheDocument();
    });

    it('names the backend services under the backend row', () => {
        renderReview({ selectedStack: 'headless-paas' }, { componentsData: COMPONENTS_DATA });

        expect(screen.getByText('Catalog Service')).toHaveClass('description-text');
    });

    it('recomputes the service list when the registry services change', () => {
        const view = render(
            <Provider theme={defaultTheme}>
                <ReviewStep
                    state={{ projectName: 'demo', selectedStack: 'headless-paas' } as WizardState}
                    updateState={jest.fn()}
                    setCanProceed={jest.fn()}
                    componentsData={COMPONENTS_DATA}
                />
            </Provider>
        );
        expect(screen.getByText('Catalog Service')).toBeInTheDocument();

        view.rerender(
            <Provider theme={defaultTheme}>
                <ReviewStep
                    state={{ projectName: 'demo', selectedStack: 'headless-paas' } as WizardState}
                    updateState={jest.fn()}
                    setCanProceed={jest.fn()}
                    componentsData={{
                        ...COMPONENTS_DATA,
                        services: { catalog: { name: 'Renamed Service' } },
                    }}
                />
            </Provider>
        );

        expect(screen.getByText('Renamed Service')).toBeInTheDocument();
    });

    it('adds the middleware row when the user opts into the mesh', () => {
        const { change } = renderReview(
            { selectedStack: 'headless-paas' },
            { componentsData: COMPONENTS_DATA }
        );
        expect(screen.queryByText('Middleware')).not.toBeInTheDocument();

        change({ selectedAppBuilderComponents: ['headless-commerce-mesh'] });

        expect(valueOf('Middleware')).toBe('Headless Commerce API Mesh');
    });

    it('keeps a non-mesh App Builder selection out of the dependencies row', () => {
        renderReview(
            {
                selectedStack: 'headless-paas',
                selectedAppBuilderComponents: ['headless-commerce-mesh', 'some-app'],
            },
            { componentsData: COMPONENTS_DATA }
        );

        expect(screen.queryByText('Dependencies')).not.toBeInTheDocument();
        expect(screen.queryByText('Some App')).not.toBeInTheDocument();
    });

    it('follows the EDS config when the repo is changed', () => {
        const { change } = renderReview({
            edsConfig: { repoName: 'first-repo' } as WizardState['edsConfig'],
        });
        expect(screen.getByText('first-repo')).toBeInTheDocument();

        change({ edsConfig: { repoName: 'second-repo' } as WizardState['edsConfig'] });

        expect(screen.getByText('second-repo')).toBeInTheDocument();
    });

    it('follows the EDS config when the DA.live site is changed', () => {
        const { change } = renderReview({
            edsConfig: { daLiveSite: 'first-site' } as WizardState['edsConfig'],
        });
        expect(screen.getByText('first-site')).toBeInTheDocument();

        change({ edsConfig: { daLiveSite: 'second-site' } as WizardState['edsConfig'] });

        expect(screen.getByText('second-site')).toBeInTheDocument();
    });

    it('follows the storefront config when AEM Assets is switched on', () => {
        const { change } = renderReview({
            edsConfig: { repoName: 'acme-site' } as WizardState['edsConfig'],
        });
        expect(screen.queryByText('AEM Assets')).not.toBeInTheDocument();

        change({ componentConfigs: { 'eds-storefront': { AEM_ASSETS_ENABLED: 'true' } } });

        expect(screen.getByText('AEM Assets')).toBeInTheDocument();
    });

    it('names the configured integrations, and follows a change to them', () => {
        const { change } = renderReview(
            {
                selectedStack: 'headless-paas',
                selectedAppBuilderComponents: ['erp-sync'],
                appBuilderComponentSources: {
                    'erp-sync': { owner: 'acme', repo: 'erp-sync', name: 'First Integration' },
                },
            },
            { componentsData: COMPONENTS_DATA, stacks: STACKS }
        );
        expect(valueOf('Integrations')).toBe('First Integration');

        change({
            appBuilderComponentSources: {
                'erp-sync': { owner: 'acme', repo: 'erp-sync', name: 'Second Integration' },
            },
        });

        expect(valueOf('Integrations')).toBe('Second Integration');
    });
});
