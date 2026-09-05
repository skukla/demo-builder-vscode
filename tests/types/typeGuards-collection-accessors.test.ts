/**
 * Type Guards Tests - Object & Component-Collection Accessors
 *
 * The helpers that replace inline `Object.keys/values/entries` work:
 * - hasEntries / getEntryCount (does this object hold anything, and how much)
 * - getComponentInstanceEntries / getComponentInstanceValues
 * - getComponentInstancesByType
 *
 * Every one of them takes a nullable argument and answers with an EMPTY
 * result rather than throwing — that contract is what the callers rely on and
 * what these tests pin, alongside the populated case each guard protects.
 */

import type { ComponentInstance } from '@/types/base';
import {
    getComponentInstanceEntries,
    getComponentInstanceValues,
    getComponentInstancesByType,
    getEntryCount,
    hasEntries,
} from '@/types/typeGuards';
import { createMockProject } from '../helpers/projectFake';

const FRONTEND: ComponentInstance = {
    id: 'eds-storefront',
    name: 'Edge Delivery Services',
    status: 'ready',
    type: 'frontend',
    port: 3000,
};

const BACKEND: ComponentInstance = {
    id: 'commerce-paas',
    name: 'Adobe Commerce',
    status: 'ready',
    type: 'backend',
};

const project = createMockProject({
    componentInstances: { 'eds-storefront': FRONTEND, 'commerce-paas': BACKEND },
});

describe('hasEntries', () => {
    it('is true for an object with at least one property', () => {
        expect(hasEntries({ key: 'value' })).toBe(true);
    });

    it('is false for an object with no properties', () => {
        expect(hasEntries({})).toBe(false);
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
    ])('is false for %s rather than throwing', (_label, value) => {
        expect(hasEntries(value)).toBe(false);
    });
});

describe('getEntryCount', () => {
    it('counts the enumerable properties', () => {
        expect(getEntryCount({ a: 1, b: 2, c: 3 })).toBe(3);
    });

    it('is zero for an empty object', () => {
        expect(getEntryCount({})).toBe(0);
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
    ])('is zero for %s rather than throwing', (_label, value) => {
        expect(getEntryCount(value)).toBe(0);
    });
});

describe('getComponentInstanceEntries', () => {
    it('returns [id, instance] pairs for every installed component', () => {
        expect(getComponentInstanceEntries(project)).toEqual([
            ['eds-storefront', FRONTEND],
            ['commerce-paas', BACKEND],
        ]);
    });

    it('returns an empty array when the project holds no instances record', () => {
        expect(getComponentInstanceEntries(createMockProject({ componentInstances: undefined }))).toEqual(
            []
        );
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
    ])('returns an empty array for a %s project rather than throwing', (_label, value) => {
        expect(getComponentInstanceEntries(value)).toEqual([]);
    });
});

describe('getComponentInstanceValues', () => {
    it('returns every installed component instance', () => {
        expect(getComponentInstanceValues(project)).toEqual([FRONTEND, BACKEND]);
    });

    it('returns an empty array when the project holds no instances record', () => {
        expect(getComponentInstanceValues(createMockProject({ componentInstances: undefined }))).toEqual(
            []
        );
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
    ])('returns an empty array for a %s project rather than throwing', (_label, value) => {
        expect(getComponentInstanceValues(value)).toEqual([]);
    });
});

describe('getComponentInstancesByType', () => {
    it('returns only the instances of the requested type', () => {
        expect(getComponentInstancesByType(project, 'frontend')).toEqual([FRONTEND]);
        expect(getComponentInstancesByType(project, 'backend')).toEqual([BACKEND]);
    });

    it('returns an empty array when no instance has that type', () => {
        expect(getComponentInstancesByType(project, 'mesh')).toEqual([]);
    });

    it('returns an empty array when no type is asked for', () => {
        // An undefined type must not match everything, AND must not match the
        // instances that carry no `type` of their own — mesh and app instances
        // are keyed by subType, so `c.type === undefined` is true for them and
        // an unguarded filter would hand them back.
        const withUntyped = createMockProject({
            componentInstances: {
                'eds-storefront': FRONTEND,
                'api-mesh': { id: 'api-mesh', name: 'API Mesh', status: 'ready', subType: 'mesh' },
            },
        });
        expect(getComponentInstancesByType(withUntyped, undefined)).toEqual([]);
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
    ])('returns an empty array for a %s project rather than throwing', (_label, value) => {
        expect(getComponentInstancesByType(value, 'frontend')).toEqual([]);
    });
});
