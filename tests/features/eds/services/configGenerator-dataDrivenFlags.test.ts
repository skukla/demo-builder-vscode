/**
 * configGenerator — the config-flag injection MECHANISM, measured against
 * catalogs this repo does not currently ship.
 *
 * Why a separate file with module mocks: the addon half of the mechanism is
 * data-driven and no addon in `components.json` declares `configFlags` today,
 * so against the bundled catalog every addon branch is unobservable — deleting
 * the guard, emptying the loop, or skipping the call all produce the same
 * config.json. The package half is exercised for real in
 * configGenerator-configFlags.test.ts; this file covers what the shipped data
 * cannot reach.
 *
 * Each catalog is derived from `jest.requireActual` and edited, never composed
 * from memory — the shapes these readers cast to are the real files' shapes.
 */

import type { ConfigGeneratorParams } from '@/features/eds/services/configGenerator';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';

type Generator = typeof import('@/features/eds/services/configGenerator');

/** The three bundled JSON modules this generator reads. */
const COMPONENTS = '@/features/components/config/components.json';
const PACKAGES = '@/features/components/config/demo-packages.json';
const TEMPLATE = '@/features/eds/config/config-template.json';

/**
 * Load a fresh generator over the given catalog substitutions.
 *
 * `resetModules` alone is not enough: `doMock` registrations outlive it, so
 * every unrequested module is explicitly un-mocked first or the previous test's
 * catalog leaks into this one.
 */
async function loadGeneratorWith(mocks: {
    components?: () => unknown;
    packages?: () => unknown;
    template?: () => unknown;
}): Promise<Generator> {
    jest.resetModules();
    jest.dontMock(COMPONENTS);
    jest.dontMock(PACKAGES);
    jest.dontMock(TEMPLATE);
    if (mocks.components) jest.doMock(COMPONENTS, mocks.components);
    if (mocks.packages) jest.doMock(PACKAGES, mocks.packages);
    if (mocks.template) jest.doMock(TEMPLATE, mocks.template);
    return import('@/features/eds/services/configGenerator');
}

const BASE: ConfigGeneratorParams = {
    githubOwner: 'acme',
    repoName: 'acme-store',
    daLiveOrg: 'acme-da',
    daLiveSite: 'acme-da-site',
    commerceEndpoint: 'https://commerce.example.com/graphql',
    environmentType: 'paas',
};

describe('configGenerator — data-driven config flags', () => {
    let mockLogger: Logger;

    beforeEach(() => {
        mockLogger = createMockLogger() as unknown as Logger;
    });

    afterAll(() => {
        jest.resetModules();
        jest.dontMock(COMPONENTS);
        jest.dontMock(PACKAGES);
        jest.dontMock(TEMPLATE);
    });

    describe('an addon that declares configFlags', () => {
        /** The real catalog with one flag added to the addon that already exists. */
        const catalogWithAddonFlags = () => {
            const real = jest.requireActual(COMPONENTS) as {
                addons: Record<string, { configuration?: Record<string, unknown> }>;
            };
            return {
                ...real,
                addons: {
                    ...real.addons,
                    'adobe-commerce-aco': {
                        ...real.addons['adobe-commerce-aco'],
                        configuration: {
                            ...real.addons['adobe-commerce-aco']?.configuration,
                            configFlags: { 'commerce-aco-enabled': true },
                        },
                    },
                },
            };
        };

        it('lands its flags in config.public.default when the addon is selected', async () => {
            const { generateConfigJson } = await loadGeneratorWith({
                components: catalogWithAddonFlags,
            });

            const result = generateConfigJson(
                { ...BASE, selectedAddons: ['adobe-commerce-aco'] },
                mockLogger
            );

            expect(result.success).toBe(true);
            expect(JSON.parse(result.content!).public.default['commerce-aco-enabled']).toBe(true);
        });

        it('lands nothing when a DIFFERENT addon is selected', async () => {
            const { generateConfigJson } = await loadGeneratorWith({
                components: catalogWithAddonFlags,
            });

            const result = generateConfigJson(
                { ...BASE, selectedAddons: ['some-other-addon'] },
                mockLogger
            );

            expect(
                JSON.parse(result.content!).public.default['commerce-aco-enabled']
            ).toBeUndefined();
        });
    });

    describe('a catalog with the whole collection missing', () => {
        it('generates successfully when components.json declares no addons', async () => {
            // The guard is what makes this a no-op instead of a TypeError that
            // the outer try turns into "config generation failed".
            const { generateConfigJson } = await loadGeneratorWith({
                components: () => ({}),
            });

            const result = generateConfigJson(
                { ...BASE, selectedAddons: ['adobe-commerce-aco'] },
                mockLogger
            );

            expect(result.success).toBe(true);
        });

        it('generates successfully when demo-packages.json declares no packages', async () => {
            const { generateConfigJson } = await loadGeneratorWith({
                packages: () => ({}),
            });

            const result = generateConfigJson({ ...BASE, selectedPackage: 'custom' }, mockLogger);

            expect(result.success).toBe(true);
            expect(
                JSON.parse(result.content!).public.default['commerce-b2b-enabled']
            ).toBeUndefined();
        });
    });

    describe('a template with no public.default section', () => {
        /**
         * Both flag injectors and the headers block guard on
         * `public?.default`. With a template that has no `public`, an
         * unguarded read is a TypeError the outer catch converts into a failed
         * generation — so "success" here IS the guard working.
         */
        const emptyTemplate = () => ({ robots: { txt: 'User-agent: *' } });

        it('still generates rather than failing, and injects nothing', async () => {
            const { generateConfigJson } = await loadGeneratorWith({ template: emptyTemplate });

            const result = generateConfigJson({ ...BASE, selectedPackage: 'custom' }, mockLogger);

            expect(result.success).toBe(true);
            expect(JSON.parse(result.content!)).toEqual({ robots: { txt: 'User-agent: *' } });
        });

        it('still generates when an addon carrying flags is selected', async () => {
            const { generateConfigJson } = await loadGeneratorWith({
                components: () => {
                    const real = jest.requireActual(COMPONENTS) as {
                        addons: Record<string, { configuration?: Record<string, unknown> }>;
                    };
                    return {
                        ...real,
                        addons: {
                            ...real.addons,
                            'adobe-commerce-aco': {
                                ...real.addons['adobe-commerce-aco'],
                                configuration: { configFlags: { 'commerce-aco-enabled': true } },
                            },
                        },
                    };
                },
                template: emptyTemplate,
            });

            const result = generateConfigJson(
                { ...BASE, selectedAddons: ['adobe-commerce-aco'] },
                mockLogger
            );

            expect(result.success).toBe(true);
        });
    });
});
