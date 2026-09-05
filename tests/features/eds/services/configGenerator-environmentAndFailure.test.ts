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

    describe('commerce-core-endpoint follows the environment type', () => {
        it('on PaaS it is the Catalog Service endpoint, kept separate from the mesh', () => {
            const config = generate({ ...baseParams, environmentType: 'paas' });

            expect(config.public.default['commerce-core-endpoint']).toBe(
                'https://catalog.example.com/graphql'
            );
            expect(config.public.default['commerce-endpoint']).toBe(
                'https://mesh.example.com/graphql'
            );
        });

        it('on ACCS it is the commerce endpoint, and the catalog value is ignored', () => {
            // ACCS serves catalog through the same endpoint. Threading the
            // PaaS-only catalog URL here points cs queries at a host ACCS
            // projects do not have.
            const config = generate({ ...baseParams, environmentType: 'accs' });

            expect(config.public.default['commerce-core-endpoint']).toBe(
                'https://mesh.example.com/graphql'
            );
        });

        it('on ACO it is the commerce endpoint too', () => {
            const config = generate({ ...baseParams, environmentType: 'aco' });

            expect(config.public.default['commerce-core-endpoint']).toBe(
                'https://mesh.example.com/graphql'
            );
        });

        it('an ABSENT environment type is treated as PaaS, not as neither', () => {
            // The default has to be a real environment: falling through to the
            // ACCS shape would drop the Catalog Service split on every project
            // whose backend was not recorded.
            const config = generate({ ...baseParams, environmentType: undefined });

            expect(config.public.default['commerce-core-endpoint']).toBe(
                'https://catalog.example.com/graphql'
            );
        });

        it('falls back to the commerce endpoint when PaaS has no catalog endpoint', () => {
            const config = generate({
                ...baseParams,
                environmentType: 'paas',
                catalogServiceEndpoint: undefined,
            });

            expect(config.public.default['commerce-core-endpoint']).toBe(
                'https://mesh.example.com/graphql'
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
