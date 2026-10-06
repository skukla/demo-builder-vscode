/**
 * The one default-fill rule the wizard and project creation share.
 */

import {
    applyFieldDefaults,
    collectConfigFields,
    isAbsentValue,
    type ConfigFieldSource,
    type DefaultableField,
} from '@/features/components/services/componentConfigDefaults';
import type { ServiceDefinition } from '@/types/components';
import type { ComponentConfigs } from '@/types/webview';

const ASSETS: DefaultableField = {
    key: 'AEM_ASSETS_ENABLED',
    componentIds: ['eds-storefront'],
    default: 'true',
};
const STORE: DefaultableField = {
    key: 'ACCS_STORE_CODE',
    componentIds: ['adobe-commerce-accs', 'eds-accs-mesh'],
    default: 'citisignal_store',
};

describe('applyFieldDefaults', () => {
    it('returns the SAME object when every default is already stored', () => {
        // React bails out of a re-render only on an identical reference.
        const configs: ComponentConfigs = { 'eds-storefront': { AEM_ASSETS_ENABLED: 'false' } };

        expect(applyFieldDefaults(configs, [ASSETS], undefined, undefined)).toBe(configs);
    });

    it('fills a blank field and leaves the input untouched', () => {
        const configs: ComponentConfigs = { 'eds-storefront': { AEM_ASSETS_ENABLED: '' } };

        const next = applyFieldDefaults(configs, [ASSETS], undefined, undefined);

        expect(next['eds-storefront'].AEM_ASSETS_ENABLED).toBe('true');
        expect(configs['eds-storefront'].AEM_ASSETS_ENABLED).toBe('');
    });

    it('never overrides a stored false', () => {
        const configs: ComponentConfigs = { 'eds-storefront': { AEM_ASSETS_ENABLED: false } };

        expect(applyFieldDefaults(configs, [ASSETS], undefined, undefined)).toBe(configs);
    });

    it('prefers the package default over the catalog default', () => {
        const next = applyFieldDefaults({}, [STORE], { ACCS_STORE_CODE: 'bodea_store' }, 'adobe-commerce-accs');

        expect(next['adobe-commerce-accs'].ACCS_STORE_CODE).toBe('bodea_store');
    });

    it('writes store scope to the backend only', () => {
        const next = applyFieldDefaults({}, [STORE], undefined, 'adobe-commerce-accs');

        expect(Object.keys(next)).toEqual(['adobe-commerce-accs']);
    });

    it('keeps a cleared value cleared when blank means absent', () => {
        const configs: ComponentConfigs = { 'eds-storefront': { AEM_ASSETS_ENABLED: '' } };

        expect(applyFieldDefaults(configs, [ASSETS], undefined, undefined, isAbsentValue)).toBe(configs);
    });

    it('skips a field with no default at all', () => {
        const field: DefaultableField = { key: 'X', componentIds: ['c'] };

        expect(applyFieldDefaults({}, [field], undefined, undefined)).toStrictEqual({});
    });
});

describe('collectConfigFields', () => {
    const defs = { A: { label: 'A' }, B: { label: 'B' }, S1: { label: 'S1' }, MESH_ENDPOINT: { label: 'm' } };

    it('collects own vars once each, records every declaring component, and skips MESH_ENDPOINT', () => {
        const components: ConfigFieldSource[] = [
            { id: 'one', data: { configuration: { requiredEnvVars: ['A', 'MESH_ENDPOINT'], optionalEnvVars: ['B'] } } },
            { id: 'two', data: { configuration: { requiredEnvVars: ['A', 'UNKNOWN'] } } },
        ];

        const fields = collectConfigFields(components, defs, undefined, undefined);

        expect(fields.map((f) => [f.key, f.componentIds])).toEqual([
            ['A', ['one', 'two']],
            ['B', ['one']],
        ]);
    });

    it("uses a backend-specific service's list for the given backend", () => {
        const services: Record<string, ServiceDefinition> = {
            svc: {
                name: 'svc',
                backendSpecific: true,
                requiredEnvVars: ['B'],
                requiredEnvVarsByBackend: { paas: ['S1'] },
            },
        };
        const components: ConfigFieldSource[] = [
            { id: 'one', data: { configuration: { requiredServices: ['svc'] } } },
        ];

        expect(collectConfigFields(components, defs, services, 'paas').map((f) => f.key)).toEqual(['S1']);
        expect(collectConfigFields(components, defs, services, undefined)).toStrictEqual([]);
    });
});
