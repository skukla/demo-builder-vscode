/**
 * Type Guards Tests - JSON Parsing
 *
 * Tests for JSON parsing:
 * - parseJSON (JSON parsing with optional validation)
 *
 * Target Coverage: 90%+
 */

import { parseJSON } from '@/types/typeGuards';

describe('typeGuards - JSON Parsing', () => {
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
                    num: 42,
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

        // No 'with type guard' suite any more: parseJSON's optional guard
        // parameter had ZERO production callers in its whole life (audited
        // 2026-08-21) — these tests were its only user, testing an affordance
        // nothing exercised. Deleted with the parameter per no-soft-deprecation.

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
});
