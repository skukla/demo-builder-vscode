/**
 * Config Generator Tests — config-flag injection, placeholder escaping, and
 * param assembly (buildConfigGeneratorParams).
 *
 * Split out of configGenerator.test.ts to stay under the test-file-size limit.
 */

import {
    generateConfigJson,
    extractConfigParams,
    buildConfigGeneratorParams,
    type ConfigGeneratorParams,
} from "@/features/eds/services/configGenerator";
import { COMPONENT_IDS } from "@/core/constants";
import type { Project } from "@/types/base";
import type { Logger } from "@/types/logger";

describe("configGenerator — flags, escaping & params", () => {
    let mockLogger: Logger;

    beforeEach(() => {
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;
    });

    describe('placeholder value escaping', () => {
        const baseParams: ConfigGeneratorParams = {
            githubOwner: 'test-owner',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            environmentType: 'paas',
        };

        it('produces valid JSON when a substituted value contains a double quote', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                commerceEndpoint: 'https://commerce.example.com/"graphql',
            };

            const result = generateConfigJson(params, mockLogger);

            // Decisive: a raw split/join would emit a stray quote and break JSON.parse
            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-endpoint']).toBe('https://commerce.example.com/"graphql');
        });

        it('produces valid JSON when a substituted value contains a backslash', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                catalogServiceEndpoint: 'https://catalog\\example.com/graphql',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-core-endpoint']).toBe('https://catalog\\example.com/graphql');
        });

        it('produces valid JSON when the org slug embedded in URLs contains a quote', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                githubOwner: 'evil"owner',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            // {ORG} is embedded inside the analytics store-url string
            expect(config.public.default.analytics['store-url']).toContain('evil"owner');
        });
    });

    describe('addon config flags injection', () => {
        const baseParams: ConfigGeneratorParams = {
            githubOwner: 'test-owner',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            commerceEndpoint: 'https://commerce.example.com/graphql',
            storeViewCode: 'en_us',
            storeCode: 'us_store',
            websiteCode: 'us_website',
            environmentType: 'paas',
        };

        it('should not inject B2B flags when no addons selected', () => {
            const result = generateConfigJson(baseParams, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-b2b-enabled']).toBeUndefined();
            expect(config.public.default['commerce-companies-enabled']).toBeUndefined();
        });

        it('should not inject B2B flags when empty addons array', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                selectedAddons: [],
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-b2b-enabled']).toBeUndefined();
            expect(config.public.default['commerce-companies-enabled']).toBeUndefined();
        });

        it('should not inject flags for addon without configFlags', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                selectedAddons: ['adobe-commerce-aco'],
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            // ACO addon has no configFlags in its configuration
            expect(config.public.default['commerce-b2b-enabled']).toBeUndefined();
        });

        it('should gracefully handle unknown addon ID', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                selectedAddons: ['nonexistent-addon'],
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            // Should still generate valid config without errors
            const config = JSON.parse(result.content!);
            expect(config.public.default).toBeDefined();
        });
    });

    describe('package config flags injection', () => {
        const baseParams: ConfigGeneratorParams = {
            githubOwner: 'test-owner',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            commerceEndpoint: 'https://commerce.example.com/graphql',
            storeViewCode: 'en_us',
            storeCode: 'us_store',
            websiteCode: 'us_website',
            environmentType: 'paas',
        };

        it('should inject B2B config flags for the custom (unbranded hybrid) package', () => {
            // The commerce-account-nav block only builds links inside an
            // auth/permissions callback, which fires only when
            // commerce-b2b-enabled === true. The custom package (the unbranded
            // B2B+B2C hybrid) declares these flags in demo-packages.json (configFlags).
            const params: ConfigGeneratorParams = {
                ...baseParams,
                selectedPackage: 'custom',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-b2b-enabled']).toBe(true);
            expect(config.public.default['commerce-companies-enabled']).toBe(true);
        });

        it('should inject B2B config flags for the citisignal hybrid package', () => {
            // CitiSignal is a B2B+B2C hybrid on the b2b boilerplate template, so it
            // needs the same flags: the flag enables the B2B machinery
            // (auth/permissions queries roles); B2C customers still get the standard
            // view, B2B customers get the company nav.
            const params: ConfigGeneratorParams = {
                ...baseParams,
                selectedPackage: 'citisignal',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-b2b-enabled']).toBe(true);
            expect(config.public.default['commerce-companies-enabled']).toBe(true);
        });

        it('should not inject B2B flags for a package without configFlags', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                selectedPackage: 'isle5',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-b2b-enabled']).toBeUndefined();
            expect(config.public.default['commerce-companies-enabled']).toBeUndefined();
        });

        it('should not inject B2B flags when no package selected', () => {
            const result = generateConfigJson(baseParams, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-b2b-enabled']).toBeUndefined();
        });

        it('should gracefully handle unknown package ID', () => {
            const params: ConfigGeneratorParams = {
                ...baseParams,
                selectedPackage: 'nonexistent-package',
            };

            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default).toBeDefined();
            expect(config.public.default['commerce-b2b-enabled']).toBeUndefined();
        });

        it('extractConfigParams threads selectedPackage from the project (reset path)', () => {
            const project = {
                selectedPackage: 'custom',
                componentConfigs: {},
                componentSelections: { backend: 'adobe-commerce-paas' },
            } as unknown as Project;

            const params = extractConfigParams(project);

            expect(params.selectedPackage).toBe('custom');
        });
    });

    describe('buildConfigGeneratorParams', () => {
        function projectWithEdsMetadata(overrides: Record<string, unknown> = {}): Project {
            return {
                selectedPackage: 'custom',
                componentConfigs: {},
                componentSelections: { backend: 'adobe-commerce-paas' },
                componentInstances: {
                    [COMPONENT_IDS.EDS_STOREFRONT]: {
                        path: '/test/eds',
                        metadata: {
                            githubRepo: 'acme-org/acme-repo',
                            daLiveOrg: 'acme-da-org',
                            daLiveSite: 'acme-da-site',
                        },
                    },
                },
                ...overrides,
            } as unknown as Project;
        }

        it('derives repo coordinates from EDS metadata and threads config params', () => {
            const params = buildConfigGeneratorParams(projectWithEdsMetadata());

            expect(params.githubOwner).toBe('acme-org');
            expect(params.repoName).toBe('acme-repo');
            expect(params.daLiveOrg).toBe('acme-da-org');
            expect(params.daLiveSite).toBe('acme-da-site');
            // Threaded from extractConfigParams (proves the spread happened)
            expect(params.selectedPackage).toBe('custom');
            expect(params.environmentType).toBe('paas');
        });

        it('produces a config that generateConfigJson accepts end-to-end', () => {
            const params = buildConfigGeneratorParams(projectWithEdsMetadata());
            const result = generateConfigJson(params, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            // B2B flags flow through from selectedPackage
            expect(config.public.default['commerce-b2b-enabled']).toBe(true);
        });

        it('falls back to empty coordinates when EDS metadata is missing', () => {
            const params = buildConfigGeneratorParams({
                componentConfigs: {},
                componentSelections: {},
            } as unknown as Project);

            expect(params.githubOwner).toBe('');
            expect(params.repoName).toBe('');
            expect(params.daLiveOrg).toBe('');
            expect(params.daLiveSite).toBe('');
        });
    });
});
