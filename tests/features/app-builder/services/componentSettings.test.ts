/**
 * componentSettings — what an integration's Settings modal shows, what a save may
 * change, and which apps a change redeploys (AB-21).
 */

import {
    buildComponentSettings,
    editableSettingsOf,
    hasSettings,
    MAX_SETTING_LENGTH,
    redeployOrder,
    validateSettingsChange,
} from '@/features/app-builder/services/componentSettings';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import { createMockProject } from '../../../helpers/projectFake';

const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    providesEnvVars: ['ERP_BASE_URL'],
    envSchema: [{ name: 'ERP_DISPLAY_NAME', type: 'text', label: 'ERP name', default: 'Acme ERP' }],
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};

const INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP integration',
    description: 'the integration',
    kind: 'integration',
    envSchema: [
        { name: 'ERP_BASE_URL', type: 'text', label: 'ERP address', providedBy: 'demo-erp' },
        { name: 'ERP_DISPLAY_NAME', type: 'text', label: 'ERP name', default: 'Acme ERP' },
        { name: 'ERP_REGION', type: 'text', label: 'Region' },
        { name: 'ERP_API_KEY', type: 'secret', label: 'API key' },
        { name: 'MESH_ENDPOINT', type: 'text', label: 'Mesh', derivedFrom: 'mesh' },
    ],
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};

const SHELL: AppBuilderComponentCatalogEntry = {
    id: 'app-builder-shell',
    name: 'Blank app',
    description: 'nothing to set',
    kind: 'integration',
    source: { owner: 'skukla', repo: 'shell', branch: 'main' },
};

const CATALOG = [SYSTEM, INTEGRATION, SHELL];

describe('editableSettingsOf / hasSettings', () => {
    it('lists text then secret settings, never provided or derived ones', () => {
        expect(editableSettingsOf(INTEGRATION, CATALOG).map((v) => v.name))
            .toEqual(['ERP_DISPLAY_NAME', 'ERP_REGION', 'ERP_API_KEY']);
        expect(hasSettings(INTEGRATION, CATALOG)).toBe(true);
    });

    it('a bound system leaves out what its integration sets, so the ERP has no Settings of its own', () => {
        expect(editableSettingsOf(SYSTEM, CATALOG)).toStrictEqual([]);
        expect(hasSettings(SYSTEM, CATALOG)).toBe(false);
    });

    it('an entry with no settings has none', () => {
        expect(hasSettings(SHELL, CATALOG)).toBe(false);
    });
});

describe('buildComponentSettings', () => {
    it('shows typed values, else the default, secrets as set or not, and who provides the rest', () => {
        const project = createMockProject({
            componentConfigs: { 'erp-integration': { ERP_DISPLAY_NAME: 'Nordwind', ERP_REGION: '  ' } },
            appBuilderComponents: {
                'demo-erp': {
                    kind: 'system',
                    status: 'deployed',
                    name: 'Nordwind',
                    source: { owner: 'skukla', repo: 'demo-erp' },
                    providesEnvVars: { ERP_BASE_URL: 'https://ns.example/api/v1/web/demo-erp' },
                },
            },
        });

        expect(buildComponentSettings(INTEGRATION, CATALOG, project, { ERP_API_KEY: true })).toEqual({
            fields: [
                { name: 'ERP_DISPLAY_NAME', label: 'ERP name', type: 'text', required: false, value: 'Nordwind' },
                { name: 'ERP_REGION', label: 'Region', type: 'text', required: true, value: '' },
                { name: 'ERP_API_KEY', label: 'API key', type: 'secret', required: true, isSet: true },
            ],
            connected: [{
                name: 'ERP_BASE_URL',
                label: 'ERP address',
                from: 'Nordwind',
                value: 'https://ns.example/api/v1/web/demo-erp',
            }],
        });
    });

    it('names the provider from the catalog before it is deployed, and never carries a secret value', () => {
        const settings = buildComponentSettings(INTEGRATION, CATALOG, createMockProject(), {});

        expect(settings.connected).toEqual([
            { name: 'ERP_BASE_URL', label: 'ERP address', from: 'ERP', value: undefined },
        ]);
        expect(settings.fields.find((f) => f.type === 'secret')).toEqual(
            { name: 'ERP_API_KEY', label: 'API key', type: 'secret', required: true, isSet: false },
        );
    });
});

