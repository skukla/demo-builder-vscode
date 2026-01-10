/**
 * EDS StoreConfig Fetch Tests
 *
 * Tests for the fetchStoreConfig method in EnvConfigPhase class.
 * This method dynamically fetches store configuration IDs from Commerce
 * GraphQL endpoint, enabling dynamic replacement of hardcoded IDs.
 *
 * Key requirements:
 * - Returns StoreConfig on successful response
 * - Returns null on any failure (graceful fallback)
 * - No user-visible errors (silent degradation)
 * - 10-second timeout consistent with edsHandlers.ts pattern
 */

// Mock vscode
jest.mock('vscode');

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Create mock logger
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

import { EnvConfigPhase } from '@/features/eds/services/edsSetupPhases';

// Mock generateConfigFile to capture placeholders
const mockGenerateConfigFile = jest.fn().mockResolvedValue(undefined);
jest.mock('@/core/config/configFileGenerator', () => ({
    generateConfigFile: (...args: unknown[]) => mockGenerateConfigFile(...args),
    updateConfigFile: jest.fn().mockResolvedValue(undefined),
}));

describe('EnvConfigPhase - fetchStoreConfig', () => {
    // Type-safe access to private method
    let phase: EnvConfigPhase;
    let fetchStoreConfig: (graphqlEndpoint: string) => Promise<{ storeViewId: string; websiteId: string; rootCategoryId: string } | null>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create instance and access private method
        phase = new EnvConfigPhase(mockLogger as any);
        fetchStoreConfig = (phase as any)['fetchStoreConfig'].bind(phase);
    });

    describe('successful response handling', () => {
        it('should return parsed StoreConfig on successful response', async () => {
            // Given: A GraphQL endpoint that returns valid storeConfig data
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            const mockResponse = {
                data: {
                    storeConfig: {
                        id: 1,
                        website_id: 2,
                        root_category_id: 3,
                    },
                },
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve(mockResponse),
            });

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns parsed StoreConfig with string values
            expect(result).toEqual({
                storeViewId: '1',
                websiteId: '2',
                rootCategoryId: '3',
            });
        });

        it('should convert numeric IDs to strings', async () => {
            // Given: Response with numeric IDs
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        storeConfig: {
                            id: 5,
                            website_id: 10,
                            root_category_id: 15,
                        },
                    },
                }),
            });

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: IDs are converted to strings
            expect(result?.storeViewId).toBe('5');
            expect(result?.websiteId).toBe('10');
            expect(result?.rootCategoryId).toBe('15');
            expect(typeof result?.storeViewId).toBe('string');
        });
    });

    describe('error handling - network timeout', () => {
        it('should return null on network timeout (AbortError)', async () => {
            // Given: A fetch that times out
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';

            mockFetch.mockRejectedValueOnce(abortError);

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null (graceful fallback)
            expect(result).toBeNull();
        });

        it('should log timeout error for debugging', async () => {
            // Given: A fetch that times out
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';

            mockFetch.mockRejectedValueOnce(abortError);

            // When: fetchStoreConfig is called
            await fetchStoreConfig(graphqlEndpoint);

            // Then: Error is logged for debugging
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('storeConfig fetch error')
            );
        });
    });

    describe('error handling - invalid JSON response', () => {
        it('should return null on invalid JSON response', async () => {
            // Given: A response with invalid JSON
            const graphqlEndpoint = 'https://commerce.example.com/graphql';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.reject(new SyntaxError('Unexpected token')),
            });

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null (graceful fallback)
            expect(result).toBeNull();
        });
    });

    describe('error handling - missing fields in response', () => {
        it('should return null when id field is missing', async () => {
            // Given: Response missing id field
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        storeConfig: {
                            website_id: 2,
                            root_category_id: 3,
                        },
                    },
                }),
            });

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should return null when website_id field is missing', async () => {
            // Given: Response missing website_id
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        storeConfig: {
                            id: 1,
                            root_category_id: 3,
                        },
                    },
                }),
            });

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should return null when root_category_id field is missing', async () => {
            // Given: Response missing root_category_id
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        storeConfig: {
                            id: 1,
                            website_id: 2,
                        },
                    },
                }),
            });

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should return null when storeConfig is null', async () => {
            // Given: Response with null storeConfig
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        storeConfig: null,
                    },
                }),
            });

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should return null when data is missing', async () => {
            // Given: Response with no data field
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({}),
            });

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should log when missing fields detected', async () => {
            // Given: Response missing required fields
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        storeConfig: {
                            id: 1,
                        },
                    },
                }),
            });

            // When: fetchStoreConfig is called
            await fetchStoreConfig(graphqlEndpoint);

            // Then: Missing fields are logged
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('missing required fields')
            );
        });
    });

    describe('error handling - HTTP errors', () => {
        it('should return null on HTTP 404 error', async () => {
            // Given: A 404 response
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found',
            });

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should return null on HTTP 500 error', async () => {
            // Given: A 500 response
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should return null on HTTP 401 unauthorized', async () => {
            // Given: A 401 response (even though query should be public)
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
            });

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should log HTTP error status for debugging', async () => {
            // Given: An HTTP error response
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 503,
                statusText: 'Service Unavailable',
            });

            // When: fetchStoreConfig is called
            await fetchStoreConfig(graphqlEndpoint);

            // Then: Status is logged for debugging
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('503')
            );
        });
    });

    describe('GraphQL request format', () => {
        it('should use correct GraphQL query', async () => {
            // Given: A GraphQL endpoint
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        storeConfig: {
                            id: 1,
                            website_id: 2,
                            root_category_id: 3,
                        },
                    },
                }),
            });

            // When: fetchStoreConfig is called
            await fetchStoreConfig(graphqlEndpoint);

            // Then: Correct query is sent
            expect(mockFetch).toHaveBeenCalledWith(
                graphqlEndpoint,
                expect.objectContaining({
                    body: expect.stringContaining('storeConfig'),
                })
            );

            // Verify the exact query structure
            const [, fetchOptions] = mockFetch.mock.calls[0];
            const body = JSON.parse(fetchOptions.body);
            expect(body.query).toContain('id');
            expect(body.query).toContain('website_id');
            expect(body.query).toContain('root_category_id');
        });

        it('should use correct HTTP method and headers', async () => {
            // Given: A GraphQL endpoint
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        storeConfig: {
                            id: 1,
                            website_id: 2,
                            root_category_id: 3,
                        },
                    },
                }),
            });

            // When: fetchStoreConfig is called
            await fetchStoreConfig(graphqlEndpoint);

            // Then: Correct method and headers are used
            expect(mockFetch).toHaveBeenCalledWith(
                graphqlEndpoint,
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                    }),
                })
            );
        });

        it('should include 10-second timeout signal', async () => {
            // Given: A GraphQL endpoint
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        storeConfig: {
                            id: 1,
                            website_id: 2,
                            root_category_id: 3,
                        },
                    },
                }),
            });

            // When: fetchStoreConfig is called
            await fetchStoreConfig(graphqlEndpoint);

            // Then: AbortSignal with 10s timeout is included
            const [, fetchOptions] = mockFetch.mock.calls[0];
            expect(fetchOptions.signal).toBeDefined();
            // Note: We can't directly verify the timeout value, but we verify signal exists
        });
    });

    describe('edge cases', () => {
        it('should handle network errors gracefully', async () => {
            // Given: A network error
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null (no throw)
            expect(result).toBeNull();
        });

        it('should handle DNS resolution errors gracefully', async () => {
            // Given: A DNS error
            const graphqlEndpoint = 'https://invalid-host.example.com/graphql';
            const dnsError = new Error('getaddrinfo ENOTFOUND invalid-host.example.com');
            mockFetch.mockRejectedValueOnce(dnsError);

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should handle zero values in response', async () => {
            // Given: Response with zero values (valid but unusual)
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        storeConfig: {
                            id: 0,
                            website_id: 0,
                            root_category_id: 0,
                        },
                    },
                }),
            });

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns parsed config (0 is a valid ID)
            expect(result).toEqual({
                storeViewId: '0',
                websiteId: '0',
                rootCategoryId: '0',
            });
        });

        it('should handle string IDs in response', async () => {
            // Given: Response with string IDs (some APIs return strings)
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        storeConfig: {
                            id: '7',
                            website_id: '8',
                            root_category_id: '9',
                        },
                    },
                }),
            });

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns parsed config with string values
            expect(result).toEqual({
                storeViewId: '7',
                websiteId: '8',
                rootCategoryId: '9',
            });
        });
    });

    describe('security - SSRF prevention', () => {
        it('should return null for localhost URLs (SSRF prevention)', async () => {
            // Given: A localhost URL (SSRF attack vector)
            const graphqlEndpoint = 'https://localhost:3000/graphql';

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null (blocked by URL validation)
            expect(result).toBeNull();
            // Verify fetch was NOT called (blocked before network request)
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should return null for 127.0.0.1 URLs (SSRF prevention)', async () => {
            // Given: A loopback IP URL
            const graphqlEndpoint = 'https://127.0.0.1/graphql';

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null (blocked by URL validation)
            expect(result).toBeNull();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should return null for private network IPs (SSRF prevention)', async () => {
            // Given: A private network IP (192.168.x.x)
            const graphqlEndpoint = 'https://192.168.1.1/graphql';

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null (blocked by URL validation)
            expect(result).toBeNull();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should return null for cloud metadata endpoint URLs (SSRF prevention)', async () => {
            // Given: AWS metadata endpoint (common SSRF target)
            const graphqlEndpoint = 'https://169.254.169.254/latest/meta-data/';

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null (blocked by URL validation)
            expect(result).toBeNull();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should return null for non-HTTPS URLs (protocol validation)', async () => {
            // Given: An HTTP (not HTTPS) URL
            const graphqlEndpoint = 'http://commerce.example.com/graphql';

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Returns null (blocked by URL validation)
            expect(result).toBeNull();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should log debug message when URL validation fails', async () => {
            // Given: An invalid URL
            const graphqlEndpoint = 'https://localhost/graphql';

            // When: fetchStoreConfig is called
            await fetchStoreConfig(graphqlEndpoint);

            // Then: Error is logged for debugging
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('storeConfig fetch error')
            );
        });

        it('should allow valid external HTTPS URLs', async () => {
            // Given: A valid external HTTPS URL
            const graphqlEndpoint = 'https://commerce.example.com/graphql';
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        storeConfig: {
                            id: 1,
                            website_id: 2,
                            root_category_id: 3,
                        },
                    },
                }),
            });

            // When: fetchStoreConfig is called
            const result = await fetchStoreConfig(graphqlEndpoint);

            // Then: Fetch is called and result is returned
            expect(mockFetch).toHaveBeenCalledWith(
                graphqlEndpoint,
                expect.any(Object)
            );
            expect(result).not.toBeNull();
        });
    });
});

