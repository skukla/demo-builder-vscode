/**
 * instanceId tests (shell instancing — Step 3)
 *
 * Pure derivation module for named AI-built integrations: name → collision-checked
 * instance id. Covers slug derivation boundary cases, the reserved-id collision
 * domain (every class — a name slugging to a catalog id would make the executor's
 * catalog-first lookup clone the WRONG repo), and the evaluate shape mirrored from
 * CustomStage. No React, no wizard-state reads.
 */

import { COMPONENT_IDS, MESH_COMPONENT_IDS } from '@/core/constants';
import {
    mintInstance,
    deriveInstanceId,
    buildReservedIds,
    evaluateInstanceName,
    type ReservedIdInputs,
} from '@/features/project-creation/ui/components/integration-flow/instanceId';

function inputs(overrides: Partial<ReservedIdInputs> = {}): ReservedIdInputs {
    return {
        selectedIntegrationIds: [],
        sourceIds: [],
        catalogIds: [],
        selectedAddons: [],
        ...overrides,
    };
}

describe('deriveInstanceId', () => {
    it('converts spaces to hyphens and lowercases', () => {
        expect(deriveInstanceId('Firefly Image Gen')).toBe('firefly-image-gen');
    });

    it('converts underscores to hyphens', () => {
        expect(deriveInstanceId('Order_Sync')).toBe('order-sync');
    });

    it('strips symbols', () => {
        expect(deriveInstanceId('Salesforce CRM!')).toBe('salesforce-crm');
    });

    it('lowercases all-caps input', () => {
        expect(deriveInstanceId('ORDER SYNC')).toBe('order-sync');
    });

    it('strips leading digits (id must start with a letter)', () => {
        expect(deriveInstanceId('2024 Reports')).toBe('reports');
    });

    it('drops non-ASCII letters (unicode name → empty slug)', () => {
        expect(deriveInstanceId('日本語')).toBe('');
    });

    it('symbols-only input → empty slug', () => {
        expect(deriveInstanceId('!!!')).toBe('');
    });

    it('collapses consecutive separators to a single hyphen', () => {
        expect(deriveInstanceId('Order  -  Sync')).toBe('order-sync');
    });

    it('ignores surrounding whitespace', () => {
        expect(deriveInstanceId('  Order Sync  ')).toBe('order-sync');
    });
});

describe('buildReservedIds', () => {
    it('includes selected integration ids', () => {
        const reserved = buildReservedIds(inputs({ selectedIntegrationIds: ['order-sync'] }));
        expect(reserved.has('order-sync')).toBe(true);
    });

    it('includes custom-source map keys', () => {
        const reserved = buildReservedIds(inputs({ sourceIds: ['firefly-image-gen'] }));
        expect(reserved.has('firefly-image-gen')).toBe(true);
    });

    it('includes all app-builder catalog ids (wrong-repo clone guard)', () => {
        const reserved = buildReservedIds(
            inputs({ catalogIds: ['app-builder-shell', 'commerce-events'] })
        );
        expect(reserved.has('app-builder-shell')).toBe(true);
        expect(reserved.has('commerce-events')).toBe(true);
    });

    it('always includes COMPONENT_IDS and MESH_COMPONENT_IDS values', () => {
        const reserved = buildReservedIds(inputs());
        for (const id of Object.values(COMPONENT_IDS)) {
            expect(reserved.has(id)).toBe(true);
        }
        for (const id of MESH_COMPONENT_IDS) {
            expect(reserved.has(id)).toBe(true);
        }
    });

    it('includes selected addons (mesh ids are baked in via MESH_COMPONENT_IDS)', () => {
        const reserved = buildReservedIds(inputs({ selectedAddons: ['demo-inspector'] }));
        expect(reserved.has('demo-inspector')).toBe(true);
        expect(reserved.has('eds-commerce-mesh')).toBe(true);
    });

    it("always includes the reserved '__existing__' edit-mode key", () => {
        expect(buildReservedIds(inputs()).has('__existing__')).toBe(true);
    });

    it('empty inputs still yield the baked-in domain (components + sentinel)', () => {
        const reserved = buildReservedIds(inputs());
        expect(reserved.has('eds-storefront')).toBe(true);
        expect(reserved.size).toBeGreaterThanOrEqual(
            Object.values(COMPONENT_IDS).length + 1
        );
    });
});

