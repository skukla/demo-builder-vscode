// Shared test data for ConfigureScreen tests
// Note: Mocks must be defined in each test file due to Jest hoisting

import { fireEvent, screen } from '@testing-library/react';

/**
 * The rail tab whose VISIBLE label matches, or throw.
 *
 * Matches on `.vsteplist-title` rather than the accessible name: a tab holding a
 * validation error also carries visually-hidden ", has errors" text, so the accessible
 * name is not the label.
 */
export function railTab(label: string): HTMLElement {
    const tab = screen
        .getAllByRole('tab')
        .find(el => el.querySelector('.vsteplist-title')?.textContent === label);
    if (!tab) throw new Error(`rail tab "${label}" not found in [${railTabLabels()}]`);
    return tab;
}

/**
 * Switch the visible Configure section by clicking its rail tab.
 *
 * ConfigureScreen renders ONE section at a time, so a test that asserts on a service
 * group's fields has to navigate to it first — landing on the Project tab is the
 * default. The rail renders real `<button role="tab">`s (StepRail is presentational and
 * is not mocked), so this is a real click on real markup.
 */
export function selectSection(label: string): void {
    fireEvent.click(railTab(label));
}

/** The visible labels currently on the rail, in order. */
export function railTabLabels(): string[] {
    return screen
        .getAllByRole('tab')
        .map(tab => tab.querySelector('.vsteplist-title')?.textContent ?? '');
}

// Mock project data
export const mockProject = {
    name: 'Test Project',
    path: '/test/path',
    componentSelections: {
        frontend: 'headless',
        backend: 'adobe-commerce-paas',
        dependencies: ['catalog-service'],
        integrations: [],
        appBuilder: [],
    },
    componentConfigs: {
        headless: {
            ADOBE_COMMERCE_URL: 'https://example.com',
        },
    },
};

// Mock components data
export const mockComponentsData = {
    frontends: [
        {
            id: 'headless',
            name: 'Headless Storefront',
            configuration: {
                requiredEnvVars: ['ADOBE_COMMERCE_URL', 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT'],
                optionalEnvVars: ['OPTIONAL_WITH_DEFAULT'],
            },
        },
    ],
    backends: [
        {
            id: 'adobe-commerce-paas',
            name: 'Adobe Commerce PaaS',
            configuration: {
                requiredEnvVars: ['ADOBE_COMMERCE_ADMIN_USERNAME'],
                optionalEnvVars: [],
            },
        },
    ],
    dependencies: [
        {
            id: 'catalog-service',
            name: 'Catalog Service',
            configuration: {
                requiredEnvVars: ['ADOBE_CATALOG_API_KEY'],
                optionalEnvVars: [],
            },
        },
    ],
    envVars: {
        ADOBE_COMMERCE_URL: {
            key: 'ADOBE_COMMERCE_URL',
            label: 'Commerce URL',
            type: 'url' as const,
            required: true,
            group: 'adobe-commerce',
            placeholder: 'https://...',
        },
        ADOBE_COMMERCE_GRAPHQL_ENDPOINT: {
            key: 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT',
            label: 'GraphQL Endpoint',
            type: 'url' as const,
            required: true,
            group: 'adobe-commerce',
            placeholder: 'https://.../graphql',
        },
        ADOBE_COMMERCE_ADMIN_USERNAME: {
            key: 'ADOBE_COMMERCE_ADMIN_USERNAME',
            label: 'Admin Username',
            type: 'text' as const,
            required: true,
            group: 'adobe-commerce',
        },
        ADOBE_CATALOG_API_KEY: {
            key: 'ADOBE_CATALOG_API_KEY',
            label: 'Catalog API Key',
            type: 'text' as const,
            required: true,
            group: 'catalog-service',
        },
        OPTIONAL_WITH_DEFAULT: {
            key: 'OPTIONAL_WITH_DEFAULT',
            label: 'Optional Field with Default',
            type: 'text' as const,
            required: false,
            group: 'adobe-commerce',
            default: 'default-value',
        },
    },
};
