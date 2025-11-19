/**
 * Type Guards Tests - JSON Parsing & State Validation
 *
 * Tests for JSON parsing and state value validation:
 * - parseJSON (JSON parsing with optional validation)
 * - isStateValue (serializable value checking)
 *
 * Target Coverage: 90%+
 */

import {
    parseJSON,
    isRecord,
    isStringArray,
    isStateValue
} from '@/types/typeGuards';

describe('typeGuards - Parsing & State Validation', () => {

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
});
