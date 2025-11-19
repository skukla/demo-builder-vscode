// Shared test data for ConfigureScreen tests
// Note: Mocks must be defined in each test file due to Jest hoisting

// Mock project data
export const mockProject = {
    name: 'Test Project',
    path: '/test/path',
    componentSelections: {
        frontend: 'venia',
        backend: 'commerce-backend',
        dependencies: ['catalog-service'],
        integrations: [],
        appBuilder: [],
    },
    componentConfigs: {
        venia: {
            ADOBE_COMMERCE_URL: 'https://example.com',
        },
    },
};

// Mock components data
export const mockComponentsData = {
    frontends: [
        {
            id: 'venia',
            name: 'Venia Storefront',
            configuration: {
                requiredEnvVars: ['ADOBE_COMMERCE_URL', 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT'],
                optionalEnvVars: [],
            },
        },
    ],
    backends: [
        {
            id: 'commerce-backend',
            name: 'Commerce Backend',
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
    },
};
