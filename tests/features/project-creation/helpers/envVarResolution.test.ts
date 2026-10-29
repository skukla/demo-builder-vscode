/**
 * Unit tests for envVarResolution.ts — which env var keys a component gets, and
 * what value each key resolves to — asserted on the returned values directly,
 * without a file writer in between.
 *
 * Seen through a writer, a duplicate key is invisible (both writers collapse a
 * repeat), so the "a service var the component already declares is not added
 * twice" rule could only be pinned here, on the key list itself.
 */

import {
    resolveComponentEnvVars,
    resolveEnvVarValue,
    resolveFromComponentConfigs,
    type EnvGenerationContext,
} from '@/features/project-creation/helpers/envVarResolution';
import { PAAS_WEBSITE_CODE } from '@/core/config/envVarKeys';
import type {
    ComponentRegistry,
    EnvVarDefinition,
    ServiceDefinition,
    TransformedComponentDefinition,
} from '@/types/components';

type ComponentConfigs = Record<string, Record<string, string | number | boolean | undefined>>;

function registryWith(services?: Record<string, ServiceDefinition>): ComponentRegistry {
    return {
        version: '1.0.0',
        components: { frontends: [], backends: [], dependencies: [] },
        ...(services ? { services } : {}),
    };
}

function component(
    configuration?: TransformedComponentDefinition['configuration'],
): TransformedComponentDefinition {
    return {
        id: 'test-component',
        name: 'Test Component',
        ...(configuration ? { configuration } : {}),
    };
}

function contextWith(
    configs: ComponentConfigs | undefined,
    options: { backendId?: string; meshEndpoint?: string } = {},
): EnvGenerationContext {
    return {
        registry: registryWith(),
        logger: { debug: jest.fn() },
        getBackendId: () => options.backendId,
        getComponentConfigs: () => configs,
        getEnvVarDefinitions: () => ({}),
        getMeshEndpoint: () => options.meshEndpoint,
    };
}

function envVar(key: string, extra: Partial<EnvVarDefinition> = {}): EnvVarDefinition {
    return { key, label: key, type: 'text', ...extra };
}

describe('resolveComponentEnvVars', () => {
    it('returns an empty list for a component with no configuration', () => {
        expect(resolveComponentEnvVars(component(), registryWith(), 'paas')).toStrictEqual([]);
    });

    it('returns an empty list when the configuration declares no env var lists', () => {
        expect(resolveComponentEnvVars(component({}), registryWith(), 'paas')).toStrictEqual([]);
    });

    it('lists required keys before optional keys', () => {
        const def = component({ requiredEnvVars: ['A', 'B'], optionalEnvVars: ['C'] });

        expect(resolveComponentEnvVars(def, registryWith())).toStrictEqual(['A', 'B', 'C']);
    });

    it('appends a flat service var the component does not declare', () => {
        const def = component({ requiredEnvVars: ['A'], requiredServices: ['svc'] });
        const registry = registryWith({ svc: { name: 'Svc', requiredEnvVars: ['S1', 'S2'] } });

        expect(resolveComponentEnvVars(def, registry, 'paas')).toStrictEqual(['A', 'S1', 'S2']);
    });

    it('does not add a flat service var the component already declares, required or optional', () => {
        const def = component({
            requiredEnvVars: ['A'],
            optionalEnvVars: ['B'],
            requiredServices: ['svc'],
        });
        const registry = registryWith({
            svc: { name: 'Svc', requiredEnvVars: ['A', 'B', 'S1'] },
        });

        expect(resolveComponentEnvVars(def, registry, 'paas')).toStrictEqual(['A', 'B', 'S1']);
    });

    it('appends only the current backend\'s vars from a backend-specific service', () => {
        const def = component({ requiredEnvVars: ['A'], requiredServices: ['svc'] });
        const registry = registryWith({
            svc: {
                name: 'Svc',
                backendSpecific: true,
                requiredEnvVarsByBackend: { paas: ['P1'], accs: ['C1'] },
            },
        });

        expect(resolveComponentEnvVars(def, registry, 'accs')).toStrictEqual(['A', 'C1']);
    });

    it('does not add a backend-specific service var the component already declares', () => {
        const def = component({ optionalEnvVars: ['P1'], requiredServices: ['svc'] });
        const registry = registryWith({
            svc: {
                name: 'Svc',
                backendSpecific: true,
                requiredEnvVarsByBackend: { paas: ['P1', 'P2'] },
            },
        });

        expect(resolveComponentEnvVars(def, registry, 'paas')).toStrictEqual(['P1', 'P2']);
    });

    it('adds nothing from a backend-specific service that has no list for this backend', () => {
        const def = component({ requiredEnvVars: ['A'], requiredServices: ['svc'] });
        const registry = registryWith({
            svc: { name: 'Svc', backendSpecific: true, requiredEnvVarsByBackend: { paas: ['P1'] } },
        });

        expect(resolveComponentEnvVars(def, registry, 'accs')).toStrictEqual(['A']);
    });

    it('adds no service vars at all without a backend', () => {
        const def = component({ requiredEnvVars: ['A'], requiredServices: ['svc'] });
        const registry = registryWith({ svc: { name: 'Svc', requiredEnvVars: ['S1'] } });

        expect(resolveComponentEnvVars(def, registry)).toStrictEqual(['A']);
    });

    it('skips a required service the registry does not define', () => {
        const def = component({ requiredEnvVars: ['A'], requiredServices: ['missing'] });

        expect(resolveComponentEnvVars(def, registryWith({}), 'paas')).toStrictEqual(['A']);
    });

    it('does not mutate the component\'s own declared lists', () => {
        const required = ['A'];
        const def = component({ requiredEnvVars: required, requiredServices: ['svc'] });
        const registry = registryWith({ svc: { name: 'Svc', requiredEnvVars: ['S1'] } });

        resolveComponentEnvVars(def, registry, 'paas');

        expect(required).toStrictEqual(['A']);
    });
});

