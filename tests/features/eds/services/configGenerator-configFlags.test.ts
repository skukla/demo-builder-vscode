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
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';

describe("configGenerator — flags, escaping & params", () => {
    let mockLogger: Logger;

    beforeEach(() => {
        mockLogger = createMockLogger() as unknown as Logger;
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
            // {ORG} is embedded inside the analytics store-url string. The exact
            // URL, not a substring: an escaping bug that emitted the quote and
            // then mangled the rest of the template would still "contain" it.
            expect(config.public.default.analytics['store-url']).toBe(
                'https://main--test-repo--evil"owner.aem.live/',
            );
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

        /** The config with no addons at all — what "injects nothing" must equal. */
        const noAddonsBaseline = () => {
            const result = generateConfigJson(baseParams, mockLogger);
            expect(result.success).toBe(true);
            return result.content!;
        };

        it('the no-addon baseline is a real config, not an empty one', () => {
            // The control for the rows below: they assert byte-identity to this
            // string, which would also hold if generation had produced nothing.
            const config = JSON.parse(noAddonsBaseline());

            expect(config.public.default['commerce-endpoint']).toBe(
                'https://commerce.example.com/graphql',
            );
            expect(config.public.default['commerce-b2b-enabled']).toBeUndefined();
            expect(config.public.default['commerce-companies-enabled']).toBeUndefined();
        });

        // Byte-identity to the baseline, not two absent flags: "injects nothing"
        // is a claim about the WHOLE config, and naming the two B2B keys would
        // pass an injector that wrote some other key.
        it.each<[string, string[]]>([
            ['an empty addons array', []],
            ['an addon whose catalog entry declares no configFlags', ['adobe-commerce-aco']],
            ['an addon id that is in no catalog at all', ['nonexistent-addon']],
        ])('injects nothing for %s', (_label, selectedAddons) => {
            const result = generateConfigJson({ ...baseParams, selectedAddons }, mockLogger);

            expect(result.success).toBe(true);
            expect(result.content).toBe(noAddonsBaseline());
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

        // The commerce-account-nav block only builds links inside an
        // auth/permissions callback, which fires only when
        // commerce-b2b-enabled === true. Both of these packages are B2B+B2C
        // hybrids and declare the flags in demo-packages.json (configFlags):
        // B2C customers still get the standard view, B2B customers the company nav.
        it.each<[string, string]>([
            ['custom, the unbranded hybrid', 'custom'],
            ['citisignal, the hybrid on the b2b boilerplate template', 'citisignal'],
        ])('injects the B2B flags for %s', (_label, selectedPackage) => {
            const result = generateConfigJson({ ...baseParams, selectedPackage }, mockLogger);

            expect(result.success).toBe(true);
            const config = JSON.parse(result.content!);
            expect(config.public.default['commerce-b2b-enabled']).toBe(true);
            expect(config.public.default['commerce-companies-enabled']).toBe(true);
        });

        /** The config with no package selected — what "injects nothing" must equal. */
        const noPackageBaseline = () => {
            const result = generateConfigJson(baseParams, mockLogger);
            expect(result.success).toBe(true);
            return result.content!;
        };

        it('the no-package baseline carries neither B2B flag', () => {
            // The control for the rows below, which assert byte-identity to it.
            const config = JSON.parse(noPackageBaseline());

            expect(config.public.default['commerce-b2b-enabled']).toBeUndefined();
            expect(config.public.default['commerce-companies-enabled']).toBeUndefined();
        });

        it.each<[string, string]>([
            ['a package whose definition declares no configFlags', 'isle5'],
            ['a package id that is in no catalog at all', 'nonexistent-package'],
        ])('injects nothing for %s', (_label, selectedPackage) => {
            const result = generateConfigJson({ ...baseParams, selectedPackage }, mockLogger);

            expect(result.success).toBe(true);
            expect(result.content).toBe(noPackageBaseline());
        });

        it('extractConfigParams threads selectedPackage from the project (reset path)', () => {
            const project = createMockProject({
                selectedPackage: 'custom',
                componentConfigs: {},
                componentSelections: { backend: 'adobe-commerce-paas' },
            });

            const params = extractConfigParams(project);

            expect(params.selectedPackage).toBe('custom');
        });
    });

    describe('buildConfigGeneratorParams', () => {
        function projectWithEdsMetadata(overrides: Record<string, unknown> = {}): Project {
            return createMockProject({
                selectedPackage: 'custom',
                componentConfigs: {},
                componentSelections: { backend: 'adobe-commerce-paas' },
                componentInstances: {
                    [COMPONENT_IDS.EDS_STOREFRONT]: {
                        id: COMPONENT_IDS.EDS_STOREFRONT,
                        name: 'EDS Storefront',
                        status: 'ready',
                        path: '/test/eds',
                        metadata: {
                            githubRepo: 'acme-org/acme-repo',
                            daLiveOrg: 'acme-da-org',
                            daLiveSite: 'acme-da-site',
                        },
                    },
                },
                ...overrides,
            });
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

        it('falls back to the repo name when the metadata carries no daLiveSite', () => {
            // Not a defensive default: the project loader DROPS daLiveSite when
            // it equals the repo name, so on those manifests this fallback is
            // the only thing that puts a site into the DA.live coordinates.
            const params = buildConfigGeneratorParams(
                projectWithEdsMetadata({
                    componentInstances: {
                        [COMPONENT_IDS.EDS_STOREFRONT]: {
                            id: COMPONENT_IDS.EDS_STOREFRONT,
                            name: 'EDS Storefront',
                            status: 'ready',
                            metadata: {
                                githubRepo: 'acme-org/acme-repo',
                                daLiveOrg: 'acme-da-org',
                            },
                        },
                    },
                }),
            );

            expect(params.repoName).toBe('acme-repo');
            expect(params.daLiveSite).toBe('acme-repo');
        });

        it('falls back to empty coordinates when EDS metadata is missing', () => {
            const params = buildConfigGeneratorParams(createMockProject({
                componentConfigs: {},
                componentSelections: {},
            }));

            expect(params.githubOwner).toBe('');
            expect(params.repoName).toBe('');
            expect(params.daLiveOrg).toBe('');
            expect(params.daLiveSite).toBe('');
        });
    });
});