describe('validateSettingsChange', () => {
    const valid = { values: { ERP_DISPLAY_NAME: 'Nordwind' }, secrets: {} };

    it('accepts a change to settings the entry lets a person set', () => {
        expect(validateSettingsChange(INTEGRATION, CATALOG, valid)).toBeUndefined();
        expect(validateSettingsChange(INTEGRATION, CATALOG, {
            values: { ERP_DISPLAY_NAME: '' },
            secrets: { ERP_API_KEY: 'fake-test-pw-not-a-secret' },
        })).toBeUndefined();
    });

    it.each([
        ['an unknown name', { values: { NOPE: 'x' }, secrets: {} }, '"NOPE" is not a text setting'],
        ['a provided setting', { values: { ERP_BASE_URL: 'x' }, secrets: {} }, '"ERP_BASE_URL" is not a text'],
        ['a secret sent as text', { values: { ERP_API_KEY: 'x' }, secrets: {} }, 'is not a text setting'],
        ['text sent as a secret', { values: {}, secrets: { ERP_REGION: 'x' } }, 'is not a secret setting'],
        ['a blank required text', { values: { ERP_REGION: ' ' }, secrets: {} }, '"Region" cannot be empty.'],
        ['a blank secret', { values: {}, secrets: { ERP_API_KEY: '' } }, '"API key" cannot be empty.'],
        ['nothing at all', { values: {}, secrets: {} }, 'Nothing to save.'],
    ])('refuses %s', (_label, change, message) => {
        expect(validateSettingsChange(INTEGRATION, CATALOG, change)).toContain(message);
    });

    it('refuses a value that is not a string, or too long', () => {
        const notText = { values: { ERP_REGION: 42 as unknown as string }, secrets: {} };
        expect(validateSettingsChange(INTEGRATION, CATALOG, notText)).toBe('"Region" must be text.');
        const long = { values: { ERP_REGION: 'x'.repeat(MAX_SETTING_LENGTH + 1) }, secrets: {} };
        expect(validateSettingsChange(INTEGRATION, CATALOG, long)).toContain('longer than');
    });

    it("refuses the ERP's name on the ERP itself: it is set on the integration", () => {
        expect(validateSettingsChange(SYSTEM, CATALOG, valid)).toContain('is not a text setting');
    });
});

describe('redeployOrder', () => {
    const withErp = createMockProject({
        appBuilderComponents: {
            'demo-erp': { kind: 'system', status: 'deployed', source: { owner: 'skukla', repo: 'demo-erp' } },
            'erp-integration': { kind: 'integration', status: 'deployed', source: { owner: 'skukla', repo: 'x' } },
        },
    });

    it('a setting the bound system also uses redeploys the system first, then the integration', () => {
        expect(redeployOrder(INTEGRATION, ['ERP_DISPLAY_NAME'], CATALOG, withErp))
            .toEqual(['demo-erp', 'erp-integration']);
    });

    it("a setting only the integration uses redeploys the integration alone", () => {
        expect(redeployOrder(INTEGRATION, ['ERP_REGION'], CATALOG, withErp)).toEqual(['erp-integration']);
    });

    it('a bound system the project does not have is not redeployed', () => {
        expect(redeployOrder(INTEGRATION, ['ERP_DISPLAY_NAME'], CATALOG, createMockProject()))
            .toEqual(['erp-integration']);
    });
});

// AB-23: with two ERP pairs, each integration's Settings and redeploys concern ITS
// ERP — the second pair is numbered with it (`erp-integration-2` ↔ `demo-erp-2`).
describe('a second pair', () => {
    const SECOND: AppBuilderComponentCatalogEntry = { ...INTEGRATION, id: 'erp-integration-2', catalogId: 'erp-integration' };
    const record = (kind: 'system' | 'integration', extra = {}) => ({
        kind,
        status: 'deployed' as const,
        source: { owner: 'skukla', repo: 'r' },
        ...extra,
    });
    const twoPairs = () =>
        createMockProject({
            appBuilderComponents: {
                'demo-erp': record('system', { name: 'Northwind ERP', providesEnvVars: { ERP_BASE_URL: 'https://one' } }),
                'erp-integration': record('integration'),
                'demo-erp-2': record('system', {
                    catalogId: 'demo-erp',
                    name: 'Contoso ERP',
                    providesEnvVars: { ERP_BASE_URL: 'https://two' },
                }),
                'erp-integration-2': record('integration', { catalogId: 'erp-integration' }),
            },
        });

    it('shows the second integration connected to the second ERP, with its address', () => {
        const { connected } = buildComponentSettings(SECOND, CATALOG, twoPairs(), {});

        expect(connected).toEqual([
            expect.objectContaining({ name: 'ERP_BASE_URL', from: 'Contoso ERP', value: 'https://two' }),
        ]);
    });

    it('redeploys the second ERP before the second integration, never the first ERP', () => {
        expect(redeployOrder(SECOND, ['ERP_DISPLAY_NAME'], CATALOG, twoPairs())).toEqual([
            'demo-erp-2',
            'erp-integration-2',
        ]);
    });
});