/**
 * Tests for generateConfigJson integration with fetchStoreConfig
 *
 * These tests verify that generateConfigJson:
 * - Uses dynamic store IDs when fetchStoreConfig succeeds
 * - Falls back to hardcoded defaults (1, 1, 1, 2) when fetchStoreConfig fails
 * - Skips storeConfig fetch when meshEndpoint is not available
 * - Logs appropriate messages indicating which mode was used
 */
describe('EnvConfigPhase - generateConfigJson with dynamic store IDs', () => {
    let phase: EnvConfigPhase;

    // Base config for PaaS backend tests
    const baseConfig = {
        projectName: 'test-project',
        projectPath: '/test/path',
        componentPath: '/test/path/components/eds-storefront',
        repoName: 'test-repo',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
        githubOwner: 'test-owner',
        backendComponentId: 'adobe-commerce-paas',
        backendEnvVars: {
            ADOBE_CATALOG_API_KEY: 'test-api-key',
            ADOBE_COMMERCE_ENVIRONMENT_ID: 'test-env-id',
            ADOBE_COMMERCE_STORE_VIEW_CODE: 'default',
            ADOBE_COMMERCE_WEBSITE_CODE: 'base',
            ADOBE_COMMERCE_STORE_CODE: 'main_website_store',
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
        phase = new EnvConfigPhase(mockLogger as any);
    });

    describe('dynamic store ID population', () => {
        it('should use dynamic store IDs when fetchStoreConfig succeeds', async () => {
            // Given: A config with mesh endpoint and a successful storeConfig response
            const configWithMesh = {
                ...baseConfig,
                meshEndpoint: 'https://mesh.example.com/graphql',
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        storeConfig: {
                            id: 5,
                            website_id: 3,
                            root_category_id: 42,
                        },
                    },
                }),
            });

            // When: generateConfigJson is called
            await phase.generateConfigJson(configWithMesh as any);

            // Then: The placeholders should contain dynamic store IDs
            expect(mockGenerateConfigFile).toHaveBeenCalledTimes(1);
            const callArgs = mockGenerateConfigFile.mock.calls[0][0];
            const placeholders = callArgs.placeholders;

            expect(placeholders['{STORE_VIEW_ID}']).toBe('5');
            expect(placeholders['{WEBSITE_ID}']).toBe('3');
            expect(placeholders['{YOUR_ROOT_CATEGORY_ID}']).toBe('42');
            // STORE_ID remains hardcoded (not available via storeConfig query)
            expect(placeholders['{STORE_ID}']).toBe('1');
        });

        it('should use hardcoded defaults when fetchStoreConfig returns null', async () => {
            // Given: A config with mesh endpoint but storeConfig fetch fails
            const configWithMesh = {
                ...baseConfig,
                meshEndpoint: 'https://mesh.example.com/graphql',
            };

            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            // When: generateConfigJson is called
            await phase.generateConfigJson(configWithMesh as any);

            // Then: The placeholders should contain hardcoded defaults
            expect(mockGenerateConfigFile).toHaveBeenCalledTimes(1);
            const callArgs = mockGenerateConfigFile.mock.calls[0][0];
            const placeholders = callArgs.placeholders;

            expect(placeholders['{STORE_ID}']).toBe('1');
            expect(placeholders['{STORE_VIEW_ID}']).toBe('1');
            expect(placeholders['{WEBSITE_ID}']).toBe('1');
            expect(placeholders['{YOUR_ROOT_CATEGORY_ID}']).toBe('2');
        });

        it('should skip storeConfig fetch when meshEndpoint is not available', async () => {
            // Given: A config without mesh endpoint
            const configWithoutMesh = {
                ...baseConfig,
                // meshEndpoint is undefined
            };

            // When: generateConfigJson is called
            await phase.generateConfigJson(configWithoutMesh as any);

            // Then: fetch should NOT be called (storeConfig fetch is skipped)
            expect(mockFetch).not.toHaveBeenCalled();

            // And: hardcoded defaults should be used
            expect(mockGenerateConfigFile).toHaveBeenCalledTimes(1);
            const callArgs = mockGenerateConfigFile.mock.calls[0][0];
            const placeholders = callArgs.placeholders;

            expect(placeholders['{STORE_ID}']).toBe('1');
            expect(placeholders['{STORE_VIEW_ID}']).toBe('1');
            expect(placeholders['{WEBSITE_ID}']).toBe('1');
            expect(placeholders['{YOUR_ROOT_CATEGORY_ID}']).toBe('2');
        });
    });

    describe('logging behavior', () => {
        it('should log info message when using dynamic store IDs', async () => {
            // Given: A config with mesh endpoint and successful storeConfig response
            const configWithMesh = {
                ...baseConfig,
                meshEndpoint: 'https://mesh.example.com/graphql',
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: () => Promise.resolve({
                    data: {
                        storeConfig: {
                            id: 5,
                            website_id: 3,
                            root_category_id: 42,
                        },
                    },
                }),
            });

            // When: generateConfigJson is called
            await phase.generateConfigJson(configWithMesh as any);

            // Then: Info log should indicate dynamic mode
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('dynamic')
            );
        });

        it('should log info message when falling back to defaults', async () => {
            // Given: A config with mesh endpoint but storeConfig fetch fails
            const configWithMesh = {
                ...baseConfig,
                meshEndpoint: 'https://mesh.example.com/graphql',
            };

            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            // When: generateConfigJson is called
            await phase.generateConfigJson(configWithMesh as any);

            // Then: Info log should indicate fallback mode
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('default')
            );
        });

        it('should log debug message when skipping storeConfig fetch', async () => {
            // Given: A config without mesh endpoint
            const configWithoutMesh = {
                ...baseConfig,
                // meshEndpoint is undefined
            };

            // When: generateConfigJson is called
            await phase.generateConfigJson(configWithoutMesh as any);

            // Then: Debug log should indicate skipping storeConfig fetch
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Skipping storeConfig')
            );
        });
    });
});
