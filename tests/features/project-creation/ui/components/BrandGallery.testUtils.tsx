/**
 * Shared fixtures for the BrandGallery suites.
 *
 * Typed to the real `DemoPackage` / `Stack` interfaces rather than cast, so
 * `npm run typecheck:tests` reads them and a fixture that drifts from the catalog
 * contract fails to compile.
 *
 * Two ordering choices are load-bearing:
 *  - `EDS_STACK` is the SECOND stack, so a lookup that ignores its predicate and takes
 *    the first entry names the wrong architecture rather than the right one by luck.
 *  - `PACKAGES` holds three entries, because SearchHeader only renders its search field
 *    above `searchThreshold` (2 here).
 */

import React from 'react';
import { render } from '@testing-library/react';
import { BrandGallery } from '@/features/project-creation/ui/components/BrandGallery';
import type { BrandGalleryProps } from '@/features/project-creation/ui/components/BrandGallery';
import type { DemoPackage, GitSource } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';

export const GIT_SOURCE: GitSource = {
    type: 'git',
    url: 'https://github.com/test/repo',
    branch: 'main',
    gitOptions: { shallow: true },
};

export const HEADLESS_STACK: Stack = {
    id: 'headless-paas',
    name: 'Headless + PaaS',
    description: 'NextJS storefront with a PaaS backend',
    icon: 'nextjs',
    frontend: 'headless',
    backend: 'paas',
    dependencies: [],
    features: [],
};

export const EDS_STACK: Stack = {
    id: 'eds-paas',
    name: 'EDS + PaaS',
    description: 'Edge Delivery with PaaS backend',
    icon: 'eds',
    frontend: 'eds',
    backend: 'paas',
    dependencies: [],
    features: [],
};

export const STACKS: Stack[] = [HEADLESS_STACK, EDS_STACK];

export const ACTIVE_PACKAGE: DemoPackage = {
    id: 'active-brand',
    name: 'Active Brand',
    description: 'An active brand',
    configDefaults: {},
    storefronts: {
        'eds-paas': {
            name: 'Active EDS + PaaS',
            description: 'Active storefront',
            source: GIT_SOURCE,
        },
    },
};

export const OTHER_PACKAGE: DemoPackage = {
    id: 'other-brand',
    name: 'Other Brand',
    description: 'Another active brand',
    configDefaults: {},
    storefronts: {
        'eds-paas': {
            name: 'Other EDS + PaaS',
            description: 'Other storefront',
            source: GIT_SOURCE,
        },
    },
};

export const COMING_SOON_PACKAGE: DemoPackage = {
    id: 'soon-brand',
    name: 'Soon Brand',
    description: 'A coming soon brand',
    status: 'coming-soon',
    configDefaults: {},
    storefronts: {},
};

/** Three packages — enough for SearchHeader's search field to render. */
export const PACKAGES: DemoPackage[] = [ACTIVE_PACKAGE, OTHER_PACKAGE, COMING_SOON_PACKAGE];

/** Render the gallery with the three-package catalog, overridable per test. */
export function renderGallery(overrides: Partial<BrandGalleryProps> = {}) {
    const props: BrandGalleryProps = {
        packages: PACKAGES,
        stacks: STACKS,
        onPackageSelect: jest.fn(),
        ...overrides,
    };
    const view = render(<BrandGallery {...props} />);
    return {
        ...view,
        props,
        rerenderWith: (next: Partial<BrandGalleryProps>) =>
            view.rerender(<BrandGallery {...props} {...next} />),
    };
}

/** The rendered cards, in DOM order (sortPackages puts coming-soon last). */
export function cards(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-testid="package-card"]'));
}

/** The card for one package, by its display name. */
export function cardFor(name: string): HTMLElement {
    const found = cards().find((c) => c.getAttribute('aria-label')?.startsWith(`${name}:`));
    if (!found) throw new Error(`no card rendered for ${name}`);
    return found;
}
