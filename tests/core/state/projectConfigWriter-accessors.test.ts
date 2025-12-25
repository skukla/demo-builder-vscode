/**
 * ProjectConfigWriter Accessor Functions Tests
 *
 * Tests for accessor functions that extract deeply nested values from Project objects.
 * These accessors reduce optional chaining depth from 3+ levels to improve readability.
 */

import {
    getCatalogApiKey,
    getLiveSearchApiKey,
} from '@/core/state/projectConfigWriter';
import type { Project } from '@/types';

describe('projectConfigWriter accessor functions', () => {
    describe('getCatalogApiKey', () => {
        it('should return API key when fully present', () => {
            // Given: A project with complete catalog service configuration
            const project: Partial<Project> = {
                commerce: {
                    type: 'platform-as-a-service',
                    instance: {
                        url: 'https://example.com',
                        environmentId: 'env-123',
                        storeView: 'default',
                        websiteCode: 'base',
                        storeCode: 'default',
                    },
                    services: {
                        catalog: {
                            enabled: true,
                            endpoint: 'https://catalog.example.com',
                            apiKey: 'catalog-api-key-123',
                        },
                    },
                },
            };

            // When: Getting the catalog API key
            const result = getCatalogApiKey(project as Project);

            // Then: Should return the API key
            expect(result).toBe('catalog-api-key-123');
        });

        it('should return empty string when commerce is undefined', () => {
            // Given: A project without commerce configuration
            const project: Partial<Project> = {
                name: 'Test Project',
            };

            // When: Getting the catalog API key
            const result = getCatalogApiKey(project as Project);

            // Then: Should return empty string
            expect(result).toBe('');
        });

        it('should return empty string when services is undefined', () => {
            // Given: A project with commerce but no services
            const project: Partial<Project> = {
                commerce: {
                    type: 'platform-as-a-service',
                    instance: {
                        url: 'https://example.com',
                        environmentId: 'env-123',
                        storeView: 'default',
                        websiteCode: 'base',
                        storeCode: 'default',
                    },
                    services: {},
                },
            };

            // When: Getting the catalog API key
            const result = getCatalogApiKey(project as Project);

            // Then: Should return empty string
            expect(result).toBe('');
        });

        it('should return empty string when catalog is undefined', () => {
            // Given: A project with services but no catalog
            const project: Partial<Project> = {
                commerce: {
                    type: 'platform-as-a-service',
                    instance: {
                        url: 'https://example.com',
                        environmentId: 'env-123',
                        storeView: 'default',
                        websiteCode: 'base',
                        storeCode: 'default',
                    },
                    services: {
                        liveSearch: {
                            enabled: true,
                            endpoint: 'https://search.example.com',
                        },
                    },
                },
            };

            // When: Getting the catalog API key
            const result = getCatalogApiKey(project as Project);

            // Then: Should return empty string
            expect(result).toBe('');
        });

        it('should return empty string when apiKey is undefined', () => {
            // Given: A project with catalog service but no API key
            const project: Partial<Project> = {
                commerce: {
                    type: 'platform-as-a-service',
                    instance: {
                        url: 'https://example.com',
                        environmentId: 'env-123',
                        storeView: 'default',
                        websiteCode: 'base',
                        storeCode: 'default',
                    },
                    services: {
                        catalog: {
                            enabled: true,
                            endpoint: 'https://catalog.example.com',
                            // apiKey is undefined
                        },
                    },
                },
            };

            // When: Getting the catalog API key
            const result = getCatalogApiKey(project as Project);

            // Then: Should return empty string
            expect(result).toBe('');
        });
    });

    describe('getLiveSearchApiKey', () => {
        it('should return API key when fully present', () => {
            // Given: A project with complete liveSearch service configuration
            const project: Partial<Project> = {
                commerce: {
                    type: 'platform-as-a-service',
                    instance: {
                        url: 'https://example.com',
                        environmentId: 'env-123',
                        storeView: 'default',
                        websiteCode: 'base',
                        storeCode: 'default',
                    },
                    services: {
                        liveSearch: {
                            enabled: true,
                            endpoint: 'https://search.example.com',
                            apiKey: 'live-search-api-key-456',
                        },
                    },
                },
            };

            // When: Getting the live search API key
            const result = getLiveSearchApiKey(project as Project);

            // Then: Should return the API key
            expect(result).toBe('live-search-api-key-456');
        });

        it('should return empty string when commerce is undefined', () => {
            // Given: A project without commerce configuration
            const project: Partial<Project> = {
                name: 'Test Project',
            };

            // When: Getting the live search API key
            const result = getLiveSearchApiKey(project as Project);

            // Then: Should return empty string
            expect(result).toBe('');
        });

        it('should return empty string when services is undefined', () => {
            // Given: A project with commerce but no services
            const project: Partial<Project> = {
                commerce: {
                    type: 'platform-as-a-service',
                    instance: {
                        url: 'https://example.com',
                        environmentId: 'env-123',
                        storeView: 'default',
                        websiteCode: 'base',
                        storeCode: 'default',
                    },
                    services: {},
                },
            };

            // When: Getting the live search API key
            const result = getLiveSearchApiKey(project as Project);

            // Then: Should return empty string
            expect(result).toBe('');
        });

        it('should return empty string when liveSearch is undefined', () => {
            // Given: A project with services but no liveSearch
            const project: Partial<Project> = {
                commerce: {
                    type: 'platform-as-a-service',
                    instance: {
                        url: 'https://example.com',
                        environmentId: 'env-123',
                        storeView: 'default',
                        websiteCode: 'base',
                        storeCode: 'default',
                    },
                    services: {
                        catalog: {
                            enabled: true,
                            endpoint: 'https://catalog.example.com',
                        },
                    },
                },
            };

            // When: Getting the live search API key
            const result = getLiveSearchApiKey(project as Project);

            // Then: Should return empty string
            expect(result).toBe('');
        });

        it('should return empty string when apiKey is undefined', () => {
            // Given: A project with liveSearch service but no API key
            const project: Partial<Project> = {
                commerce: {
                    type: 'platform-as-a-service',
                    instance: {
                        url: 'https://example.com',
                        environmentId: 'env-123',
                        storeView: 'default',
                        websiteCode: 'base',
                        storeCode: 'default',
                    },
                    services: {
                        liveSearch: {
                            enabled: true,
                            endpoint: 'https://search.example.com',
                            // apiKey is undefined
                        },
                    },
                },
            };

            // When: Getting the live search API key
            const result = getLiveSearchApiKey(project as Project);

            // Then: Should return empty string
            expect(result).toBe('');
        });
    });

    describe('both accessors together', () => {
        it('should handle project with both catalog and liveSearch configured', () => {
            // Given: A project with both services configured
            const project: Partial<Project> = {
                commerce: {
                    type: 'platform-as-a-service',
                    instance: {
                        url: 'https://example.com',
                        environmentId: 'env-123',
                        storeView: 'default',
                        websiteCode: 'base',
                        storeCode: 'default',
                    },
                    services: {
                        catalog: {
                            enabled: true,
                            endpoint: 'https://catalog.example.com',
                            apiKey: 'catalog-key',
                        },
                        liveSearch: {
                            enabled: true,
                            endpoint: 'https://search.example.com',
                            apiKey: 'search-key',
                        },
                    },
                },
            };

            // When: Getting both API keys
            const catalogKey = getCatalogApiKey(project as Project);
            const searchKey = getLiveSearchApiKey(project as Project);

            // Then: Should return the correct keys
            expect(catalogKey).toBe('catalog-key');
            expect(searchKey).toBe('search-key');
        });

        it('should handle completely empty project gracefully', () => {
            // Given: An empty project object
            const project = {} as Project;

            // When: Getting both API keys
            const catalogKey = getCatalogApiKey(project);
            const searchKey = getLiveSearchApiKey(project);

            // Then: Should return empty strings without throwing
            expect(catalogKey).toBe('');
            expect(searchKey).toBe('');
        });
    });
});
