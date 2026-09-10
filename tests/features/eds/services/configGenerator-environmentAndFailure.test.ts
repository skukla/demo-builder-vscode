/**
 * configGenerator — the environment-type fork, the failure wrapper, and the
 * reads that must survive a project manifest missing a whole collection.
 *
 * Split out of configGenerator.test.ts to stay under the test-file-size limit.
 *
 * The fork matters because `commerce-core-endpoint` decides where the
 * storefront sends catalog queries: on PaaS it is the Catalog Service, and on
 * ACCS/ACO the same mesh endpoint as everything else. Getting it backwards
 * produces a config.json that parses, publishes and serves empty catalogs.
 */

import {
    generateConfigJson,
    extractConfigParams,
    extractConfigParamsFromConfigs,
    buildConfigGeneratorParams,
    type ConfigGeneratorParams,
} from '@/features/eds/services/configGenerator';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';

describe('configGenerator — environment fork and failure reporting', () => {
    let mockLogger: Logger;

    beforeEach(() => {
        mockLogger = createMockLogger() as unknown as Logger;
    });

    const baseParams: ConfigGeneratorParams = {
        githubOwner: 'acme',
        repoName: 'acme-store',
        daLiveOrg: 'acme-da',
        daLiveSite: 'acme-da-site',
        commerceEndpoint: 'https://mesh.example.com/graphql',
        catalogServiceEndpoint: 'https://catalog.example.com/graphql',
    };

    /** The generated config, or a failure if generation refused. */
    const generate = (params: ConfigGeneratorParams) => {
        const result = generateConfigJson(params, mockLogger);
        expect(result.success).toBe(true);
        return JSON.parse(result.content!);
    };

    /**
     * Both endpoints on every row, never `commerce-core-endpoint` alone.
     *
     * On ACCS and ACO the two are EQUAL, and the storefront reads the
     * *existence* of `commerce-core-endpoint` to decide which requests carry cs
     * headers (Magento-Website-Code on ACCS, AC-View-ID on ACO). An assertion
     * that only names the core endpoint cannot tell "kept, equal to the
     * commerce endpoint" from "dropped, and the reader fell back".
     */
    describe('commerce-core-endpoint follows the environment type', () => {
        const MESH = 'https://mesh.example.com/graphql';
        const CATALOG = 'https://catalog.example.com/graphql';

        it.each<[string, ConfigGeneratorParams, string]>([
            ['on PaaS it is the Catalog Service endpoint, kept separate from the mesh',
                { ...baseParams, environmentType: 'paas' }, CATALOG],
            // ACCS serves catalog through the same endpoint. Threading the
            // PaaS-only catalog URL here points cs queries at a host ACCS
            // projects do not have.
            ['on ACCS it is the commerce endpoint, and the catalog value is ignored',
                { ...baseParams, environmentType: 'accs' }, MESH],
            ['on ACO it is the commerce endpoint too',
                { ...baseParams, environmentType: 'aco' }, MESH],
            // The default has to be a real environment: falling through to the
            // ACCS shape would drop the Catalog Service split on every project
            // whose backend was not recorded.
            ['an ABSENT environment type is treated as PaaS, not as neither',
                { ...baseParams, environmentType: undefined }, CATALOG],
            ['falls back to the commerce endpoint when PaaS has no catalog endpoint',
                { ...baseParams, environmentType: 'paas', catalogServiceEndpoint: undefined },
                MESH],
        ])('%s', (_label, params, expectedCore) => {
            const config = generate(params);

            expect(config.public.default['commerce-core-endpoint']).toBe(expectedCore);
            expect(config.public.default['commerce-endpoint']).toBe(MESH);
        });
    });

    describe('ACCS drops the PaaS-only fields it must never publish', () => {
        /**
         * A manifest that still carries the PaaS keys under an ACCS backend —
         * the shape a project has after its backend is switched, since nothing
         * deletes the old component's config.
         *
         * Without the `isAccs` guards these values would be extracted and
         * reach generateHeaders, which on ACCS emits neither — but they would
         * also reach every other consumer of the returned params. The guards
         * are only observable against a config that HAS the keys, which is why
         * no other case in this family can see them.
         */
        const accsProjectStillCarryingPaasKeys = {
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: 'https://accs.example.com/graphql',
                ACCS_STORE_VIEW_CODE: 'citisignal_us',
                ACCS_STORE_CODE: 'citisignal_store',
                ACCS_WEBSITE_CODE: 'citisignal',
                ACCS_CUSTOMER_GROUP: 'group-hash',
                // Real key names, read off envVarKeys.ts — a plausible-looking
                // one the reader never looks up would leave every guard below
                // passing for the wrong reason.
                PAAS_CATALOG_SERVICE_ENDPOINT: 'https://catalog.example.com/graphql',
                ADOBE_CATALOG_API_KEY: 'fake-test-key-not-a-secret',
                ADOBE_COMMERCE_ENVIRONMENT_ID: 'env-abc-123',
            },
        };

        it('extracts none of the catalog endpoint, API key or environment id', () => {
            const params = extractConfigParamsFromConfigs(
                accsProjectStillCarryingPaasKeys,
                undefined,
                'adobe-commerce-accs'
            );

            expect(params).toStrictEqual({
                environmentType: 'accs',
                commerceEndpoint: 'https://accs.example.com/graphql',
                catalogServiceEndpoint: undefined,
                commerceApiKey: undefined,
                commerceEnvironmentId: undefined,
                storeViewCode: 'citisignal_us',
                storeCode: 'citisignal_store',
                websiteCode: 'citisignal',
                customerGroup: 'group-hash',
                aemAssetsEnabled: false,
            });
        });

        it('publishes the ACCS endpoint as commerce-core-endpoint, not the leftover catalog URL', () => {
            const config = generate({
                ...baseParams,
                ...extractConfigParamsFromConfigs(
                    accsProjectStillCarryingPaasKeys,
                    undefined,
                    'adobe-commerce-accs'
                ),
            });

            expect(config.public.default['commerce-core-endpoint']).toBe(
                'https://accs.example.com/graphql'
            );
            expect(config.public.default['commerce-endpoint']).toBe(
                'https://accs.example.com/graphql'
            );
        });
    });

    describe('generation reports failure instead of throwing', () => {
        /**
         * Params whose `repoName` throws when read.
         *
         * The wrapper exists for the unforeseen — a manifest field that cannot
         * be read, a template that will not parse. A getter is the smallest way
         * to reach it without pretending some specific input causes it.
         */
        const paramsThatThrow = (thrown: unknown): ConfigGeneratorParams => ({
            ...baseParams,
            get repoName(): string {
                throw thrown;
            },
        });

        it('returns success:false carrying the thrown Error message', () => {
            const result = generateConfigJson(
                paramsThatThrow(new Error('manifest read failed')),
                mockLogger
            );

            expect(result).toEqual({ success: false, error: 'manifest read failed' });
        });

        it('stringifies a non-Error throw rather than reporting an empty reason', () => {
            const result = generateConfigJson(paramsThatThrow('template exploded'), mockLogger);

            expect(result).toEqual({ success: false, error: 'template exploded' });
        });
    });

    describe('reads survive a manifest with whole collections absent', () => {
        it('buildConfigGeneratorParams answers empty coordinates with no componentInstances', () => {
            // Projects written by older extension versions reach these readers
            // with fields that were never persisted; a throw here takes down
            // both EDS Reset and storefront republish.
            const project = createMockProject({
                componentInstances: undefined,
                componentConfigs: {},
            }) as Project;

            const params = buildConfigGeneratorParams(project);

            expect(params.githubOwner).toBe('');
            expect(params.repoName).toBe('');
            expect(params.daLiveSite).toBe('');
        });

        it('extractConfigParams defaults to PaaS with no componentSelections', () => {
            const project = createMockProject({
                componentSelections: undefined,
                componentConfigs: {},
            }) as Project;

            const params = extractConfigParams(project);

            expect(params.environmentType).toBe('paas');
        });
    });

    describe('aemAssetsEnabled is a strict string comparison', () => {
        it('is true only for the exact string "true"', () => {
            const params = extractConfigParamsFromConfigs({
                'eds-storefront': { AEM_ASSETS_ENABLED: 'true' },
            });

            expect(params.aemAssetsEnabled).toBe(true);
        });

        it('is false when the flag says "false"', () => {
            const params = extractConfigParamsFromConfigs({
                'eds-storefront': { AEM_ASSETS_ENABLED: 'false' },
            });

            expect(params.aemAssetsEnabled).toBe(false);
        });

        it('is false when the flag is absent entirely', () => {
            const params = extractConfigParamsFromConfigs({ 'eds-storefront': {} });

            expect(params.aemAssetsEnabled).toBe(false);
        });

        it('reaches config.json as a real boolean, not the string it came from', () => {
            const config = generate({
                ...baseParams,
                environmentType: 'paas',
                aemAssetsEnabled: true,
            });

            expect(config.public.default['commerce-assets-enabled']).toBe(true);
        });

        it('is present and false when assets are off, never absent', () => {
            // The storefront reads the property; an absent one is not the same
            // as a false one.
            const config = generate({
                ...baseParams,
                environmentType: 'paas',
                aemAssetsEnabled: false,
            });

            expect(config.public.default['commerce-assets-enabled']).toBe(false);
        });
    });
});
