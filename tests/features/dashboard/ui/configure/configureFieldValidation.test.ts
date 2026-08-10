/**
 * configureFieldValidation tests
 *
 * The global validation pass behind Configure's Save gate. It runs over EVERY service
 * group, which is what keeps an error in an off-screen section blocking Save now that
 * the rail shows one section at a time.
 */

import { mockComponentsData } from './ConfigureScreen.testUtils';
import { validateServiceGroups } from '@/features/dashboard/ui/configure/configureFieldValidation';
import type { ServiceGroup, UniqueField } from '@/features/dashboard/ui/configure/configureTypes';

/** A UniqueField built from the real env-var definitions in the shared fixtures. */
function field(
    key: keyof typeof mockComponentsData.envVars,
    overrides: Partial<UniqueField> = {},
): UniqueField {
    return { ...mockComponentsData.envVars[key], componentIds: ['headless'], ...overrides };
}

function group(id: string, fields: UniqueField[]): ServiceGroup {
    return { id, label: id, fields };
}

/** Values keyed by field key; anything absent reads as empty. */
function lookup(values: Record<string, string>) {
    return (f: UniqueField) => values[f.key];
}

describe('validateServiceGroups', () => {
    describe('required fields', () => {
        it('reports a required field with no value', () => {
            const groups = [group('adobe-commerce', [field('ADOBE_COMMERCE_URL')])];
            expect(validateServiceGroups(groups, lookup({}))).toEqual({
                ADOBE_COMMERCE_URL: 'Commerce URL is required',
            });
        });

        it('reports nothing once that field has a value (the control)', () => {
            const groups = [group('adobe-commerce', [field('ADOBE_COMMERCE_URL')])];
            const values = { ADOBE_COMMERCE_URL: 'https://example.com' };
            expect(validateServiceGroups(groups, lookup(values))).toEqual({});
        });

        it('ignores an OPTIONAL field with no value', () => {
            const groups = [group('adobe-commerce', [field('OPTIONAL_WITH_DEFAULT')])];
            expect(validateServiceGroups(groups, lookup({}))).toEqual({});
        });

        it('accepts a default in place of a value', () => {
            const withDefault = field('ADOBE_COMMERCE_URL', { default: 'https://fallback.test' });
            const groups = [group('adobe-commerce', [withDefault])];
            expect(validateServiceGroups(groups, lookup({}))).toEqual({});
        });

        it('never requires MESH_ENDPOINT — a deploy fills it in', () => {
            const mesh: UniqueField = {
                key: 'MESH_ENDPOINT',
                label: 'Mesh Endpoint',
                type: 'text',
                required: true,
                componentIds: ['mesh'],
            };
            expect(validateServiceGroups([group('mesh', [mesh])], lookup({}))).toEqual({});
        });
    });

    describe('format', () => {
        it('rejects a malformed URL', () => {
            const groups = [group('adobe-commerce', [field('ADOBE_COMMERCE_URL')])];
            const errors = validateServiceGroups(groups, lookup({ ADOBE_COMMERCE_URL: 'not-a-url' }));
            expect(errors.ADOBE_COMMERCE_URL).toBe('Please enter a valid URL');
        });

        it('rejects a value that fails the field pattern', () => {
            const patterned = field('ADOBE_COMMERCE_ADMIN_USERNAME', {
                validation: { pattern: '^[a-z]+$', message: 'Letters only' },
            });
            const groups = [group('adobe-commerce', [patterned])];
            const errors = validateServiceGroups(groups, lookup({ ADOBE_COMMERCE_ADMIN_USERNAME: 'Ad1' }));
            expect(errors.ADOBE_COMMERCE_ADMIN_USERNAME).toBe('Letters only');
        });

        it('accepts a value that satisfies the pattern (the control)', () => {
            const patterned = field('ADOBE_COMMERCE_ADMIN_USERNAME', {
                validation: { pattern: '^[a-z]+$', message: 'Letters only' },
            });
            const groups = [group('adobe-commerce', [patterned])];
            expect(validateServiceGroups(groups, lookup({ ADOBE_COMMERCE_ADMIN_USERNAME: 'admin' }))).toEqual({});
        });

        it('does not format-check a field left on its default', () => {
            // The default is not a URL, but the user never typed it — silently failing a
            // value they cannot see would leave Save disabled with nothing to fix.
            const withDefault = field('ADOBE_COMMERCE_URL', { default: 'not-a-url' });
            const groups = [group('adobe-commerce', [withDefault])];
            expect(validateServiceGroups(groups, lookup({}))).toEqual({});
        });
    });

    describe('scope', () => {
        it('walks EVERY group, not just the first', () => {
            const groups = [
                group('adobe-commerce', [field('ADOBE_COMMERCE_URL')]),
                group('catalog-service', [field('ADOBE_CATALOG_API_KEY', { componentIds: ['catalog-service'] })]),
            ];
            expect(validateServiceGroups(groups, lookup({}))).toEqual({
                ADOBE_COMMERCE_URL: 'Commerce URL is required',
                ADOBE_CATALOG_API_KEY: 'Catalog API Key is required',
            });
        });

        it('returns no errors for no groups', () => {
            expect(validateServiceGroups([], lookup({}))).toEqual({});
        });
    });
});
