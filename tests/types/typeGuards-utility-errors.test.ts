/**
 * Type Guards Tests - Error Handling
 *
 * Tests for error handling utilities:
 * - assertNever (exhaustiveness checking)
 * - isError (Error instance checking)
 * - toError (error conversion)
 *
 * Target Coverage: 90%+
 */

import {
    assertNever,
    isError,
    toError
} from '@/types/typeGuards';

describe('typeGuards - Error Handling', () => {

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