describe('resolveFromComponentConfigs', () => {
    it('returns undefined when the project has no component configs', () => {
        expect(resolveFromComponentConfigs('ANY', contextWith(undefined))).toBeUndefined();
    });

    it('returns undefined when no component defines the key', () => {
        const context = contextWith({ a: { OTHER: 'x' } });

        expect(resolveFromComponentConfigs('ANY', context)).toBeUndefined();
    });

    it('takes the first component that defines an ordinary key', () => {
        const context = contextWith({ first: { KEY: 'one' }, second: { KEY: 'two' } }, {
            backendId: 'second',
        });

        expect(resolveFromComponentConfigs('KEY', context)).toBe('one');
    });

    it('takes a backend-owned scope key from the backend even when another component comes first', () => {
        const context = contextWith(
            { mesh: { [PAAS_WEBSITE_CODE]: 'stale' }, backend: { [PAAS_WEBSITE_CODE]: 'current' } },
            { backendId: 'backend' },
        );

        expect(resolveFromComponentConfigs(PAAS_WEBSITE_CODE, context)).toBe('current');
    });

    it('falls back to the first component for a scope key when no backend is selected', () => {
        const context = contextWith({
            mesh: { [PAAS_WEBSITE_CODE]: 'first' },
            backend: { [PAAS_WEBSITE_CODE]: 'second' },
        });

        expect(resolveFromComponentConfigs(PAAS_WEBSITE_CODE, context)).toBe('first');
    });

    it('falls back to the first component for a scope key the backend does not define', () => {
        const context = contextWith(
            { mesh: { [PAAS_WEBSITE_CODE]: 'mesh-copy' }, backend: {} },
            { backendId: 'backend' },
        );

        expect(resolveFromComponentConfigs(PAAS_WEBSITE_CODE, context)).toBe('mesh-copy');
    });

    it('stringifies a non-string value, including false and 0', () => {
        const context = contextWith({ a: { FLAG: false, COUNT: 0 } });

        expect(resolveFromComponentConfigs('FLAG', context)).toBe('false');
        expect(resolveFromComponentConfigs('COUNT', context)).toBe('0');
    });

    it('stringifies a non-string backend scope value', () => {
        const context = contextWith({ backend: { [PAAS_WEBSITE_CODE]: 7 } }, {
            backendId: 'backend',
        });

        expect(resolveFromComponentConfigs(PAAS_WEBSITE_CODE, context)).toBe('7');
    });

    it('returns an empty string a component set, rather than looking further', () => {
        const context = contextWith({ first: { KEY: '' }, second: { KEY: 'two' } });

        expect(resolveFromComponentConfigs('KEY', context)).toBe('');
    });
});

describe('resolveEnvVarValue', () => {
    it('prefers a derived value over configs, mesh endpoint and default', () => {
        const derived = new Map([['MESH_ENDPOINT', 'derived']]);
        const context = contextWith({ a: { MESH_ENDPOINT: 'config' } }, { meshEndpoint: 'mesh' });

        const value = resolveEnvVarValue(envVar('MESH_ENDPOINT', { default: 'd' }), derived, context);

        expect(value).toBe('derived');
    });

    it('returns a derived empty string as-is', () => {
        const derived = new Map([['KEY', '']]);
        const context = contextWith({ a: { KEY: 'config' } });

        expect(resolveEnvVarValue(envVar('KEY', { default: 'd' }), derived, context)).toBe('');
    });

    it('reads MESH_ENDPOINT from the context, not from component configs', () => {
        const context = contextWith({ a: { MESH_ENDPOINT: 'config' } }, { meshEndpoint: 'mesh' });

        expect(resolveEnvVarValue(envVar('MESH_ENDPOINT'), new Map(), context)).toBe('mesh');
    });

    it('writes MESH_ENDPOINT empty when there is no endpoint, ignoring configs and default', () => {
        const context = contextWith({ a: { MESH_ENDPOINT: 'config' } });

        const value = resolveEnvVarValue(envVar('MESH_ENDPOINT', { default: 'd' }), new Map(), context);

        expect(value).toBe('');
    });

    it('takes a component config value over the declared default', () => {
        const context = contextWith({ a: { KEY: 'config' } });

        expect(resolveEnvVarValue(envVar('KEY', { default: 'd' }), new Map(), context)).toBe('config');
    });

    it('falls back to the declared default, stringified', () => {
        const context = contextWith({ a: {} });

        expect(resolveEnvVarValue(envVar('KEY', { default: 42 }), new Map(), context)).toBe('42');
    });

    it('uses a false default rather than the empty fallback', () => {
        expect(resolveEnvVarValue(envVar('KEY', { default: false }), new Map(), contextWith(undefined)))
            .toBe('false');
    });

    it('returns an empty string when nothing defines the key', () => {
        expect(resolveEnvVarValue(envVar('KEY'), new Map(), contextWith(undefined))).toBe('');
    });
});
