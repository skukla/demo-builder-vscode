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
    overrides: Partial<UniqueField> = {}
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
            expect(validateServiceGroups(groups, lookup(values))).toStrictEqual({});
        });

        it('ignores an OPTIONAL field with no value', () => {
            const groups = [group('adobe-commerce', [field('OPTIONAL_WITH_DEFAULT')])];
            expect(validateServiceGroups(groups, lookup({}))).toStrictEqual({});
        });

        it('accepts a default in place of a value', () => {
            const withDefault = field('ADOBE_COMMERCE_URL', { default: 'https://fallback.test' });
            const groups = [group('adobe-commerce', [withDefault])];
            expect(validateServiceGroups(groups, lookup({}))).toStrictEqual({});
        });

        it('treats an empty string as no value at all', () => {
            // A field the user cleared reads as empty, not as filled in.
            const groups = [group('adobe-commerce', [field('ADOBE_COMMERCE_URL')])];
            expect(validateServiceGroups(groups, lookup({ ADOBE_COMMERCE_URL: '' }))).toStrictEqual(
                { ADOBE_COMMERCE_URL: 'Commerce URL is required' }
            );
        });

        it('does not accept an EMPTY default in place of a value', () => {
            // An empty default is not a value the field can fall back to; the
            // registry writes one when it has nothing to suggest.
            const emptyDefault = field('ADOBE_COMMERCE_URL', { default: '' });
            const groups = [group('adobe-commerce', [emptyDefault])];
            expect(validateServiceGroups(groups, lookup({}))).toStrictEqual({
                ADOBE_COMMERCE_URL: 'Commerce URL is required',
            });
        });

        // MESH_ENDPOINT's exemption is gone with the field: it never reaches a
        // service group now (useServiceGroups deletes it), and the registry
        // declares it optional anyway. The old test here hand-built it as
        // `required: true` in a `mesh` group — a state production cannot produce.
        // Coverage moved to useServiceGroups.test.tsx, which asserts the field
        // appears in no section at all.
    });

    describe('format', () => {
        it('rejects a malformed URL', () => {
            const groups = [group('adobe-commerce', [field('ADOBE_COMMERCE_URL')])];
            const errors = validateServiceGroups(
                groups,
                lookup({ ADOBE_COMMERCE_URL: 'not-a-url' })
            );
            expect(errors.ADOBE_COMMERCE_URL).toBe('Please enter a valid URL');
        });

        it('rejects a value that fails the field pattern', () => {
            const patterned = field('ADOBE_COMMERCE_ADMIN_USERNAME', {
                validation: { pattern: '^[a-z]+$', message: 'Letters only' },
            });
            const groups = [group('adobe-commerce', [patterned])];
            const errors = validateServiceGroups(
                groups,
                lookup({ ADOBE_COMMERCE_ADMIN_USERNAME: 'Ad1' })
            );
            expect(errors.ADOBE_COMMERCE_ADMIN_USERNAME).toBe('Letters only');
        });

        it('accepts a value that satisfies the pattern (the control)', () => {
            const patterned = field('ADOBE_COMMERCE_ADMIN_USERNAME', {
                validation: { pattern: '^[a-z]+$', message: 'Letters only' },
            });
            const groups = [group('adobe-commerce', [patterned])];
            expect(
                validateServiceGroups(groups, lookup({ ADOBE_COMMERCE_ADMIN_USERNAME: 'admin' }))
            ).toStrictEqual({});
        });

        it('checks the pattern even after the URL check passes', () => {
            // Both checks apply to one value. A well-formed URL pointing at the
            // wrong host is exactly what the second one is for.
            const both = field('ADOBE_COMMERCE_URL', {
                validation: {
                    pattern: '\\.adobedemo\\.com$',
                    message: 'Must be an adobedemo host',
                },
            });
            const groups = [group('adobe-commerce', [both])];
            const errors = validateServiceGroups(
                groups,
                lookup({ ADOBE_COMMERCE_URL: 'https://example.com' })
            );
            expect(errors.ADOBE_COMMERCE_URL).toBe('Must be an adobedemo host');
        });

        it('does not format-check a field with no value at all', () => {
            // An optional field nobody filled in has nothing to check the format
            // of — running the pattern against `undefined` invents an error.
            const patterned = field('ADOBE_COMMERCE_ADMIN_USERNAME', {
                required: false,
                validation: { pattern: '^[0-9]+$', message: 'Digits only' },
            });
            const groups = [group('adobe-commerce', [patterned])];
            expect(validateServiceGroups(groups, lookup({}))).toStrictEqual({});
        });

        it('does not format-check a field the user cleared', () => {
            const patterned = field('ADOBE_COMMERCE_ADMIN_USERNAME', {
                required: false,
                validation: { pattern: '^[0-9]+$', message: 'Digits only' },
            });
            const groups = [group('adobe-commerce', [patterned])];
            expect(
                validateServiceGroups(groups, lookup({ ADOBE_COMMERCE_ADMIN_USERNAME: '' }))
            ).toStrictEqual({});
        });

        it('does not format-check a value that is not a string', () => {
            // Boolean and number fields resolve to non-strings; a regex would
            // stringify them and reject perfectly good values.
            const patterned = field('ADOBE_COMMERCE_ADMIN_USERNAME', {
                required: false,
                validation: { pattern: '^[a-z]+$', message: 'Letters only' },
            });
            const groups = [group('adobe-commerce', [patterned])];
            expect(validateServiceGroups(groups, () => 8080)).toStrictEqual({});
        });

        it('does not format-check a field left on its default', () => {
            // The default is not a URL, but the user never typed it — silently failing a
            // value they cannot see would leave Save disabled with nothing to fix.
            const withDefault = field('ADOBE_COMMERCE_URL', { default: 'not-a-url' });
            const groups = [group('adobe-commerce', [withDefault])];
            expect(validateServiceGroups(groups, lookup({}))).toStrictEqual({});
        });
    });

    describe('scope', () => {
        it('walks EVERY group, not just the first', () => {
            const groups = [
                group('adobe-commerce', [field('ADOBE_COMMERCE_URL')]),
                group('catalog-service', [
                    field('ADOBE_CATALOG_API_KEY', { componentIds: ['catalog-service'] }),
                ]),
            ];
            expect(validateServiceGroups(groups, lookup({}))).toEqual({
                ADOBE_COMMERCE_URL: 'Commerce URL is required',
                ADOBE_CATALOG_API_KEY: 'Catalog API Key is required',
            });
        });

        it('returns no errors for no groups', () => {
            expect(validateServiceGroups([], lookup({}))).toStrictEqual({});
        });
    });
});
