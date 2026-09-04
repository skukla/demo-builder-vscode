/**
 * Shared fixtures for the WelcomeStep suites.
 *
 * The shapes are typed to the real interfaces (`DemoPackage`, `Stack`, `Storefront`)
 * rather than cast, so `npm run typecheck:tests` reads them — a fixture that drifts
 * from the catalog contract fails to compile instead of quietly testing a shape the
 * product no longer produces.
 *
 * Order matters in `PACKAGES`: `citisignal` is deliberately NOT first, so a lookup
 * that ignores its predicate and returns the first entry produces the wrong package
 * rather than the right one by luck.
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render } from '@testing-library/react';
import React from 'react';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import type { DemoPackage, Storefront } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

function storefront(name: string, repo: string): Storefront {
    return {
        name,
        description: `${name} storefront`,
        source: {
            type: 'git',
            url: `https://github.com/test/${repo}`,
            branch: 'main',
            gitOptions: { shallow: true },
        },
        templateOwner: 'template-owner',
        // Distinct per storefront, so a lookup that returns the wrong package's
        // storefront is visible in the derived edsConfig rather than identical to it.
        templateRepo: repo,
    };
}

export const DEFAULT_PACKAGE: DemoPackage = {
    id: 'default',
    name: 'Default',
    description: 'Generic storefront with default content',
    icon: 'default',
    configDefaults: {
        ADOBE_COMMERCE_STORE_VIEW_CODE: 'default_us',
    },
    storefronts: {
        'headless-paas': storefront('Default Headless', 'default-headless'),
        'eds-paas': storefront('Default EDS', 'default-eds'),
    },
};

export const CITISIGNAL_PACKAGE: DemoPackage = {
    id: 'citisignal',
    name: 'CitiSignal',
    description: 'Telecommunications demo with CitiSignal branding',
    icon: 'citisignal',
    configDefaults: {
        ADOBE_COMMERCE_STORE_VIEW_CODE: 'citisignal_us',
        // A key only this brand owns — it is how a clear that drops the INCOMING
        // package's keys is told apart from one that drops both brands'.
        ADOBE_COMMERCE_WEBSITE_CODE: 'citisignal',
    },
    storefronts: {
        'headless-paas': storefront('CitiSignal Headless', 'citisignal-headless'),
        'eds-paas': storefront('CitiSignal EDS', 'citisignal-eds'),
    },
};

export const PACKAGES: DemoPackage[] = [DEFAULT_PACKAGE, CITISIGNAL_PACKAGE];

export const STACKS: Stack[] = [
    {
        id: 'headless-paas',
        name: 'Headless',
        description: 'NextJS storefront with API Mesh and Commerce PaaS',
        icon: 'nextjs',
        frontend: 'headless',
        backend: 'adobe-commerce-paas',
        dependencies: ['commerce-mesh'],
    },
    {
        id: 'eds-paas',
        name: 'Edge Delivery',
        description: 'EDS storefront with Commerce Drop-ins',
        icon: 'eds',
        frontend: 'eds-storefront',
        backend: 'adobe-commerce-paas',
        dependencies: [],
    },
];

export interface RenderWelcomeOptions {
    state?: Partial<WizardState>;
    packages?: DemoPackage[];
    stacks?: Stack[];
    existingProjectNames?: string[];
    updateState?: jest.Mock;
    setCanProceed?: jest.Mock;
}

export interface RenderedWelcome {
    updateState: jest.Mock;
    setCanProceed: jest.Mock;
    rerender: (next: RenderWelcomeOptions) => void;
    unmount: () => void;
}

/**
 * Render WelcomeStep with the Spectrum provider, returning the collaborator mocks so a
 * test can assert the ARGUMENTS the step handed them.
 */
export function renderWelcome(options: RenderWelcomeOptions = {}): RenderedWelcome {
    const updateState = options.updateState ?? jest.fn();
    const setCanProceed = options.setCanProceed ?? jest.fn();

    const element = (opts: RenderWelcomeOptions) => (
        <Provider theme={defaultTheme}>
            <WelcomeStep
                state={{ projectName: 'my-demo-project', ...opts.state } as WizardState}
                updateState={updateState}
                setCanProceed={setCanProceed}
                existingProjectNames={opts.existingProjectNames}
                packages={opts.packages}
                stacks={opts.stacks}
            />
        </Provider>
    );

    const view = render(element(options));

    return {
        updateState,
        setCanProceed,
        rerender: (next: RenderWelcomeOptions) => view.rerender(element(next)),
        unmount: view.unmount,
    };
}

/** The project-name input the step renders (the Spectrum TextField stub's `input`). */
export function nameInput(): HTMLInputElement {
    const input = document.querySelector('input[type="text"]');
    if (!input) throw new Error('WelcomeStep rendered no project-name input');
    return input as HTMLInputElement;
}

/**
 * A catalog entry whose `storefronts` block is missing entirely.
 *
 * `demo-packages.json` is parsed at runtime, so an entry that omits the block arrives
 * as `undefined` however the interface declares it — the widening here models the real
 * input, it does not invent a shape.
 */
export const PACKAGE_WITHOUT_STOREFRONTS = {
    ...CITISIGNAL_PACKAGE,
    storefronts: undefined,
} as unknown as DemoPackage;
