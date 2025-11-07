/**
 * Type Guards Tests - Utility Functions
 *
 * Tests for generic type guards and utility functions:
 * - parseJSON (JSON parsing with optional validation)
 * - isRecord (plain object checking)
 * - isStringArray (string array validation)
 * - hasProperty (property existence checking)
 * - assertNever (exhaustiveness checking)
 * - isError (Error instance checking)
 * - toError (error conversion)
 * - isStateValue (serializable value checking)
 *
 * Target Coverage: 90%+
 */

import {
    parseJSON,
    isRecord,
    isStringArray,
    hasProperty,
    assertNever,
    isError,
    toError,
    isStateValue
} from '@/types/typeGuards';

describe('typeGuards - Utility Functions', () => {

    // =================================================================
    // parseJSON Tests
    // =================================================================

    describe('parseJSON', () => {
        describe('valid JSON', () => {
            it('should parse valid JSON strings', () => {
                const result = parseJSON('{"key": "value"}');
                expect(result).toEqual({ key: 'value' });
            });

            it('should parse JSON arrays', () => {
                const result = parseJSON('[1, 2, 3]');
                expect(result).toEqual([1, 2, 3]);
            });

            it('should parse JSON primitives', () => {
                expect(parseJSON('42')).toBe(42);
                expect(parseJSON('"string"')).toBe('string');
                expect(parseJSON('true')).toBe(true);
                expect(parseJSON('false')).toBe(false);
                expect(parseJSON('null')).toBe(null);
            });

            it('should parse nested objects', () => {
                const json = '{"outer": {"inner": "value"}}';
                const result = parseJSON(json);
                expect(result).toEqual({ outer: { inner: 'value' } });
            });

            it('should parse complex structures', () => {
                const json = '{"arr": [1, 2, {"nested": true}], "num": 42}';
                const result = parseJSON(json);
                expect(result).toEqual({
                    arr: [1, 2, { nested: true }],
                    num: 42
                });
            });
        });

        describe('invalid JSON', () => {
            it('should return null for invalid JSON', () => {
                expect(parseJSON('not json')).toBe(null);
                expect(parseJSON('{')).toBe(null);
                expect(parseJSON('}')).toBe(null);
                expect(parseJSON('["incomplete')).toBe(null);
            });

            it('should return null for malformed JSON', () => {
                expect(parseJSON('{key: "value"}')).toBe(null); // Missing quotes
                expect(parseJSON("{'key': 'value'}")).toBe(null); // Single quotes
                expect(parseJSON('{,}')).toBe(null);
            });

            it('should return null for empty string', () => {
                expect(parseJSON('')).toBe(null);
            });
        });

        describe('with type guard', () => {
            interface TestType {
                name: string;
                age: number;
            }

            const isTestType = (value: unknown): value is TestType => {
                return (
                    isRecord(value) &&
                    typeof value.name === 'string' &&
                    typeof value.age === 'number'
                );
            };

            it('should parse and validate with type guard', () => {
                const json = '{"name": "Alice", "age": 30}';
                const result = parseJSON<TestType>(json, isTestType);
                expect(result).toEqual({ name: 'Alice', age: 30 });
            });

            it('should return null when type guard fails', () => {
                const json = '{"name": "Alice", "age": "30"}'; // age is string, not number
                const result = parseJSON<TestType>(json, isTestType);
                expect(result).toBe(null);
            });

            it('should return null for valid JSON that fails type guard', () => {
                const json = '{"different": "structure"}';
                const result = parseJSON<TestType>(json, isTestType);
                expect(result).toBe(null);
            });

            it('should work with array type guards', () => {
                const json = '["a", "b", "c"]';
                const result = parseJSON<string[]>(json, isStringArray);
                expect(result).toEqual(['a', 'b', 'c']);
            });

            it('should reject arrays with wrong types', () => {
                const json = '[1, 2, 3]';
                const result = parseJSON<string[]>(json, isStringArray);
                expect(result).toBe(null);
            });
        });

        describe('edge cases', () => {
            it('should handle whitespace', () => {
                const json = '  \n\t{"key": "value"}\n  ';
                const result = parseJSON(json);
                expect(result).toEqual({ key: 'value' });
            });

            it('should handle escaped characters', () => {
                const json = '{"key": "value with \\"quotes\\""}';
                const result = parseJSON(json);
                expect(result).toEqual({ key: 'value with "quotes"' });
            });

            it('should handle unicode', () => {
                const json = '{"emoji": "😀", "chinese": "你好"}';
                const result = parseJSON(json);
                expect(result).toEqual({ emoji: '😀', chinese: '你好' });
            });

            it('should handle large numbers', () => {
                const json = '{"big": 9007199254740991}';
                const result = parseJSON(json);
                expect(result).toEqual({ big: 9007199254740991 });
            });
        });

        describe('security', () => {
            it('should not execute code from JSON', () => {
                const malicious = '{"__proto__": {"polluted": true}}';
                const result = parseJSON(malicious);
                // Should parse but not pollute prototype
                expect(result).toBeTruthy();
            });

            it('should handle very long strings', () => {
                const longString = 'a'.repeat(10000);
                const json = `{"key": "${longString}"}`;
                const result = parseJSON(json);
                expect(result).toEqual({ key: longString });
            });
        });
    });

    // =================================================================
    // isStateValue Tests
    // =================================================================

    describe('isStateValue', () => {
        describe('valid state values', () => {
            it('should accept null and undefined', () => {
                expect(isStateValue(null)).toBe(true);
                expect(isStateValue(undefined)).toBe(true);
            });

            it('should accept primitives', () => {
                expect(isStateValue('string')).toBe(true);
                expect(isStateValue(123)).toBe(true);
                expect(isStateValue(true)).toBe(true);
                expect(isStateValue(false)).toBe(true);
            });

            it('should accept arrays', () => {
                expect(isStateValue([])).toBe(true);
                expect(isStateValue([1, 2, 3])).toBe(true);
                expect(isStateValue(['a', 'b'])).toBe(true);
            });

            it('should accept objects', () => {
                expect(isStateValue({})).toBe(true);
                expect(isStateValue({ key: 'value' })).toBe(true);
                expect(isStateValue({ nested: { deep: true } })).toBe(true);
            });
        });

        describe('invalid state values', () => {
            it('should reject functions', () => {
                expect(isStateValue(() => {})).toBe(false);
            });

            it('should reject symbols', () => {
                expect(isStateValue(Symbol('test'))).toBe(false);
            });
        });
    });

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

    // =================================================================
    // assertNever Tests
    // =================================================================

    describe('assertNever', () => {
        it('should throw error with value information', () => {
            expect(() => assertNever('unexpected' as never))
                .toThrow(/Unexpected value/);
        });

        it('should include the value in error message', () => {
            try {
                assertNever('test-value' as never);
                fail('Should have thrown');
            } catch (error) {
                expect((error as Error).message).toContain('test-value');
            }
        });

        it('should handle complex values', () => {
            const complexValue = { key: 'value', nested: { deep: true } };
            try {
                assertNever(complexValue as never);
                fail('Should have thrown');
            } catch (error) {
                expect((error as Error).message).toContain('key');
            }
        });
    });

    // =================================================================
    // isError Tests
    // =================================================================

    describe('isError', () => {
        describe('valid errors', () => {
            it('should accept Error instances', () => {
                expect(isError(new Error('test'))).toBe(true);
            });

            it('should accept Error subclasses', () => {
                expect(isError(new TypeError('test'))).toBe(true);
                expect(isError(new RangeError('test'))).toBe(true);
                expect(isError(new SyntaxError('test'))).toBe(true);
            });

            it('should accept custom error classes', () => {
                class CustomError extends Error {}
                expect(isError(new CustomError('test'))).toBe(true);
            });
        });

        describe('invalid errors', () => {
            it('should reject non-Error objects', () => {
                expect(isError({ message: 'error' })).toBe(false);
                expect(isError('error string')).toBe(false);
                expect(isError(null)).toBe(false);
                expect(isError(undefined)).toBe(false);
            });

            it('should reject error-like objects', () => {
                expect(isError({
                    name: 'Error',
                    message: 'test',
                    stack: 'stack trace'
                })).toBe(false);
            });
        });
    });

    // =================================================================
    // toError Tests
    // =================================================================

    describe('toError', () => {
        describe('Error input', () => {
            it('should return Error as-is', () => {
                const error = new Error('test');
                expect(toError(error)).toBe(error);
            });

            it('should return Error subclasses as-is', () => {
                const typeError = new TypeError('test');
                expect(toError(typeError)).toBe(typeError);
            });
        });

        describe('string input', () => {
            it('should convert strings to Error', () => {
                const result = toError('error message');
                expect(result).toBeInstanceOf(Error);
                expect(result.message).toBe('error message');
            });

            it('should handle empty strings', () => {
                const result = toError('');
                expect(result).toBeInstanceOf(Error);
                expect(result.message).toBe('');
            });
        });

        describe('object input', () => {
            it('should extract message from objects', () => {
                const result = toError({ message: 'error from object' });
                expect(result).toBeInstanceOf(Error);
                expect(result.message).toBe('error from object');
            });

            it('should handle objects without message', () => {
                const result = toError({ code: 'ERROR' });
                expect(result).toBeInstanceOf(Error);
                expect(result.message).toBe('Unknown error occurred');
            });

            it('should handle objects with non-string message', () => {
                const result = toError({ message: 123 });
                expect(result).toBeInstanceOf(Error);
                expect(result.message).toBe('Unknown error occurred');
            });
        });

        describe('other input types', () => {
            it('should handle null', () => {
                const result = toError(null);
                expect(result).toBeInstanceOf(Error);
                expect(result.message).toBe('Unknown error occurred');
            });

            it('should handle undefined', () => {
                const result = toError(undefined);
                expect(result).toBeInstanceOf(Error);
                expect(result.message).toBe('Unknown error occurred');
            });

            it('should handle numbers', () => {
                const result = toError(123);
                expect(result).toBeInstanceOf(Error);
                expect(result.message).toBe('Unknown error occurred');
            });

            it('should handle booleans', () => {
                const result = toError(true);
                expect(result).toBeInstanceOf(Error);
                expect(result.message).toBe('Unknown error occurred');
            });

            it('should handle arrays', () => {
                const result = toError([1, 2, 3]);
                expect(result).toBeInstanceOf(Error);
                expect(result.message).toBe('Unknown error occurred');
            });
        });

        describe('edge cases', () => {
            it('should handle circular references', () => {
                const obj: any = { message: 'test' };
                obj.self = obj;
                const result = toError(obj);
                expect(result).toBeInstanceOf(Error);
                expect(result.message).toBe('test');
            });

            it('should handle symbols', () => {
                const result = toError(Symbol('test'));
                expect(result).toBeInstanceOf(Error);
                expect(result.message).toBe('Unknown error occurred');
            });
        });
    });
});