describe('evaluateInstanceName', () => {
    const none = new Set<string>();

    it('empty input → no instance, no message (just incomplete)', () => {
        expect(evaluateInstanceName('', none)).toEqual({});
    });

    it('whitespace-only input → no instance, no message', () => {
        expect(evaluateInstanceName('   ', none)).toEqual({});
    });

    it('name slugging to empty → message about needing letters, no instance', () => {
        const result = evaluateInstanceName('!!!', none);
        expect(result.instance).toBeUndefined();
        expect(result.message).toMatch(/letter/i);
    });

    it("collision with a catalog id ('app-builder-shell') → duplicate message", () => {
        const reserved = buildReservedIds(inputs({ catalogIds: ['app-builder-shell'] }));
        const result = evaluateInstanceName('App Builder Shell', reserved);
        expect(result.instance).toBeUndefined();
        expect(result.message).toMatch(/already used/i);
    });

    it('collision with a mesh component id → duplicate message', () => {
        const result = evaluateInstanceName('EDS Commerce Mesh', buildReservedIds(inputs()));
        expect(result.instance).toBeUndefined();
        expect(result.message).toMatch(/already used/i);
    });

    it("collision with 'eds-storefront' → duplicate message", () => {
        const result = evaluateInstanceName('EDS Storefront', buildReservedIds(inputs()));
        expect(result.instance).toBeUndefined();
        expect(result.message).toMatch(/already used/i);
    });

    it('collision with an existing instance id → duplicate message', () => {
        const reserved = buildReservedIds(
            inputs({ selectedIntegrationIds: ['order-sync'], sourceIds: ['order-sync'] })
        );
        const result = evaluateInstanceName('Order Sync', reserved);
        expect(result.instance).toBeUndefined();
        expect(result.message).toMatch(/already used/i);
    });

    it('valid name → trimmed display name + derived id, no message', () => {
        const result = evaluateInstanceName('  Firefly Image Gen  ', buildReservedIds(inputs()));
        expect(result.message).toBeUndefined();
        expect(result.instance).toEqual({
            id: 'firefly-image-gen',
            name: 'Firefly Image Gen',
        });
    });

    it('valid name is unaffected by non-colliding reserved ids', () => {
        const reserved = buildReservedIds(
            inputs({ selectedIntegrationIds: ['other-app'], catalogIds: ['app-builder-shell'] })
        );
        expect(evaluateInstanceName('Order Sync', reserved).instance).toEqual({
            id: 'order-sync',
            name: 'Order Sync',
        });
    });
});

describe('mintInstance (optional-name model, 2026-08-27)', () => {
    it('mints the slugged label when it is free', () => {
        expect(mintInstance('Order Sync', new Set(['other']))).toEqual({
            id: 'order-sync',
            name: 'Order Sync',
        });
    });

    it('silently suffixes BOTH id and display name on a collision — never an error', () => {
        expect(mintInstance('Custom Integration', new Set(['custom-integration']))).toEqual({
            id: 'custom-integration-2',
            name: 'Custom Integration 2',
        });
    });

    it('keeps counting past existing suffixes', () => {
        const reserved = new Set(['custom-integration', 'custom-integration-2']);
        expect(mintInstance('Custom Integration', reserved)).toEqual({
            id: 'custom-integration-3',
            name: 'Custom Integration 3',
        });
    });

    it('a label with no usable letters falls back to the custom-integration stem', () => {
        expect(mintInstance('123', new Set())).toEqual({ id: 'custom-integration', name: '123' });
    });
});
