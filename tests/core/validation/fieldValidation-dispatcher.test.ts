/**
 * Field Validation Tests - Dispatcher
 *
 * Tests for validateFieldUI, a switch over the field name with two cases and a
 * permissive default.
 *
 * THE TRAP THIS SUITE HAS TO AVOID: a VALID value cannot tell routing from
 * fall-through. `validateProjectNameUI('my-project')` and the default arm both
 * return `{isValid: true, message: ''}`, so a test that routes a good value
 * passes just as happily when the case label is broken. Only a value the
 * delegate would REJECT distinguishes the two, which is why every routing case
 * below carries one, and why the unknown-field cases pass values that would
 * fail if they were wrongly routed.
 *
 * Routing is asserted by comparing against the delegate's own output rather
 * than by repeating its message text — the delegate owns its wording, and this
 * suite owns only the question of which one was called.
 */

import {
    validateFieldUI,
    validateProjectNameUI,
    validateCommerceUrlUI,
} from '@/core/validation/fieldValidation';

/** Values a delegate rejects, so the assertion can see which one ran. */
const REJECTED_BY_PROJECT_NAME = ['invalid project', ''];
const REJECTED_BY_COMMERCE_URL = ['not-a-url', 'ftp://example.com'];

/**
 * Field names that must reach the default arm. Each is paired with a value the
 * projectName rule would REJECT, so a mis-routed field fails here instead of
 * passing quietly.
 */
const UNROUTED_FIELDS: ReadonlyArray<readonly [string, string]> = [
    ['an unknown name', 'unknownField'],
    ['a custom name', 'customField'],
    ['a differently cased name', 'ProjectName'],
    ['a snake_case variant', 'project_name'],
    ['an empty name', ''],
];

describe('validateFieldUI', () => {
    describe('routes projectName to its validator', () => {
        it.each(REJECTED_BY_PROJECT_NAME)('for the rejected value %p', (value) => {
            expect(validateFieldUI('projectName', value)).toEqual(validateProjectNameUI(value));
            expect(validateFieldUI('projectName', value).isValid).toBe(false);
        });

        it('and passes a good value through', () => {
            expect(validateFieldUI('projectName', 'my-project')).toEqual({
                isValid: true,
                message: '',
            });
        });
    });

    describe('routes commerceUrl to its validator', () => {
        it.each(REJECTED_BY_COMMERCE_URL)('for the rejected value %p', (value) => {
            expect(validateFieldUI('commerceUrl', value)).toEqual(validateCommerceUrlUI(value));
            expect(validateFieldUI('commerceUrl', value).isValid).toBe(false);
        });

        it('and passes a good value through', () => {
            expect(validateFieldUI('commerceUrl', 'https://example.com')).toEqual({
                isValid: true,
                message: '',
            });
        });

        it('accepts an empty URL, because that field is optional', () => {
            expect(validateFieldUI('commerceUrl', '')).toEqual({ isValid: true, message: '' });
        });
    });

    describe('validates nothing for a field it does not know', () => {
        it.each(UNROUTED_FIELDS)('%s (%p)', (_label, field) => {
            // The value would FAIL the projectName rule. Getting a pass back is
            // what proves the default arm ran rather than a case label matching.
            expect(validateFieldUI(field, 'invalid value!')).toEqual({
                isValid: true,
                message: '',
            });
        });

        // Callers reach this from untyped webview messages, so a missing field
        // name is a real input rather than a type-system impossibility. The
        // cast states that deliberately.
        it.each([
            ['null', null],
            ['undefined', undefined],
        ])('a %s field name', (_label, field) => {
            const result = validateFieldUI(field as unknown as string, 'invalid value!');

            expect(result).toEqual({ isValid: true, message: '' });
        });
    });
});
