/**
 * The payload guards every component handler runs before it touches the registry.
 *
 * Each handler checks TWICE — that the payload is an object at all, and that the
 * fields it destructures are the types it will pass on. Both checks were reached
 * by a single `null` payload per handler, which satisfies the first check and
 * never reaches the second. A guard that only refuses `null` lets a webview send
 * `{ frontend: 42 }` straight into the registry.
 *
 * Each case below is a payload that exactly ONE clause refuses, so a guard whose
 * clauses are joined the wrong way fails here rather than passing on a case that
 * every clause would have caught.
 */

import {
    ComponentRegistryManager,
    DependencyResolver,
    setupComponentHandlerSuite,
} from './componentHandlers.testUtils';
import {
    handleCheckCompatibility,
    handleLoadComponents,
    handleLoadDependencies,
    handleLoadPreset,
    handleUpdateComponentSelection,
    handleUpdateComponentsData,
    handleValidateSelection,
} from '@/features/components/handlers/componentHandlers';
import { HandlerContext } from '@/types/handlers';

const INVALID = { success: false, error: 'Invalid payload' };

describe('componentHandlers — payload guards', () => {
    let context: HandlerContext;
    let registryManager: jest.Mocked<ComponentRegistryManager>;
    let dependencyResolver: jest.Mocked<DependencyResolver>;

    beforeEach(() => {
        ({ context, registryManager, dependencyResolver } = setupComponentHandlerSuite());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // `null` is falsy AND typeof 'object'; a string is truthy AND not an object.
    // Only one clause refuses each, so both are needed to pin the `||`.
    describe('non-object payloads', () => {
        it.each([
            ['null', null],
            ['undefined', undefined],
            ['a string', 'headless'],
            ['a number', 7],
        ])('handleUpdateComponentSelection refuses %s', async (_label, payload) => {
            expect(await handleUpdateComponentSelection(context, payload)).toEqual(INVALID);
            expect(context.sharedState.currentComponentSelection).toBeUndefined();
        });

        it.each([
            ['null', null],
            ['undefined', undefined],
            ['a string', 'data'],
        ])('handleUpdateComponentsData refuses %s', async (_label, payload) => {
            expect(await handleUpdateComponentsData(context, payload)).toEqual(INVALID);
            expect(context.sharedState.componentsData).toBeUndefined();
        });

        it.each([
            ['null', null],
            ['a string', 'headless'],
        ])('handleCheckCompatibility refuses %s', async (_label, payload) => {
            expect(await handleCheckCompatibility(context, payload)).toEqual(INVALID);
            expect(registryManager.checkCompatibility).not.toHaveBeenCalled();
        });

        it.each([
            ['null', null],
            ['a string', 'headless'],
        ])('handleLoadDependencies refuses %s', async (_label, payload) => {
            expect(await handleLoadDependencies(context, payload)).toEqual(INVALID);
            expect(dependencyResolver.resolveDependencies).not.toHaveBeenCalled();
        });

        it.each([
            ['null', null],
            ['a string', 'citisignal-headless'],
        ])('handleLoadPreset refuses %s', async (_label, payload) => {
            expect(await handleLoadPreset(context, payload)).toEqual(INVALID);
            expect(registryManager.getPresets).not.toHaveBeenCalled();
        });

        it.each([
            ['null', null],
            ['a string', 'headless'],
        ])('handleValidateSelection refuses %s', async (_label, payload) => {
            expect(await handleValidateSelection(context, payload)).toEqual(INVALID);
            expect(dependencyResolver.resolveDependencies).not.toHaveBeenCalled();
        });
    });

    // An object with the wrong field types clears the first check entirely. Each
    // payload here breaks exactly one field, so a guard that stopped checking the
    // others would let it through.
    describe('objects carrying the wrong field types', () => {
        it.each([
            ['a non-string frontend', { frontend: 42, backend: 'adobe-commerce-paas' }],
            ['a non-string backend', { frontend: 'headless', backend: null }],
            ['a missing backend', { frontend: 'headless' }],
        ])('handleCheckCompatibility refuses %s', async (_label, payload) => {
            expect(await handleCheckCompatibility(context, payload)).toEqual(INVALID);
            expect(registryManager.checkCompatibility).not.toHaveBeenCalled();
        });

        it.each([
            ['a non-string frontend', { frontend: 42, backend: 'adobe-commerce-paas' }],
            ['a non-string backend', { frontend: 'headless', backend: null }],
            ['a missing frontend', { backend: 'adobe-commerce-paas' }],
        ])('handleLoadDependencies refuses %s', async (_label, payload) => {
            expect(await handleLoadDependencies(context, payload)).toEqual(INVALID);
            expect(dependencyResolver.resolveDependencies).not.toHaveBeenCalled();
        });

        it.each([
            ['a non-string presetId', { presetId: 42 }],
            ['no presetId at all', {}],
        ])('handleLoadPreset refuses %s', async (_label, payload) => {
            expect(await handleLoadPreset(context, payload)).toEqual(INVALID);
            expect(registryManager.getPresets).not.toHaveBeenCalled();
        });

        it.each([
            [
                'a non-string frontend',
                { frontend: 42, backend: 'adobe-commerce-paas', dependencies: [] },
            ],
            ['a non-string backend', { frontend: 'headless', backend: null, dependencies: [] }],
            [
                'a non-array dependencies',
                { frontend: 'headless', backend: 'adobe-commerce-paas', dependencies: 'dep-a' },
            ],
        ])('handleValidateSelection refuses %s', async (_label, payload) => {
            expect(await handleValidateSelection(context, payload)).toEqual(INVALID);
            expect(dependencyResolver.resolveDependencies).not.toHaveBeenCalled();
        });
    });

    describe('handleLoadPreset — a preset that is not there', () => {
        it('reports the missing preset rather than failing on its selections', async () => {
            registryManager.getPresets.mockResolvedValue([
                {
                    id: 'citisignal-headless',
                    name: 'CitiSignal Headless',
                    description: 'CitiSignal with Next.js',
                    selections: { frontend: 'headless', backend: 'paas', dependencies: [] },
                },
            ]);

            const result = await handleLoadPreset(context, { presetId: 'nope' });

            // Naming the id is the whole value of the throw: without it the
            // handler still fails, but on `undefined.selections` two lines later,
            // which says nothing about what was asked for.
            expect(result.success).toBe(false);
            expect(String(result.error)).toMatch(/Preset nope not found/);
        });
    });

    describe('handleLoadComponents — the frontend list it hands the wizard', () => {
        it('marks headless as recommended and carries feature lists', async () => {
            registryManager.getFrontends.mockResolvedValue([
                {
                    id: 'headless',
                    name: 'CitiSignal Next.js',
                    description: 'Storefront',
                    features: ['SSR'],
                    dependencies: { required: [], optional: [] },
                    configuration: {},
                },
                {
                    id: 'eds',
                    name: 'Edge Delivery',
                    description: 'Storefront',
                    features: ['Docs'],
                    dependencies: { required: [], optional: [] },
                    configuration: {},
                },
            ]);
            registryManager.getBackends.mockResolvedValue([]);
            registryManager.getIntegrations.mockResolvedValue([]);
            registryManager.getDependencies.mockResolvedValue([]);
            registryManager.getPresets.mockResolvedValue([]);

            const result = await handleLoadComponents(context);

            // The recommendation and the feature bullets are what the wizard's
            // frontend cards render; drop the options and both disappear with
            // every other assertion still passing.
            const [headless, eds] = (result.data as { frontends: Array<Record<string, unknown>> })
                .frontends;
            expect(headless).toMatchObject({ id: 'headless', recommended: true, features: ['SSR'] });
            expect(eds.recommended).toBeUndefined();
            expect(eds.features).toEqual(['Docs']);
        });
    });
});
