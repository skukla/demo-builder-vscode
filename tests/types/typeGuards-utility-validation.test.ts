/**
 * Type Guards Tests - Object & Array Validation
 *
 * Tests for object and array validation utilities:
 * - isRecord (plain object checking)
 * - isStringArray (string array validation)
 * - hasProperty (property existence checking)
 *
 * Target Coverage: 90%+
 */

import {
    isRecord,
    isStringArray,
    hasProperty
} from '@/types/typeGuards';

describe('typeGuards - Object & Array Validation', () => {

    // =================================================================
    // isRecord Tests
    // =================================================================

    describe('isRecord', () => {
        describe('valid records', () => {
            it('should accept plain objects', () => {
                expect(isRecord({})).toBe(true);
                expect(isRecord({ key: 'value' })).toBe(true);
                expect(isRecord({ nested: { deep: true } })).toBe(true);
            });

            it('should accept objects with various property types', () => {
                expect(isRecord({
                    string: 'value',
                    number: 123,
                    boolean: true,
                    null: null,
                    array: [1, 2, 3]
                })).toBe(true);
            });
        });

        describe('invalid records', () => {
            it('should reject null', () => {
                expect(isRecord(null)).toBe(false);
            });

            it('should reject undefined', () => {
                expect(isRecord(undefined)).toBe(false);
            });

            it('should reject arrays', () => {
                expect(isRecord([])).toBe(false);
                expect(isRecord([1, 2, 3])).toBe(false);
            });

            it('should reject primitives', () => {
                expect(isRecord('string')).toBe(false);
                expect(isRecord(123)).toBe(false);
                expect(isRecord(true)).toBe(false);
            });

            it('should reject functions', () => {
                expect(isRecord(() => {})).toBe(false);
            });
        });
    });

    // =================================================================
    // isStringArray Tests
    // =================================================================

    describe('isStringArray', () => {
        describe('valid string arrays', () => {
            it('should accept empty arrays', () => {
                expect(isStringArray([])).toBe(true);
            });

            it('should accept arrays of strings', () => {
                expect(isStringArray(['a', 'b', 'c'])).toBe(true);
                expect(isStringArray(['test'])).toBe(true);
                expect(isStringArray([''])).toBe(true); // Empty string is still a string
            });

            it('should accept arrays with many strings', () => {
                const arr = Array.from({ length: 100 }, (_, i) => `string${i}`);
                expect(isStringArray(arr)).toBe(true);
            });
        });

        describe('invalid string arrays', () => {
            it('should reject non-arrays', () => {
                expect(isStringArray(null)).toBe(false);
                expect(isStringArray(undefined)).toBe(false);
                expect(isStringArray('string')).toBe(false);
                expect(isStringArray({})).toBe(false);
            });

            it('should reject arrays with non-string elements', () => {
                expect(isStringArray([1, 2, 3])).toBe(false);
                expect(isStringArray([true, false])).toBe(false);
                expect(isStringArray([null])).toBe(false);
                expect(isStringArray([undefined])).toBe(false);
            });

            it('should reject mixed arrays', () => {
                expect(isStringArray(['a', 1, 'b'])).toBe(false);
                expect(isStringArray(['string', null])).toBe(false);
                expect(isStringArray(['test', {}])).toBe(false);
            });
        });
    });

    // =================================================================
    // hasProperty Tests
    // =================================================================

    describe('hasProperty', () => {
        describe('valid properties', () => {
            it('should return true for existing properties', () => {
                const obj = { name: 'test', value: 123 };
                expect(hasProperty(obj, 'name')).toBe(true);
                expect(hasProperty(obj, 'value')).toBe(true);
            });

            it('should work with optional properties', () => {
                const obj: { required: string; optional?: string } = {
                    required: 'value'
                };
                expect(hasProperty(obj, 'required')).toBe(true);
                expect(hasProperty(obj, 'optional')).toBe(false);
            });

            it('should check prototype chain', () => {
                const proto = { inherited: 'value' };
                const obj = Object.create(proto);
                expect(hasProperty(obj, 'inherited')).toBe(true);
            });
        });

        describe('invalid properties', () => {
            it('should return false for non-existent properties', () => {
                const obj = { name: 'test' };
                expect(hasProperty(obj, 'missing')).toBe(false);
            });

            it('should return false for non-objects', () => {
                expect(hasProperty(null, 'key')).toBe(false);
                expect(hasProperty(undefined, 'key')).toBe(false);
                expect(hasProperty('string', 'key')).toBe(false);
                expect(hasProperty(123, 'key')).toBe(false);
            });
        });
    });
});
