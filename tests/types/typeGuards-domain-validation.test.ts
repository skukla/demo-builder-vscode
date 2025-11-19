/**
 * Type Guards Tests - Validation & Response Types
 *
 * Tests for validation and response type guards:
 * - isValidationResult (validation result validation)
 * - isMessageResponse (message response validation)
 * - isLogger (logger interface validation)
 *
 * Target Coverage: 90%+
 */

import {
    isValidationResult,
    isMessageResponse,
    isLogger,
    ValidationResult
} from '@/types/typeGuards';
import { MessageResponse } from '@/types/messages';
import { Logger } from '@/types/logger';
import {
    createValidValidationResult,
    createValidMessageResponse,
    createValidLogger,
    NON_OBJECT_VALUES
} from './typeGuards-domain.testUtils';

describe('typeGuards - Validation & Response Types', () => {

    // =================================================================
    // isValidationResult Tests
    // =================================================================

    describe('isValidationResult', () => {
        describe('valid results', () => {
            it('should accept valid validation results', () => {
                const result = createValidValidationResult();
                expect(isValidationResult(result)).toBe(true);
            });

            it('should accept results with errors and warnings', () => {
                const result: ValidationResult = createValidValidationResult({
                    valid: false,
                    errors: ['Error 1', 'Error 2'],
                    warnings: ['Warning 1']
                });
                expect(isValidationResult(result)).toBe(true);
            });
        });

        describe('invalid results', () => {
            it('should reject non-objects', () => {
                NON_OBJECT_VALUES.forEach(value => {
                    expect(isValidationResult(value)).toBe(false);
                });
            });

            it('should reject objects with wrong types', () => {
                expect(isValidationResult({
                    valid: 'true', // Should be boolean
                    errors: [],
                    warnings: []
                })).toBe(false);

                expect(isValidationResult({
                    valid: true,
                    errors: 'not-array', // Should be array
                    warnings: []
                })).toBe(false);

                expect(isValidationResult({
                    valid: true,
                    errors: [],
                    warnings: 'not-array' // Should be array
                })).toBe(false);
            });

            it('should reject objects missing required fields', () => {
                expect(isValidationResult({ valid: true })).toBe(false);
                expect(isValidationResult({ errors: [], warnings: [] })).toBe(false);
            });
        });
    });

    // =================================================================
    // isMessageResponse Tests
    // =================================================================

    describe('isMessageResponse', () => {
        describe('valid responses', () => {
            it('should accept valid message responses', () => {
                const response = createValidMessageResponse();
                expect(isMessageResponse(response)).toBe(true);
            });

            it('should accept responses with optional fields', () => {
                const response: MessageResponse = createValidMessageResponse({
                    success: false,
                    error: 'Error message',
                    data: { key: 'value' }
                });
                expect(isMessageResponse(response)).toBe(true);
            });

            it('should accept responses with any data type', () => {
                expect(isMessageResponse({ success: true, data: 'string' })).toBe(true);
                expect(isMessageResponse({ success: true, data: 123 })).toBe(true);
                expect(isMessageResponse({ success: true, data: [] })).toBe(true);
                expect(isMessageResponse({ success: true, data: null })).toBe(true);
            });
        });

        describe('invalid responses', () => {
            it('should reject non-objects', () => {
                NON_OBJECT_VALUES.forEach(value => {
                    expect(isMessageResponse(value)).toBe(false);
                });
            });

            it('should reject objects without success field', () => {
                expect(isMessageResponse({})).toBe(false);
                expect(isMessageResponse({ error: 'test' })).toBe(false);
            });

            it('should reject objects with wrong success type', () => {
                expect(isMessageResponse({ success: 'true' })).toBe(false);
                expect(isMessageResponse({ success: 1 })).toBe(false);
                expect(isMessageResponse({ success: null })).toBe(false);
            });
        });
    });

    // =================================================================
    // isLogger Tests
    // =================================================================

    describe('isLogger', () => {
        describe('valid loggers', () => {
            it('should accept objects with all required logger methods', () => {
                const logger = createValidLogger();
                expect(isLogger(logger)).toBe(true);
            });

            it('should accept objects with additional properties', () => {
                const logger = {
                    debug: () => {},
                    info: () => {},
                    warn: () => {},
                    error: () => {},
                    extra: 'property'
                };
                expect(isLogger(logger)).toBe(true);
            });
        });

        describe('invalid loggers', () => {
            it('should reject non-objects', () => {
                NON_OBJECT_VALUES.forEach(value => {
                    expect(isLogger(value)).toBe(false);
                });
            });

            it('should reject objects missing required methods', () => {
                expect(isLogger({})).toBe(false);
                expect(isLogger({
                    debug: () => {},
                    info: () => {},
                    warn: () => {}
                    // Missing error
                })).toBe(false);
            });

            it('should reject objects with non-function properties', () => {
                expect(isLogger({
                    debug: 'not-a-function',
                    info: () => {},
                    warn: () => {},
                    error: () => {}
                })).toBe(false);
            });
        });
    });
});
