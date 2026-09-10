/**
 * errorCodes — the two decisions this module makes about a code.
 *
 * `getErrorCategory` is an ordered chain: two codes are named outright because
 * their prefixes would send them to the wrong category, and the rest are decided
 * by prefix. Every arm is asserted here BOTH ways — the code that must land in a
 * category, and a code that must not — because an arm that always fires and an
 * arm that never fires are both invisible to a test that only checks the code it
 * was written for.
 *
 * `isRecoverableError` is the auto-retry set, pinned here both by its members
 * and by its width. ORG_MISMATCH gets its own block at the end: it is the one
 * code whose exclusion from that set is a decision rather than an omission.
 */
import {
    ErrorCode,
    getErrorCategory,
    getErrorTitle,
    isRecoverableError,
} from '@/types/errorCodes';

describe('getErrorCategory', () => {
    it.each([
        // The two named exceptions: both would be miscategorised by prefix alone.
        [ErrorCode.ORG_MISMATCH, 'auth'],
        [ErrorCode.NOT_PROJECT_OWNER, 'project'],
        // One representative per prefix arm, in the order the chain tries them.
        [ErrorCode.AUTH_REQUIRED, 'auth'],
        [ErrorCode.PREREQ_NOT_INSTALLED, 'prereq'],
        [ErrorCode.MESH_DEPLOY_FAILED, 'mesh'],
        [ErrorCode.COMPONENT_NOT_FOUND, 'component'],
        [ErrorCode.PROJECT_NOT_FOUND, 'project'],
        [ErrorCode.CONFIG_PARSE_ERROR, 'config'],
        // Falls off the end of the chain.
        [ErrorCode.UNKNOWN, 'general'],
        [ErrorCode.TIMEOUT, 'general'],
        [ErrorCode.INVALID_OPERATION, 'general'],
    ])('%s is a %s error', (code, category) => {
        expect(getErrorCategory(code)).toBe(category);
    });

    it('NOT_PROJECT_OWNER is named outright because its prefix is not PROJECT_', () => {
        // 'NOT_PROJECT_OWNER'.startsWith('PROJECT_') is false, so without the
        // named arm it would fall through the whole chain to 'general'.
        expect(ErrorCode.NOT_PROJECT_OWNER.startsWith('PROJECT_')).toBe(false);
        expect(getErrorCategory(ErrorCode.NOT_PROJECT_OWNER)).toBe('project');
    });

    it('decides on the START of the code, not the end', () => {
        // Every category arm reads a prefix. A code whose name merely contains a
        // category word must not be pulled into it.
        expect(getErrorCategory(ErrorCode.PREREQ_NODE_VERSION_MISSING)).toBe('prereq');
        expect(getErrorCategory(ErrorCode.AUTH_NO_APP_BUILDER)).toBe('auth');
    });

    it('gives every declared code a category', () => {
        const uncategorised = Object.values(ErrorCode).filter((code) => !getErrorCategory(code));
        expect(uncategorised).toStrictEqual([]);
    });
});

describe('isRecoverableError', () => {
    it.each([
        ErrorCode.TIMEOUT,
        ErrorCode.NETWORK,
        ErrorCode.RATE_LIMITED,
        ErrorCode.AUTH_REQUIRED,
        ErrorCode.AUTH_EXPIRED,
        ErrorCode.PREREQ_NOT_INSTALLED,
        ErrorCode.PREREQ_NODE_VERSION_MISSING,
    ])('%s is retryable', (code) => {
        expect(isRecoverableError(code)).toBe(true);
    });

    it.each([
        ErrorCode.UNKNOWN,
        ErrorCode.CANCELLED,
        ErrorCode.AUTH_FORBIDDEN,
        ErrorCode.MESH_DEPLOY_FAILED,
        ErrorCode.PROJECT_EXISTS,
        ErrorCode.CONFIG_PARSE_ERROR,
    ])('%s is NOT retryable', (code) => {
        expect(isRecoverableError(code)).toBe(false);
    });

    it('the retryable set is exactly seven codes wide', () => {
        // A guard on the set as a whole: emptying it, or widening it to
        // everything, both leave the per-code assertions above only half wrong.
        const retryable = Object.values(ErrorCode).filter(isRecoverableError);
        expect(retryable).toHaveLength(7);
    });
});

describe('getErrorTitle', () => {
    it('gives every declared code a non-empty title', () => {
        const untitled = Object.values(ErrorCode).filter((code) => !getErrorTitle(code));
        expect(untitled).toStrictEqual([]);
    });

    it('falls back to a generic title for a code that is not in the table', () => {
        const unmapped = 'NOT_A_REAL_CODE' as ErrorCode;
        expect(getErrorTitle(unmapped)).toBe('Error');
    });
});

describe('ErrorCode.ORG_MISMATCH', () => {
    // Signals that the Adobe CLI is targeting a different organization than the
    // operation needs. User-recoverable in the UI (pick a different org /
    // re-login) but it MUST NOT be in the auto-retry recoverable set — an agent
    // retrying the identical call would 403 into the same wrong org.
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
        expect(isRecoverableError(ErrorCode.ORG_MISMATCH)).toBe(false);
    });
});
