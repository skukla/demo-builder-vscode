/**
 * Type Guards Tests - Status Types
 *
 * Tests for status type guards:
 * - isComponentStatus (component status validation)
 * - isProjectStatus (project status validation)
 *
 * Target Coverage: 90%+
 */

import {
    isComponentStatus,
    isProjectStatus
} from '@/types/typeGuards';
import {
    ComponentStatus,
    ProjectStatus
} from '@/types/base';
import {
    VALID_COMPONENT_STATUSES,
    VALID_PROJECT_STATUSES,
    INVALID_STATUS_STRINGS,
    NON_STRING_VALUES
} from './typeGuards-domain.testUtils';

describe('typeGuards - Status Types', () => {

    // =================================================================
    // isComponentStatus Tests
    // =================================================================

    describe('isComponentStatus', () => {
        describe('valid statuses', () => {
            it('should accept all valid component statuses', () => {
                VALID_COMPONENT_STATUSES.forEach(status => {
                    expect(isComponentStatus(status)).toBe(true);
                });
            });
        });

        describe('invalid statuses', () => {
            it('should reject invalid status strings', () => {
                INVALID_STATUS_STRINGS.forEach(status => {
                    expect(isComponentStatus(status)).toBe(false);
                });
            });

            it('should reject non-strings', () => {
                NON_STRING_VALUES.forEach(value => {
                    expect(isComponentStatus(value)).toBe(false);
                });
            });
        });
    });

    // =================================================================
    // isProjectStatus Tests
    // =================================================================

    describe('isProjectStatus', () => {
        describe('valid statuses', () => {
            it('should accept all valid project statuses', () => {
                VALID_PROJECT_STATUSES.forEach(status => {
                    expect(isProjectStatus(status)).toBe(true);
                });
            });
        });

        describe('invalid statuses', () => {
            it('should reject invalid status strings', () => {
                expect(isProjectStatus('invalid')).toBe(false);
                expect(isProjectStatus('deploying')).toBe(false); // Component status, not project
                expect(isProjectStatus('READY')).toBe(false); // Case sensitive
            });

            it('should reject non-strings', () => {
                NON_STRING_VALUES.forEach(value => {
                    expect(isProjectStatus(value)).toBe(false);
                });
            });
        });
    });
});
