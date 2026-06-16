/**
 * Tests for the ORG_MISMATCH error code.
 *
 * ORG_MISMATCH signals that the Adobe CLI is targeting a different organization
 * than the one the operation needs. It is user-recoverable in the UI (pick a
 * different org / re-login) but MUST NOT be in the auto-retry recoverable set —
 * an agent retrying the identical call would 403 into the same wrong org.
 */
import {
    ErrorCode,
    getErrorCategory,
    getErrorTitle,
    isRecoverableError,
} from '@/types/errorCodes';

describe('ErrorCode.ORG_MISMATCH', () => {
    it('exists on the ErrorCode enum with a stable string value', () => {
        expect(ErrorCode.ORG_MISMATCH).toBe('ORG_MISMATCH');
    });

    it('is categorized as an auth error', () => {
        expect(getErrorCategory(ErrorCode.ORG_MISMATCH)).toBe('auth');
    });

    it('has a user-friendly title', () => {
        expect(getErrorTitle(ErrorCode.ORG_MISMATCH)).toBe('Wrong organization');
    });

    it('is NOT in the auto-retry recoverable set', () => {
        // Non-retryable for agents: retrying hits the same wrong-org 403.
        expect(isRecoverableError(ErrorCode.ORG_MISMATCH)).toBe(false);
    });
});
